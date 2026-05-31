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
        const html = (0, PreviewPanel_1.wrapHtml)(viewLabel ?? viewId, `<h1>${(0, PreviewPanel_1.esc)(viewLabel ?? viewId)}</h1>
       <div class="rendered-markdown">${(0, PreviewPanel_1.markdownToHtml)(payload.rendered)}</div>`);
        PreviewPanel_1.PreviewPanel.show(context, `render:${viewId}`, viewLabel ?? viewId, html);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Render failed: ${msg}`);
    }
}
// ---- Note preview ----
async function previewNote(context, cli, repoPath, id) {
    const payload = await cli.runOk(repoPath, ["note", "get", id]);
    const { note } = payload;
    const tags = (note.tags ?? []).map((t) => `<span class="tag">${(0, PreviewPanel_1.esc)(t)}</span>`).join(" ");
    const meta = [
        note.createdAt ? `Created: ${(0, PreviewPanel_1.esc)(note.createdAt.slice(0, 10))}` : "",
        tags,
    ].filter(Boolean).join(" &nbsp;·&nbsp; ");
    const sections = (note.sections ?? []).map((s) => `
    <div class="section">
      <div class="section-name">${(0, PreviewPanel_1.esc)(s.label ?? s.name)}</div>
      <div>${(0, PreviewPanel_1.markdownToHtml)(s.content)}</div>
    </div>`).join("");
    const html = (0, PreviewPanel_1.wrapHtml)(note.title, `
    <h1>${(0, PreviewPanel_1.esc)(note.title)}</h1>
    <div class="meta">${meta}</div>
    ${sections || '<p class="empty">No sections.</p>'}
  `);
    PreviewPanel_1.PreviewPanel.show(context, `note:${id}`, note.title, html);
}
// ---- Record preview ----
async function previewRecord(context, cli, repoPath, id) {
    const payload = await cli.runOk(repoPath, ["record", "get", id]);
    const { record } = payload;
    // Fetch type to get displayLabels
    let labelMap = new Map();
    try {
        const typePayload = await cli.runOk(repoPath, ["type", "get", record.typeId]);
        for (const f of typePayload.type.fields) {
            labelMap.set(f.fieldId, f.displayLabel ?? f.fieldId.slice(0, 8));
        }
    }
    catch {
        // If type fetch fails, fall back to fieldId
    }
    const title = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
    const rows = record.fieldValues
        .map((fv) => {
        const label = labelMap.get(fv.fieldId) ?? fv.fieldId.slice(0, 8);
        const value = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
        return `<div class="field-row">
        <div class="field-label">${(0, PreviewPanel_1.esc)(label)}</div>
        <div class="field-value">${(0, PreviewPanel_1.esc)(value)}</div>
      </div>`;
    })
        .join("");
    const meta = record.createdAt ? `Created: ${(0, PreviewPanel_1.esc)(record.createdAt.slice(0, 10))}` : "";
    const html = (0, PreviewPanel_1.wrapHtml)(title, `
    <h1>${(0, PreviewPanel_1.esc)(title)}</h1>
    <div class="meta">${(0, PreviewPanel_1.esc)(record.instanceId.slice(0, 8))}… &nbsp;·&nbsp; ${meta}</div>
    <h2>Fields</h2>
    ${rows || '<p class="empty">No field values.</p>'}
  `);
    PreviewPanel_1.PreviewPanel.show(context, `record:${id}`, title, html);
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
//# sourceMappingURL=previewCommands.js.map