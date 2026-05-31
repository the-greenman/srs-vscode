"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPreviewCommands = registerPreviewCommands;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
const SrsTreeDataProvider_1 = require("../tree/SrsTreeDataProvider");
const PreviewPanel_1 = require("../preview/PreviewPanel");
// ---- Registration ----
function registerPreviewCommands(context, cli, repoProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.previewEntity", (node) => cmdPreviewEntity(context, cli, repoProvider, node)), vscode.commands.registerCommand("srs.previewRender", (node) => cmdPreviewRender(context, cli, repoProvider, node)));
}
// ---- Dispatch ----
async function cmdPreviewEntity(context, cli, repoProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode))
        return;
    const repo = repoProvider.active;
    if (!repo)
        return;
    try {
        switch (node.entityKind) {
            case "note": return await previewNote(context, cli, repo.rootPath, node.entityId);
            case "record": return await previewRecord(context, cli, repo.rootPath, node.entityId);
            case "container": return await previewContainer(context, cli, repo.rootPath, node.entityId);
            default:
                vscode.window.showInformationMessage(`SRS: No preview available for '${node.entityKind}'. Use Open Entity for raw JSON.`);
        }
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Preview failed: ${msg}`);
    }
}
async function cmdPreviewRender(context, cli, repoProvider, node) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    // If invoked from context menu on a document-view node, use that ID directly.
    // Otherwise show a quick pick.
    let viewId;
    let viewLabel;
    if (node instanceof SrsTreeDataProvider_1.EntityNode && node.entityKind === "document-view") {
        viewId = node.entityId;
        viewLabel = String(node.label);
    }
    else {
        let views;
        try {
            const payload = await cli.runOk(repo.rootPath, [
                "document-view",
                "list",
            ]);
            views = payload.documentViews;
        }
        catch (err) {
            const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
            vscode.window.showErrorMessage(`SRS: Failed to list document views: ${msg}`);
            return;
        }
        if (views.length === 0) {
            vscode.window.showWarningMessage("SRS: No document views defined in this repository.");
            return;
        }
        const picked = await vscode.window.showQuickPick(views.map((v) => ({ label: `${v.namespace}/${v.name}`, description: v.id, view: v })), { placeHolder: "Select a document view to render" });
        if (!picked)
            return;
        viewId = picked.view.id;
        viewLabel = picked.label;
    }
    try {
        const payload = await cli.runOk(repo.rootPath, [
            "render",
            "document-view",
            "--view",
            viewId,
        ]);
        await openMarkdownPreview(payload.rendered, viewLabel ?? viewId);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Render failed: ${msg}`);
    }
}
// ---- Note preview ----
async function previewNote(_context, cli, repoPath, id) {
    const payload = await cli.runOk(repoPath, ["note", "get", id]);
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
async function previewRecord(context, cli, repoPath, id) {
    const payload = await cli.runOk(repoPath, ["record", "get", id]);
    const { record } = payload;
    // Fetch type, relations, and entity lists in parallel
    let labelMap = new Map();
    let repeatableSet = new Set();
    let textFieldSet = new Set();
    let relatedItems = [];
    const [typeResult, relResult, noteResult, recordListResult] = await Promise.allSettled([
        cli.runOk(repoPath, ["type", "get", record.typeId]),
        cli.runOk(repoPath, ["relation", "list"]),
        cli.runOk(repoPath, ["note", "list"]),
        cli.runOk(repoPath, ["record", "list"]),
    ]);
    if (typeResult.status === "fulfilled") {
        const typeFields = typeResult.value.type.fields;
        for (const f of typeFields) {
            labelMap.set(f.fieldId, f.displayLabel ?? f.fieldId.slice(0, 8));
            if (f.repeatable)
                repeatableSet.add(f.fieldId);
        }
        // Fetch field definitions in parallel to get valueType
        const fieldResults = await Promise.allSettled(typeFields.map((f) => cli.runOk(repoPath, ["field", "get", f.fieldId])));
        for (const fr of fieldResults) {
            if (fr.status === "fulfilled" && fr.value.field.valueType === "text") {
                textFieldSet.add(fr.value.field.id);
            }
        }
    }
    if (relResult.status === "fulfilled") {
        const peerLabelMap = new Map();
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
            }
            else if (rel.targetId === id) {
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
        let valueHtml;
        if (repeatableSet.has(fv.fieldId) && fv.entries && fv.entries.length > 0) {
            const items = fv.entries
                .map((e) => {
                const v = typeof e.value === "string" ? e.value : JSON.stringify(e.value);
                return isText
                    ? `<li class="markdown-value" data-md="${(0, PreviewPanel_1.esc)(v)}"></li>`
                    : `<li>${(0, PreviewPanel_1.esc)(v)}</li>`;
            })
                .join("");
            valueHtml = `<ul class="repeatable-values">${items}</ul>`;
        }
        else {
            const v = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
            valueHtml = isText
                ? `<div class="markdown-value" data-md="${(0, PreviewPanel_1.esc)(v)}"></div>`
                : (0, PreviewPanel_1.esc)(v);
        }
        const rowClass = isText ? "field-row field-row--text" : "field-row";
        return `<div class="${rowClass}">
        <div class="field-label">${(0, PreviewPanel_1.esc)(label)}</div>
        <div class="field-value">${valueHtml}</div>
      </div>`;
    })
        .join("");
    const meta = record.createdAt ? `Created: ${(0, PreviewPanel_1.esc)(record.createdAt.slice(0, 10))}` : "";
    const relationsHtml = relatedItems.length === 0
        ? '<p class="empty">No relations.</p>'
        : relatedItems.map((r) => {
            const arrow = r.direction === "outgoing" ? "→" : "←";
            const dirLabel = r.direction === "outgoing" ? "to" : "from";
            return `<div class="relation-row">
          <span class="rel-arrow">${arrow}</span>
          <span class="rel-type">${(0, PreviewPanel_1.esc)(r.relationType)}</span>
          <a class="rel-link" href="#" data-id="${(0, PreviewPanel_1.esc)(r.peerId)}" data-kind="${(0, PreviewPanel_1.esc)(r.peerKind)}" title="${(0, PreviewPanel_1.esc)(r.peerId)}">${(0, PreviewPanel_1.esc)(r.peerLabel)}</a>
        </div>`;
        }).join("");
    const html = (0, PreviewPanel_1.wrapHtml)(title, `
    <h1>${(0, PreviewPanel_1.esc)(title)}</h1>
    <div class="meta">${(0, PreviewPanel_1.esc)(record.instanceId.slice(0, 8))}… &nbsp;·&nbsp; ${meta}</div>
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
    PreviewPanel_1.PreviewPanel.show(context, `record:${id}`, title, html, {
        enableScripts: true,
        onMessage: (msg) => {
            const m = msg;
            if (m.type === "openEntity" && m.id && m.kind) {
                vscode.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
            }
        },
    });
}
// ---- Container preview ----
async function previewContainer(context, cli, repoPath, id) {
    // Get container details from container list (no container get payload shape with title)
    const listPayload = await cli.runOk(repoPath, ["container", "list"]);
    const container = listPayload.containers.find((c) => c.containerId === id);
    const title = container?.title ?? id.slice(0, 8);
    let members = [];
    try {
        const membersPayload = await cli.runOk(repoPath, [
            "container",
            "members",
            "list",
            id,
        ]);
        members = membersPayload.members;
    }
    catch {
        // members list unsupported or empty — show empty state
    }
    const rows = members
        .map((m) => `<div class="member-row">${(0, PreviewPanel_1.esc)(m.title ?? m.instanceId)}</div>`)
        .join("");
    const html = (0, PreviewPanel_1.wrapHtml)(title, `
    <h1>${(0, PreviewPanel_1.esc)(title)}</h1>
    <div class="meta">${container?.containerType ? `Type: ${(0, PreviewPanel_1.esc)(container.containerType)} &nbsp;·&nbsp; ` : ""}${members.length} members</div>
    <h2>Members</h2>
    ${rows || '<p class="empty">No members.</p>'}
  `);
    PreviewPanel_1.PreviewPanel.show(context, `container:${id}`, title, html);
}
// ---- Markdown helper ----
/**
 * Open markdown content in VS Code's built-in markdown preview.
 * Creates an untitled document with language "markdown" then calls
 * markdown.showPreview so the full VS Code markdown renderer handles it —
 * syntax-highlighted code blocks, proper heading structure, tables, etc.
 */
async function openMarkdownPreview(markdown, _title) {
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
function markdownRendererScript() {
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
//# sourceMappingURL=previewCommands.js.map