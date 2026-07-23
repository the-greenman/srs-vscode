import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { AttentionManager } from "../container/AttentionManager";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import { DocViewNode } from "../tree/NavigatorTreeDataProvider";
import { PreviewPanel, wrapHtml, esc } from "../preview/PreviewPanel";
import type {
  DocumentViewListPayload,
  ContainerListPayload,
  ContainerResolveViewPayload,
  RelationListPayload,
  NoteListPayload,
  RecordListPayload,
  ProtocolStagesPayload,
  BlueprintStructurePayload,
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

interface FieldPayload {
  field: {
    id: string;
    name: string;
    namespace: string;
    valueType: string;
  };
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
  attention: AttentionManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "srs.previewEntity",
      (node: unknown) => cmdPreviewEntity(context, cli, repoProvider, node),
    ),
    vscode.commands.registerCommand(
      "srs.previewRender",
      (node: unknown) => cmdPreviewRender(context, cli, repoProvider, attention, node),
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
      case "protocol":  return await previewProtocol(context, cli, repo.rootPath, node.entityId);
      case "blueprint": return await previewBlueprint(context, cli, repo.rootPath, node.entityId);
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

/**
 * Resolve the container context for a render invocation, used to type-filter the
 * document-view picker. A container node names itself; a record/note (or a
 * palette invocation) resolves to the active "scoped" container if one is set.
 * Returns undefined when there is no container context.
 */
function resolveContainerContext(
  node: unknown,
  attention: AttentionManager,
): string | undefined {
  if (node instanceof EntityNode && node.entityKind === "container") {
    return node.entityId;
  }
  return attention.active?.containerId;
}

/** Extract the view id + label when render was invoked directly on a document-view node. */
function directRenderTarget(node: unknown): { viewId: string; viewLabel: string } | undefined {
  if (node instanceof DocViewNode) {
    return { viewId: node.viewId, viewLabel: String(node.label) };
  }
  if (node instanceof EntityNode && node.entityKind === "document-view") {
    return { viewId: node.entityId, viewLabel: String(node.label) };
  }
  return undefined;
}

async function cmdPreviewRender(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  node: unknown,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage("SRS: No active repository.");
    return;
  }

  let viewId: string | undefined;
  let viewLabel: string | undefined;
  let selectedContainerType: string | undefined;

  const direct = directRenderTarget(node);
  if (direct) {
    // Render invoked directly on a document-view node (main tree or Navigator) — no picker.
    viewId = direct.viewId;
    viewLabel = direct.viewLabel;
    // Best-effort containerType lookup from the full list (non-fatal if it fails).
    try {
      const payload = await cli.runOk<DocumentViewListPayload>(repo.rootPath, [
        "document-view",
        "list",
      ]);
      selectedContainerType = payload.documentViews.find((v) => v.id === viewId)?.containerType;
    } catch {
      // fall through — render without a container is still valid
    }
  } else {
    // Picker path. Type-aware: when there is container context, offer only the
    // views applicable to that container's root type; otherwise (or when nothing
    // applies) fall back to the full list so the user is never stranded.
    const containerCtxId = resolveContainerContext(node, attention);
    let views: DocumentViewListPayload["documentViews"] = [];
    try {
      if (containerCtxId) {
        const filtered = await cli.runOk<DocumentViewListPayload>(repo.rootPath, [
          "document-view",
          "list-for-container",
          containerCtxId,
        ]);
        views = filtered.documentViews;
      }
      if (views.length === 0) {
        const full = await cli.runOk<DocumentViewListPayload>(repo.rootPath, [
          "document-view",
          "list",
        ]);
        views = full.documentViews;
      }
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
      views.map((v) => ({
        label: `${v.namespace}/${v.name}`,
        description: `v${v.version}`,
        detail: v.id,
        view: v,
      })),
      {
        placeHolder: "Select a document view to render",
        matchOnDescription: true,
        matchOnDetail: true,
      },
    );
    if (!picked) return;
    viewId = picked.view.id;
    viewLabel = picked.label;
    selectedContainerType = picked.view.containerType;
  }

  // If the view targets a container type, ask the user which container to render
  let containerId: string | undefined;
  if (selectedContainerType) {
    let containers: ContainerListPayload["containers"];
    try {
      const containerPayload = await cli.runOk<ContainerListPayload>(repo.rootPath, [
        "container",
        "list",
      ]);
      containers = containerPayload.containers.filter(
        (c) => c.containerType === selectedContainerType,
      );
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      vscode.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
      return;
    }

    if (containers.length === 0) {
      vscode.window.showWarningMessage(
        `SRS: No containers of type "${selectedContainerType}" found.`,
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      containers.map((c) => ({ label: c.title, description: c.containerId, id: c.containerId })),
      { placeHolder: `Select a ${selectedContainerType} to render` },
    );
    if (!picked) return;
    containerId = picked.id;
  }

  try {
    const args = ["render", "document-view", "--view", viewId];
    if (containerId) args.push("--container", containerId);
    const payload = await cli.runOk<RenderPayload>(repo.rootPath, args);
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
  let textFieldSet = new Set<string>();
  let relatedItems: Array<{ relationId: string; relationType: string; direction: "outgoing" | "incoming"; peerId: string; peerLabel: string; peerKind: string }> = [];

  const [typeResult, relResult, noteResult, recordListResult] = await Promise.allSettled([
    cli.runOk<TypePayload>(repoPath, ["type", "get", record.typeId]),
    cli.runOk<RelationListPayload>(repoPath, ["relation", "list"]),
    cli.runOk<NoteListPayload>(repoPath, ["note", "list"]),
    cli.runOk<RecordListPayload>(repoPath, ["record", "list"]),
  ]);

  if (typeResult.status === "fulfilled") {
    const typeFields = typeResult.value.type.fields;
    for (const f of typeFields) {
      if (f.repeatable) repeatableSet.add(f.fieldId);
    }
    // Fetch field definitions in parallel to get valueType and field name for labeling
    const fieldResults = await Promise.allSettled(
      typeFields.map((f) => cli.runOk<FieldPayload>(repoPath, ["field", "get", f.fieldId]))
    );
    for (let i = 0; i < typeFields.length; i++) {
      const f = typeFields[i];
      const fr = fieldResults[i];
      const fieldName = fr.status === "fulfilled" ? fr.value.field.name : undefined;
      labelMap.set(f.fieldId, f.displayLabel ?? fieldName ?? f.fieldId.slice(0, 8));
      if (fr.status === "fulfilled" && fr.value.field.valueType === "text") {
        textFieldSet.add(fr.value.field.id);
      }
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
        peerLabelMap.set(r.instanceId, { label: r.displayLabel, kind: "record" });
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
      const isText = textFieldSet.has(fv.fieldId);
      let valueHtml: string;
      if (repeatableSet.has(fv.fieldId) && fv.entries && fv.entries.length > 0) {
        const items = fv.entries
          .map((e) => {
            const v = typeof e.value === "string" ? e.value : JSON.stringify(e.value);
            return isText
              ? `<li class="markdown-value" data-md="${esc(v)}"></li>`
              : `<li>${esc(v)}</li>`;
          })
          .join("");
        valueHtml = `<ul class="repeatable-values">${items}</ul>`;
      } else {
        const v = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
        valueHtml = isText
          ? `<div class="markdown-value" data-md="${esc(v)}"></div>`
          : esc(v);
      }
      const rowClass = isText ? "field-row field-row--text" : "field-row";
      return `<div class="${rowClass}">
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
      ${markdownRendererScript()}
      document.querySelectorAll('.markdown-value').forEach(function(el) {
        el.innerHTML = renderMarkdown(el.dataset.md || '');
      });
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
  // Use container resolve-view for structured column output (RFC-020, ADR-023).
  // Falls back to a flat member list when resolve-view is unavailable.
  let resolvedView: ContainerResolveViewPayload["containerView"] | undefined;
  try {
    const viewPayload = await cli.runOk<ContainerResolveViewPayload>(repoPath, [
      "container",
      "resolve-view",
      id,
    ]);
    resolvedView = viewPayload.containerView;
  } catch {
    // Older CLI or unavailable — fall through to flat list below.
  }

  // Title from the root member's displayLabel, or fallback to id.
  const title = resolvedView?.root?.displayLabel ?? resolvedView?.members[0]?.displayLabel ?? id.slice(0, 8);
  const members = resolvedView?.members ?? [];
  const columns = resolvedView?.columns ?? [];

  let bodyHtml: string;

  if (columns.length > 0) {
    // Structured table view with DocumentView columns.
    // The identity column (isIdentityColumn=true) is rendered as a bold title link.
    const headerCells = columns
      .map((col) => {
        const cls = col.isIdentityColumn ? " class=\"col-identity\"" : "";
        return `<th${cls}>${esc(col.displayLabel)}</th>`;
      })
      .join("");

    const rowsHtml = members.length === 0
      ? `<tr><td colspan="${columns.length}" class="empty">No members.</td></tr>`
      : members.map((m) => {
          const hidden = !m.isVisibleByDefault ? " class=\"member-hidden\"" : "";
          const cells = columns.map((col) => {
            let cellContent: string;
            if (col.isIdentityColumn) {
              // Identity column: render as a clickable link to the entity.
              const label = m.tier === 2 && m.record
                ? (m.record.fieldValues.find((fv) => fv.fieldId === col.fieldId)?.value as string | undefined) ?? m.displayLabel
                : m.displayLabel;
              cellContent = `<a class="identity-link" href="#" data-id="${esc(m.instanceId)}" data-kind="${m.tier === 0 ? "note" : "record"}">${esc(label)}</a>`;
            } else if (m.tier === 2 && m.record) {
              const fv = m.record.fieldValues.find((f) => f.fieldId === col.fieldId);
              cellContent = fv !== undefined ? esc(String(fv.value ?? "")) : "";
            } else {
              cellContent = "";
            }
            const cellCls = col.isIdentityColumn ? " class=\"col-identity\"" : "";
            return `<td${cellCls}>${cellContent}</td>`;
          }).join("");
          return `<tr${hidden}>${cells}</tr>`;
        }).join("");

    const hiddenCount = members.filter((m) => !m.isVisibleByDefault).length;
    const hiddenNote = hiddenCount > 0
      ? `<p class="hidden-note">${hiddenCount} member${hiddenCount === 1 ? "" : "s"} hidden by lifecycle state.</p>`
      : "";

    bodyHtml = `
      <table class="container-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${hiddenNote}
      <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.identity-link').forEach(function(el) {
          el.addEventListener('click', function(ev) {
            ev.preventDefault();
            vscode.postMessage({ type: 'openEntity', id: el.dataset.id, kind: el.dataset.kind });
          });
        });
      </script>
    `;
  } else {
    // Flat list fallback: no DocumentView columns resolved.
    const rows = members
      .map((m) => `<div class="member-row">${esc(m.displayLabel)}</div>`)
      .join("");
    bodyHtml = rows || '<p class="empty">No members.</p>';
  }

  const memberCount = members.length;
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${memberCount} member${memberCount === 1 ? "" : "s"}</div>
    <h2>Members</h2>
    ${bodyHtml}
    <style>
      .container-table { width: 100%; border-collapse: collapse; margin-top: 0.5em; }
      .container-table th, .container-table td { padding: 0.35em 0.6em; border: 1px solid var(--vscode-panel-border, #555); text-align: left; }
      .container-table th { background: var(--vscode-editor-selectionBackground, #264f78); font-weight: 600; }
      .container-table th.col-identity { font-weight: 700; }
      .container-table td.col-identity { font-weight: 600; }
      .identity-link { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
      .identity-link:hover { text-decoration: underline; }
      .member-hidden { opacity: 0.45; }
      .hidden-note { font-size: 0.85em; color: var(--vscode-descriptionForeground, #888); margin-top: 0.5em; }
    </style>
  `, { enableScripts: columns.length > 0 });

  PreviewPanel.show(context, `container:${id}`, title, html, columns.length > 0 ? {
    enableScripts: true,
    onMessage: (msg: unknown) => {
      const m = msg as { type?: string; id?: string; kind?: string };
      if (m.type === "openEntity" && m.id && m.kind) {
        vscode.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
      }
    },
  } : undefined);
}

// ---- Protocol preview ----

interface ProtocolGetPayload {
  protocol: {
    instanceId?: string;
    protocolId?: string;
    namespace?: string;
    name?: string;
    version?: number;
    description?: string;
    targetType?: string;
    tags?: string[];
  };
}

async function previewProtocol(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
): Promise<void> {
  const [getResult, stagesResult] = await Promise.allSettled([
    cli.runOk<ProtocolGetPayload>(repoPath, ["protocol", "get", id]),
    cli.runOk<ProtocolStagesPayload>(repoPath, ["protocol", "stages", id]),
  ]);

  const proto = getResult.status === "fulfilled" ? getResult.value.protocol : undefined;
  const stages = stagesResult.status === "fulfilled"
    ? [...stagesResult.value.stages].sort((a, b) => a.order - b.order)
    : [];

  const ns = proto?.namespace ?? "";
  const name = proto?.name ?? id.slice(0, 8);
  const version = proto?.version ?? "";
  const title = `${ns}/${name} v${version}`;

  const descHtml = proto?.description ? `<p class="description">${esc(proto.description)}</p>` : "";
  const targetHtml = proto?.targetType ? `<div class="meta">Target type: ${esc(proto.targetType)}</div>` : "";
  const tagsHtml = (proto?.tags ?? []).length > 0
    ? `<div class="meta">Tags: ${(proto!.tags!).map((t) => `<code>${esc(t)}</code>`).join(" ")}</div>`
    : "";

  const stagesHtml = stages.length === 0
    ? '<p class="empty">No stages defined.</p>'
    : stages.map((s) => {
        const deps = s.dependsOn.length > 0
          ? `<div class="stage-deps">depends on: ${s.dependsOn.map((d) => esc(d)).join(", ")}</div>`
          : "";
        return `<div class="stage-row">
          <span class="stage-order">${s.order}</span>
          <div class="stage-body">
            <div class="stage-name">${esc(s.name)}</div>
            ${deps}
          </div>
        </div>`;
      }).join("");

  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(id.slice(0, 8))}…</div>
    ${targetHtml}
    ${tagsHtml}
    ${descHtml}
    <h2>Stages (${stages.length})</h2>
    ${stagesHtml}
  `);

  PreviewPanel.show(context, `protocol:${id}`, title, html);
}

// ---- Blueprint preview ----

interface BlueprintGetPayload {
  blueprint: {
    id?: string;
    namespace?: string;
    name?: string;
    version?: number;
    description?: string;
    rootTypeCount?: number;
    rootTypes?: Array<{ id: string; name?: string }>;
  };
}

async function previewBlueprint(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
): Promise<void> {
  const [getResult, structureResult] = await Promise.allSettled([
    cli.runOk<BlueprintGetPayload>(repoPath, ["blueprint", "get", id]),
    cli.runOk<BlueprintStructurePayload>(repoPath, ["blueprint", "structure", id]),
  ]);

  const bp = getResult.status === "fulfilled" ? getResult.value.blueprint : undefined;
  const specs = structureResult.status === "fulfilled" ? structureResult.value.relationSpecs : [];

  const ns = bp?.namespace ?? "";
  const name = bp?.name ?? id.slice(0, 8);
  const version = bp?.version ?? "";
  const title = `${ns}/${name} v${version}`;

  const descHtml = bp?.description ? `<p class="description">${esc(bp.description)}</p>` : "";

  const specsHtml = specs.length === 0
    ? '<p class="empty">No relation specs defined.</p>'
    : `<table class="specs-table">
        <thead><tr><th>Relation type</th><th>Source type</th><th>Target type</th><th>Cardinality</th><th>Required</th></tr></thead>
        <tbody>
          ${specs.map((s) => `<tr>
            <td>${esc(s.relationType)}</td>
            <td><code>${esc(s.sourceTypeId.slice(0, 8))}…</code></td>
            <td><code>${esc(s.targetTypeId.slice(0, 8))}…</code></td>
            <td>${s.cardinality ? esc(s.cardinality) : "—"}</td>
            <td>${s.required ? "yes" : "—"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;

  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(id.slice(0, 8))}…</div>
    ${descHtml}
    <h2>Structure (${specs.length} relation spec${specs.length === 1 ? "" : "s"})</h2>
    ${specsHtml}
  `);

  PreviewPanel.show(context, `blueprint:${id}`, title, html);
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

// ---- Inline markdown renderer (injected into record preview webview) ----
// Returned as a string so it avoids TypeScript template-literal escape issues.
function markdownRendererScript(): string {
  return [
    "function renderMarkdown(md) {",
    "  if (!md) return '';",
    "  var h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');",
    "  h = h.replace(/```[\\w]*\\n([\\s\\S]*?)```/g, function(_,c){ return '<pre><code>'+c+'</code></pre>'; });",
    "  h = h.replace(/^#{6}\\s+(.+)$/mg,'<h6>$1</h6>');",
    "  h = h.replace(/^#{5}\\s+(.+)$/mg,'<h5>$1</h5>');",
    "  h = h.replace(/^#{4}\\s+(.+)$/mg,'<h4>$1</h4>');",
    "  h = h.replace(/^#{3}\\s+(.+)$/mg,'<h3>$1</h3>');",
    "  h = h.replace(/^#{2}\\s+(.+)$/mg,'<h4>$1</h4>');",
    "  h = h.replace(/^#\\s+(.+)$/mg,'<h5>$1</h5>');",
    "  h = h.replace(/^---+$/mg,'<hr>');",
    "  h = h.replace(/`([^`]+)`/g,'<code>$1</code>');",
    "  h = h.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g,'<strong><em>$1</em></strong>');",
    "  h = h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');",
    "  h = h.replace(/\\*([^*]+)\\*/g,'<em>$1</em>');",
    "  h = h.replace(/((?:^[*-]\\s+.+$\\n?)+)/mg, function(b){",
    "    return '<ul>'+b.trim().split('\\n').map(function(l){return '<li>'+l.replace(/^[*-]\\s+/,'')+' </li>';}).join('')+'</ul>';",
    "  });",
    "  h = h.replace(/((?:^\\d+\\.\\s+.+$\\n?)+)/mg, function(b){",
    "    return '<ol>'+b.trim().split('\\n').map(function(l){return '<li>'+l.replace(/^\\d+\\.\\s+/,'')+' </li>';}).join('')+'</ol>';",
    "  });",
    "  h = h.replace(/(?:^(?!<)\\S[^\\n]*$\\n?)+/mg, function(b){",
    "    var t=b.trim(); return t ? '<p>'+t.replace(/\\n/g,' ')+'</p>' : '';",
    "  });",
    "  return h;",
    "}",
  ].join("\n");
}
