import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import { PreviewPanel, wrapHtml, esc } from "../preview/PreviewPanel";
import type {
  DocumentViewListPayload,
  ContainerListPayload,
  RelationListPayload,
  NoteListPayload,
  RecordListPayload,
} from "../cli/types";

// ---- Payload shapes (local — only what we need for rendering) ----

interface NotePayload {
  note: {
    instanceId: string;
    title: string;
    tags?: string[];
    createdAt?: string;
    sections?: Array<{ name: string; label?: string; content: string; tags?: string[] }>;
  };
}

interface RecordPayload {
  record: {
    instanceId: string;
    typeId: string;
    typeName: string;
    typeNamespace: string;
    typeVersion: number;
    createdAt?: string;
    fieldValues: Array<{
      fieldId: string;
      value: unknown;
      entries?: Array<{ value: unknown }>;
    }>;
  };
}

interface TypePayload {
  type: {
    id: string;
    name: string;
    namespace: string;
    version: number;
    fields: Array<{
      fieldId: string;
      displayLabel?: string;
      order: number;
      required: boolean;
      repeatable?: boolean;
    }>;
  };
}

interface ContainerMembersPayload {
  members: Array<{ instanceId: string; title?: string; kind?: string }>;
}

interface RenderPayload {
  rendered: string;
  diagnostics: string[];
}

// ---- Registration ----

export function registerPreviewCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "srs.previewEntity",
      (node: unknown) => cmdPreviewEntity(context, cli, repoProvider, node),
    ),
    vscode.commands.registerCommand(
      "srs.previewRender",
      (node: unknown) => cmdPreviewRender(context, cli, repoProvider, node),
    ),
  );
}

// ---- Dispatch ----

async function cmdPreviewEntity(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) return;
  const repo = repoProvider.active;
  if (!repo) return;

  try {
    switch (node.entityKind) {
      case "note":      return await previewNote(context, cli, repo.rootPath, node.entityId);
      case "record":    return await previewRecord(context, cli, repo.rootPath, node.entityId);
      case "container": return await previewContainer(context, cli, repo.rootPath, node.entityId);
      default:
        vscode.window.showInformationMessage(
          `SRS: No preview available for '${node.entityKind}'. Use Open Entity for raw JSON.`,
        );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Preview failed: ${msg}`);
  }
}

async function cmdPreviewRender(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  node: unknown,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage("SRS: No active repository.");
    return;
  }

  // If invoked from context menu on a document-view node, use that ID directly.
  // Otherwise show a quick pick.
  let viewId: string | undefined;
  let viewLabel: string | undefined;

  if (node instanceof EntityNode && node.entityKind === "document-view") {
    viewId = node.entityId;
    viewLabel = String(node.label);
  } else {
    let views: DocumentViewListPayload["documentViews"];
    try {
      const payload = await cli.runOk<DocumentViewListPayload>(repo.rootPath, [
        "document-view",
        "list",
      ]);
      views = payload.documentViews;
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      vscode.window.showErrorMessage(`SRS: Failed to list document views: ${msg}`);
      return;
    }

    if (views.length === 0) {
      vscode.window.showWarningMessage("SRS: No document views defined in this repository.");
      return;
    }

    const picked = await vscode.window.showQuickPick(
      views.map((v) => ({ label: `${v.namespace}/${v.name}`, description: v.id, view: v })),
      { placeHolder: "Select a document view to render" },
    );
    if (!picked) return;
    viewId = picked.view.id;
    viewLabel = picked.label;
  }

  try {
    const payload = await cli.runOk<RenderPayload>(repo.rootPath, [
      "render",
      "document-view",
      "--view",
      viewId,
    ]);

    await openMarkdownPreview(payload.rendered, viewLabel ?? viewId);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Render failed: ${msg}`);
  }
}

// ---- Note preview ----

async function previewNote(
  _context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
): Promise<void> {
  const payload = await cli.runOk<NotePayload>(repoPath, ["note", "get", id]);
  const { note } = payload;

  // Build a markdown document: title as h1, metadata, then sections
  const tagLine = (note.tags ?? []).map((t) => `\`${t}\``).join(" ");
  const metaLine = [
    note.createdAt ? `*${note.createdAt.slice(0, 10)}*` : "",
    tagLine,
  ].filter(Boolean).join("  ·  ");

  const sectionsMd = (note.sections ?? [])
    .map((s) => `## ${s.label ?? s.name}\n\n${s.content}`)
    .join("\n\n---\n\n");

  const md = [`# ${note.title}`, metaLine, sectionsMd || "*No sections.*"]
    .filter(Boolean)
    .join("\n\n");

  await openMarkdownPreview(md, note.title);
}

// ---- Record preview ----

async function previewRecord(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
): Promise<void> {
  const payload = await cli.runOk<RecordPayload>(repoPath, ["record", "get", id]);
  const { record } = payload;

  // Fetch type, relations, and entity lists in parallel
  let labelMap = new Map<string, string>();
  let repeatableSet = new Set<string>();
  let relatedItems: Array<{ relationId: string; relationType: string; direction: "outgoing" | "incoming"; peerId: string; peerLabel: string; peerKind: string }> = [];

  const [typeResult, relResult, noteResult, recordListResult] = await Promise.allSettled([
    cli.runOk<TypePayload>(repoPath, ["type", "get", record.typeId]),
    cli.runOk<RelationListPayload>(repoPath, ["relation", "list"]),
    cli.runOk<NoteListPayload>(repoPath, ["note", "list"]),
    cli.runOk<RecordListPayload>(repoPath, ["record", "list"]),
  ]);

  if (typeResult.status === "fulfilled") {
    for (const f of typeResult.value.type.fields) {
      labelMap.set(f.fieldId, f.displayLabel ?? f.fieldId.slice(0, 8));
      if (f.repeatable) repeatableSet.add(f.fieldId);
    }
  }

  if (relResult.status === "fulfilled") {
    const peerLabelMap = new Map<string, { label: string; kind: string }>();
    if (noteResult.status === "fulfilled") {
      for (const n of noteResult.value.notes) {
        peerLabelMap.set(n.instanceId, { label: n.title, kind: "note" });
      }
    }
    if (recordListResult.status === "fulfilled") {
      for (const r of recordListResult.value.records) {
        peerLabelMap.set(r.instanceId, { label: r.typeName, kind: "record" });
      }
    }

    for (const rel of relResult.value.relations) {
      if (rel.sourceId === id) {
        const peer = peerLabelMap.get(rel.targetId);
        relatedItems.push({
          relationId: rel.relationId,
          relationType: rel.relationType,
          direction: "outgoing",
          peerId: rel.targetId,
          peerLabel: peer?.label ?? rel.targetId.slice(0, 8),
          peerKind: peer?.kind ?? "note",
        });
      } else if (rel.targetId === id) {
        const peer = peerLabelMap.get(rel.sourceId);
        relatedItems.push({
          relationId: rel.relationId,
          relationType: rel.relationType,
          direction: "incoming",
          peerId: rel.sourceId,
          peerLabel: peer?.label ?? rel.sourceId.slice(0, 8),
          peerKind: peer?.kind ?? "note",
        });
      }
    }
  }

  const title = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;

  const rows = record.fieldValues
    .map((fv) => {
      const label = labelMap.get(fv.fieldId) ?? fv.fieldId.slice(0, 8);
      let valueHtml: string;
      if (repeatableSet.has(fv.fieldId) && fv.entries && fv.entries.length > 0) {
        const items = fv.entries
          .map((e) => {
            const v = typeof e.value === "string" ? e.value : JSON.stringify(e.value);
            return `<li>${esc(v)}</li>`;
          })
          .join("");
        valueHtml = `<ul class="repeatable-values">${items}</ul>`;
      } else {
        const v = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
        valueHtml = esc(v);
      }
      return `<div class="field-row">
        <div class="field-label">${esc(label)}</div>
        <div class="field-value">${valueHtml}</div>
      </div>`;
    })
    .join("");

  const meta = record.createdAt ? `Created: ${esc(record.createdAt.slice(0, 10))}` : "";

  const relationsHtml = relatedItems.length === 0
    ? '<p class="empty">No relations.</p>'
    : relatedItems.map((r) => {
        const arrow = r.direction === "outgoing" ? "→" : "←";
        const dirLabel = r.direction === "outgoing" ? "to" : "from";
        return `<div class="relation-row">
          <span class="rel-arrow">${arrow}</span>
          <span class="rel-type">${esc(r.relationType)}</span>
          <a class="rel-link" href="#" data-id="${esc(r.peerId)}" data-kind="${esc(r.peerKind)}" title="${esc(r.peerId)}">${esc(r.peerLabel)}</a>
        </div>`;
      }).join("");

  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(record.instanceId.slice(0, 8))}… &nbsp;·&nbsp; ${meta}</div>
    <h2>Fields</h2>
    ${rows || '<p class="empty">No field values.</p>'}
    <h2>Relations</h2>
    ${relationsHtml}
    <script>
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('.rel-link').forEach(function(el) {
        el.addEventListener('click', function(ev) {
          ev.preventDefault();
          vscode.postMessage({ type: 'openEntity', id: el.dataset.id, kind: el.dataset.kind });
        });
      });
    </script>
  `, { enableScripts: true });

  PreviewPanel.show(context, `record:${id}`, title, html, {
    enableScripts: true,
    onMessage: (msg: unknown) => {
      const m = msg as { type?: string; id?: string; kind?: string };
      if (m.type === "openEntity" && m.id && m.kind) {
        vscode.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
      }
    },
  });
}

// ---- Container preview ----

async function previewContainer(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
): Promise<void> {
  // Get container details from container list (no container get payload shape with title)
  const listPayload = await cli.runOk<ContainerListPayload>(repoPath, ["container", "list"]);
  const container = listPayload.containers.find((c) => c.containerId === id);
  const title = container?.title ?? id.slice(0, 8);

  let members: ContainerMembersPayload["members"] = [];
  try {
    const membersPayload = await cli.runOk<ContainerMembersPayload>(repoPath, [
      "container",
      "members",
      "list",
      id,
    ]);
    members = membersPayload.members;
  } catch {
    // members list unsupported or empty — show empty state
  }

  const rows = members
    .map((m) => `<div class="member-row">${esc(m.title ?? m.instanceId)}</div>`)
    .join("");

  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${container?.containerType ? `Type: ${esc(container.containerType)} &nbsp;·&nbsp; ` : ""}${members.length} members</div>
    <h2>Members</h2>
    ${rows || '<p class="empty">No members.</p>'}
  `);

  PreviewPanel.show(context, `container:${id}`, title, html);
}

// ---- Markdown helper ----

/**
 * Open markdown content in VS Code's built-in markdown preview.
 * Creates an untitled document with language "markdown" then calls
 * markdown.showPreview so the full VS Code markdown renderer handles it —
 * syntax-highlighted code blocks, proper heading structure, tables, etc.
 */
async function openMarkdownPreview(markdown: string, _title: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: "markdown",
  });
  // Show the source document first (needed so showPreview has a URI to work with)
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Active,
    preview: true,
    preserveFocus: false,
  });
  // Open the built-in markdown preview for this document
  await vscode.commands.executeCommand("markdown.showPreview", doc.uri);
}
