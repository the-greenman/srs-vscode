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
exports.registerEditCommands = registerEditCommands;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
const SrsTreeDataProvider_1 = require("../tree/SrsTreeDataProvider");
const EntityEditorPanel_1 = require("../webview/EntityEditorPanel");
const forms_1 = require("../webview/forms");
// ---- Registration ----
function registerEditCommands(context, cli, repoProvider, treeProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.editEntity", (node) => cmdEditEntity(context, cli, repoProvider, treeProvider, node)), vscode.commands.registerCommand("srs.createRelation", () => cmdCreateRelation(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.createRelationType", () => cmdCreateRelationType(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.updateRelationType", () => cmdUpdateRelationType(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.deleteRelationType", () => cmdDeleteRelationType(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.createView", () => cmdCreateView(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.updateView", () => cmdUpdateView(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.createDocumentView", () => cmdCreateDocumentView(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.updateDocumentView", () => cmdUpdateDocumentView(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.createTheme", () => cmdCreateTheme(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.updateTheme", () => cmdUpdateTheme(cli, repoProvider, treeProvider)));
}
// ---- Dispatch ----
async function cmdEditEntity(context, cli, repoProvider, treeProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode)) {
        vscode.window.showWarningMessage("SRS: Select an entity in the SRS tree to edit.");
        return;
    }
    const repo = repoProvider.active;
    if (!repo)
        return;
    try {
        switch (node.entityKind) {
            case "note":
                await editNote(context, cli, repo.rootPath, node.entityId, treeProvider);
                break;
            case "tag":
                await editTag(context, cli, repo.rootPath, node.entityId, treeProvider);
                break;
            case "record":
                await editRecord(context, cli, repo.rootPath, node.entityId, treeProvider);
                break;
            case "view":
                await editView(cli, repo.rootPath, node.entityId, treeProvider);
                break;
            case "document-view":
                await editDocumentView(cli, repo.rootPath, node.entityId, treeProvider);
                break;
            case "theme":
                await editTheme(cli, repo.rootPath, node.entityId, treeProvider);
                break;
            default:
                vscode.window.showInformationMessage(`SRS: No form editor for '${node.entityKind}'. Open the entity JSON to edit directly.`);
        }
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Edit failed: ${msg}`);
    }
}
// ---- Note editor ----
async function editNote(context, cli, repoPath, id, treeProvider) {
    const payload = await cli.runOk(repoPath, ["note", "get", id]);
    const note = payload.note;
    const noteData = {
        instanceId: note.instanceId,
        title: note.title,
        tags: note.tags,
        createdAt: note.createdAt,
        sections: note.sections,
    };
    const html = (0, forms_1.formWrapHtml)(note.title, (0, forms_1.buildNoteForm)(noteData));
    EntityEditorPanel_1.EntityEditorPanel.show(context, `note:${id}`, note.title, html, async (data) => {
        const d = data;
        // Concurrent-change guard
        const refetch = await cli.runOk(repoPath, ["note", "get", id]);
        if (refetch.note.title !== note.title) {
            const proceed = await vscode.window.showWarningMessage(`SRS: Note was modified since you opened it (title changed to "${refetch.note.title}"). Overwrite?`, { modal: true }, "Overwrite");
            if (proceed !== "Overwrite")
                return;
        }
        await cli.runOk(repoPath, ["note", "update", id], {
            stdin: JSON.stringify(d),
        });
        treeProvider.refresh();
    });
}
// ---- Tag editor ----
async function editTag(context, cli, repoPath, id, treeProvider) {
    const payload = await cli.runOk(repoPath, ["tag", "get", id]);
    const tag = payload.tagDefinition;
    const tagData = {
        instanceId: tag.instanceId,
        slug: tag.slug,
        label: tag.label,
        createdAt: tag.createdAt,
    };
    const html = (0, forms_1.formWrapHtml)(`Edit Tag: ${tag.slug}`, (0, forms_1.buildTagForm)(tagData));
    EntityEditorPanel_1.EntityEditorPanel.show(context, `tag:${id}`, `Edit Tag: ${tag.slug}`, html, async (data) => {
        const d = data;
        // Concurrent-change guard
        const refetch = await cli.runOk(repoPath, ["tag", "get", id]);
        if (refetch.tagDefinition.slug !== tag.slug) {
            const proceed = await vscode.window.showWarningMessage(`SRS: Tag was modified since you opened it. Overwrite?`, { modal: true }, "Overwrite");
            if (proceed !== "Overwrite")
                return;
        }
        await cli.runOk(repoPath, ["tag", "update", id], {
            stdin: JSON.stringify(d),
        });
        treeProvider.refresh();
    });
}
// ---- Record editor ----
async function editRecord(context, cli, repoPath, id, treeProvider) {
    const payload = await cli.runOk(repoPath, ["record", "get", id]);
    const record = payload.record;
    // Fetch type to get ordered field definitions with displayLabels
    const typePayload = await cli.runOk(repoPath, [
        "type",
        "get",
        record.typeId,
    ]);
    const typeFields = typePayload.type.fields;
    // Fetch field definitions in parallel to use field name as fallback label
    const fieldResults = await Promise.allSettled(typeFields.map((f) => cli.runOk(repoPath, ["field", "get", f.fieldId])));
    const recordData = {
        instanceId: record.instanceId,
        typeId: record.typeId,
        typeName: record.typeName,
        typeNamespace: record.typeNamespace,
        typeVersion: record.typeVersion,
        createdAt: record.createdAt,
        fieldValues: record.fieldValues,
    };
    const fieldData = typeFields.map((f, i) => {
        const fr = fieldResults[i];
        const fieldName = fr.status === "fulfilled" ? fr.value.field.name : undefined;
        return {
            fieldId: f.fieldId,
            displayLabel: f.displayLabel ?? fieldName,
            order: f.order,
            required: f.required,
            repeatable: f.repeatable,
            minItems: f.minItems,
            maxItems: f.maxItems,
        };
    });
    const panelTitle = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
    const html = (0, forms_1.formWrapHtml)(panelTitle, (0, forms_1.buildRecordForm)(recordData, fieldData));
    EntityEditorPanel_1.EntityEditorPanel.show(context, `record:${id}`, panelTitle, html, async (data) => {
        const d = data;
        // Concurrent-change guard
        const refetch = await cli.runOk(repoPath, ["record", "get", id]);
        if (refetch.record.fieldValues.length !== record.fieldValues.length) {
            const proceed = await vscode.window.showWarningMessage(`SRS: Record was modified since you opened it. Overwrite?`, { modal: true }, "Overwrite");
            if (proceed !== "Overwrite")
                return;
        }
        await cli.runOk(repoPath, ["record", "update", id], {
            stdin: JSON.stringify(d),
        });
        treeProvider.refresh();
    });
}
// ---- View CRUD ----
async function cmdCreateView(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const scaffold = JSON.stringify({
        $schema: "https://srs.semanticops.com/schema/2.0/view.json",
        id: randomUUID(),
        namespace: "com.example",
        name: "my-view",
        version: 1,
        description: "Description of what this view presents.",
        fieldViews: [],
        createdAt: new Date().toISOString(),
    }, null, 2);
    const doc = await vscode.workspace.openTextDocument({ content: scaffold, language: "json" });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage("SRS: Edit the view definition above, then click Create.", "Create", "Cancel");
    if (answer !== "Create")
        return;
    try {
        await cli.runOk(repo.rootPath, ["view", "create"], { stdin: doc.getText() });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: View created.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create view: ${msg}`);
    }
}
async function cmdUpdateView(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const picked = await pickView(cli, repo.rootPath);
    if (!picked)
        return;
    await editView(cli, repo.rootPath, picked.id, treeProvider);
}
async function editView(cli, repoPath, id, treeProvider) {
    const payload = await cli.runOk(repoPath, ["view", "get", id]);
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(payload.view, null, 2),
        language: "json",
    });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage(`SRS: Edit the view definition above, then click Update.`, "Update", "Cancel");
    if (answer !== "Update")
        return;
    try {
        await cli.runOk(repoPath, ["view", "update", id], { stdin: doc.getText() });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: View updated.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to update view: ${msg}`);
    }
}
// ---- Document View CRUD ----
async function cmdCreateDocumentView(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const scaffold = JSON.stringify({
        $schema: "https://srs.semanticops.com/schema/2.0/document-view.json",
        id: randomUUID(),
        namespace: "com.example",
        name: "my-document-view",
        version: 1,
        description: "Description of what document this produces.",
        sections: [],
        createdAt: new Date().toISOString(),
    }, null, 2);
    const doc = await vscode.workspace.openTextDocument({ content: scaffold, language: "json" });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage("SRS: Edit the document view definition above, then click Create.", "Create", "Cancel");
    if (answer !== "Create")
        return;
    try {
        await cli.runOk(repo.rootPath, ["document-view", "create"], { stdin: doc.getText() });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Document view created.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create document view: ${msg}`);
    }
}
async function cmdUpdateDocumentView(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const picked = await pickDocumentView(cli, repo.rootPath);
    if (!picked)
        return;
    await editDocumentView(cli, repo.rootPath, picked.id, treeProvider);
}
async function editDocumentView(cli, repoPath, id, treeProvider) {
    const payload = await cli.runOk(repoPath, ["document-view", "get", id]);
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(payload.documentView, null, 2),
        language: "json",
    });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage(`SRS: Edit the document view definition above, then click Update.`, "Update", "Cancel");
    if (answer !== "Update")
        return;
    try {
        await cli.runOk(repoPath, ["document-view", "update", id], { stdin: doc.getText() });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Document view updated.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to update document view: ${msg}`);
    }
}
// ---- Theme CRUD ----
async function cmdCreateTheme(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const scaffold = JSON.stringify({
        $schema: "https://srs.semanticops.com/schema/2.0/theme.json",
        id: randomUUID(),
        namespace: "com.example",
        name: "my-theme",
        version: 1,
        description: "Description of this theme and its intended output format.",
        targets: ["html"],
        createdAt: new Date().toISOString(),
    }, null, 2);
    const doc = await vscode.workspace.openTextDocument({ content: scaffold, language: "json" });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage("SRS: Edit the theme definition above, then click Create.", "Create", "Cancel");
    if (answer !== "Create")
        return;
    try {
        await cli.runOk(repo.rootPath, ["theme", "create"], { stdin: doc.getText() });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Theme created.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create theme: ${msg}`);
    }
}
async function cmdUpdateTheme(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const picked = await pickTheme(cli, repo.rootPath);
    if (!picked)
        return;
    await editTheme(cli, repo.rootPath, picked.id, treeProvider);
}
async function editTheme(cli, repoPath, id, treeProvider) {
    const payload = await cli.runOk(repoPath, ["theme", "get", id]);
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(payload.theme, null, 2),
        language: "json",
    });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage(`SRS: Edit the theme definition above, then click Update.`, "Update", "Cancel");
    if (answer !== "Update")
        return;
    try {
        await cli.runOk(repoPath, ["theme", "update", id], { stdin: doc.getText() });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Theme updated.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to update theme: ${msg}`);
    }
}
// ---- Relation creator ----
async function cmdCreateRelation(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    // 1. Pick relation type
    const pickedType = await pickRelationType(cli, repo.rootPath);
    if (!pickedType)
        return;
    // 2. Build instance list for source/target pickers
    // Combine notes and records into one searchable list
    const instanceItems = await buildInstanceItems(cli, repo.rootPath);
    if (instanceItems.length === 0) {
        vscode.window.showWarningMessage("SRS: No instances found to relate. Create some notes or records first.");
        return;
    }
    const source = await vscode.window.showQuickPick(instanceItems, {
        placeHolder: "Select source instance",
        matchOnDescription: true,
    });
    if (!source)
        return;
    const target = await vscode.window.showQuickPick(instanceItems.filter((i) => i.id !== source.id), { placeHolder: "Select target instance", matchOnDescription: true });
    if (!target)
        return;
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const relationJson = JSON.stringify({
        relationId: randomUUID(),
        relationType: pickedType.relationType,
        sourceInstanceId: source.id,
        targetInstanceId: target.id,
        createdAt: new Date().toISOString(),
    });
    try {
        await cli.runOk(repo.rootPath, ["relation", "create"], {
            stdin: relationJson,
        });
        treeProvider.refresh();
        vscode.window.showInformationMessage(`SRS: Relation '${pickedType.relationType}' created.`);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create relation: ${msg}`);
    }
}
// ---- Relation type CRUD ----
async function cmdCreateRelationType(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const scaffold = JSON.stringify({
        id: randomUUID(),
        version: 1,
        relationType: "namespace/name",
        namespace: "com.example",
        label: "My relation type",
        description: "Description of what this relation means.",
        category: "association",
        createdAt: new Date().toISOString(),
    }, null, 2);
    const doc = await vscode.workspace.openTextDocument({
        content: scaffold,
        language: "json",
    });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage("SRS: Edit the relation type definition above, then click Create.", "Create", "Cancel");
    if (answer !== "Create")
        return;
    const content = doc.getText();
    try {
        await cli.runOk(repo.rootPath, ["relation-type", "create"], {
            stdin: content,
        });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Relation type created.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create relation type: ${msg}`);
    }
}
async function cmdUpdateRelationType(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const picked = await pickRelationType(cli, repo.rootPath);
    if (!picked)
        return;
    const payload = await cli.runOk(repo.rootPath, [
        "relation-type",
        "get",
        picked.id,
    ]);
    const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify(payload.relationTypeDefinition, null, 2),
        language: "json",
    });
    await vscode.window.showTextDocument(doc);
    const answer = await vscode.window.showInformationMessage(`SRS: Edit '${picked.label}', then click Update.`, "Update", "Cancel");
    if (answer !== "Update")
        return;
    const content = doc.getText();
    try {
        await cli.runOk(repo.rootPath, ["relation-type", "update", picked.id], {
            stdin: content,
        });
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Relation type updated.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to update relation type: ${msg}`);
    }
}
async function cmdDeleteRelationType(cli, repoProvider, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository.");
        return;
    }
    const picked = await pickRelationType(cli, repo.rootPath);
    if (!picked)
        return;
    const confirm = await vscode.window.showWarningMessage(`SRS: Delete relation type '${picked.label}' (${picked.relationType})? This will fail if any stored relations reference it.`, { modal: true }, "Delete");
    if (confirm !== "Delete")
        return;
    try {
        await cli.runOk(repo.rootPath, ["relation-type", "delete", picked.id]);
        treeProvider.refresh();
        vscode.window.showInformationMessage("SRS: Relation type deleted.");
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to delete relation type: ${msg}`);
    }
}
async function pickRelationType(cli, repoPath) {
    let defs = [];
    try {
        const payload = await cli.runOk(repoPath, ["relation-type", "list"]);
        defs = payload.relationTypeDefinitions;
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Could not load relation types: ${msg}`);
        return undefined;
    }
    if (defs.length === 0) {
        vscode.window.showWarningMessage("SRS: No relation type definitions found in this repository.");
        return undefined;
    }
    const items = defs.map((rt) => ({
        label: rt.label,
        description: rt.relationType,
        id: rt.id,
        relationType: rt.relationType,
    }));
    return vscode.window.showQuickPick(items, { placeHolder: "Select relation type" });
}
async function pickView(cli, repoPath) {
    let views = [];
    try {
        const payload = await cli.runOk(repoPath, ["view", "list"]);
        views = payload.views;
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Could not load views: ${msg}`);
        return undefined;
    }
    if (views.length === 0) {
        vscode.window.showWarningMessage("SRS: No view definitions found in this repository.");
        return undefined;
    }
    const items = views.map((v) => ({
        label: `${v.namespace}/${v.name}`,
        description: v.id,
        id: v.id,
    }));
    return vscode.window.showQuickPick(items, { placeHolder: "Select view" });
}
async function pickDocumentView(cli, repoPath) {
    let views = [];
    try {
        const payload = await cli.runOk(repoPath, ["document-view", "list"]);
        views = payload.documentViews;
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Could not load document views: ${msg}`);
        return undefined;
    }
    if (views.length === 0) {
        vscode.window.showWarningMessage("SRS: No document view definitions found in this repository.");
        return undefined;
    }
    const items = views.map((v) => ({
        label: `${v.namespace}/${v.name}`,
        description: `v${v.version}`,
        id: v.id,
    }));
    return vscode.window.showQuickPick(items, { placeHolder: "Select document view" });
}
async function pickTheme(cli, repoPath) {
    let themes = [];
    try {
        const payload = await cli.runOk(repoPath, ["theme", "list"]);
        themes = payload.themes;
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Could not load themes: ${msg}`);
        return undefined;
    }
    if (themes.length === 0) {
        vscode.window.showWarningMessage("SRS: No theme definitions found in this repository.");
        return undefined;
    }
    const items = themes.map((t) => ({
        label: `${t.namespace}/${t.name}`,
        description: `v${t.version}`,
        id: t.id,
    }));
    return vscode.window.showQuickPick(items, { placeHolder: "Select theme" });
}
async function buildInstanceItems(cli, repoPath) {
    const items = [];
    try {
        const notes = await cli.runOk(repoPath, ["note", "list"]);
        for (const n of notes.notes) {
            items.push({ label: n.title, description: `note · ${n.instanceId.slice(0, 8)}`, id: n.instanceId });
        }
    }
    catch { /* ignore */ }
    try {
        const records = await cli.runOk(repoPath, ["record", "list"]);
        for (const r of records.records) {
            items.push({
                label: r.displayLabel,
                description: `record · ${r.instanceId.slice(0, 8)}`,
                id: r.instanceId,
            });
        }
    }
    catch { /* ignore */ }
    return items;
}
//# sourceMappingURL=editCommands.js.map