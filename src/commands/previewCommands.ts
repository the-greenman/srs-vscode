import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import { PreviewPanel, wrapHtml, esc } from "../preview/PreviewPanel";
import type {
  DocumentViewListPayload,
  ContainerListPayload,
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
    fieldValues: Array<{ fieldId: string; value: unknown }>;
  };
}

interface TypePayload {
  type: {
    id: string;
    name: string;
    namespace: string;
    version: number;
    fields: Array<{ fieldId: string; displayLabel?: string; order: number; required: boolean }>;
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

  // Fetch type to get displayLabels
  let labelMap = new Map<string, string>();
  try {
    const typePayload = await cli.runOk<TypePayload>(repoPath, ["type", "get", record.typeId]);
    for (const f of typePayload.type.fields) {
      labelMap.set(f.fieldId, f.displayLabel ?? f.fieldId.slice(0, 8));
    }
  } catch {
    // If type fetch fails, fall back to fieldId
  }

  const title = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;

  const rows = record.fieldValues
    .map((fv) => {
      const label = labelMap.get(fv.fieldId) ?? fv.fieldId.slice(0, 8);
      const value = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
      return `<div class="field-row">
        <div class="field-label">${esc(label)}</div>
        <div class="field-value">${esc(value)}</div>
      </div>`;
    })
    .join("");

  const meta = record.createdAt ? `Created: ${esc(record.createdAt.slice(0, 10))}` : "";

  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(record.instanceId.slice(0, 8))}… &nbsp;·&nbsp; ${meta}</div>
    <h2>Fields</h2>
    ${rows || '<p class="empty">No field values.</p>'}
  `);

  PreviewPanel.show(context, `record:${id}`, title, html);
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
