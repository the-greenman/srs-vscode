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
exports.registerMutationCommands = registerMutationCommands;
exports.cmdAddToContainer = cmdAddToContainer;
exports.cmdRemoveFromContainer = cmdRemoveFromContainer;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
const SrsTreeDataProvider_1 = require("../tree/SrsTreeDataProvider");
function registerMutationCommands(context, cli, repoProvider, attention, treeProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.createNote", () => cmdCreateNote(cli, repoProvider, attention, treeProvider)), vscode.commands.registerCommand("srs.createTag", () => cmdCreateTag(cli, repoProvider, treeProvider)), vscode.commands.registerCommand("srs.createRecord", () => cmdCreateRecord(cli, repoProvider, attention, treeProvider)), vscode.commands.registerCommand("srs.deleteEntity", (node) => cmdDeleteEntity(cli, repoProvider, treeProvider, node)));
}
// ---- helpers ----
function requireActiveRepo(repoProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
        return undefined;
    }
    return repo;
}
function containerId(attention) {
    return attention.active?.containerId;
}
// ---- Create Note ----
async function cmdCreateNote(cli, repoProvider, attention, treeProvider) {
    const repo = requireActiveRepo(repoProvider);
    if (!repo)
        return;
    const title = await vscode.window.showInputBox({
        title: "SRS: Create Note",
        prompt: "Note title",
        placeHolder: "e.g. Architecture Decision: Use CLI bridge",
        validateInput: (v) => (v.trim() ? undefined : "Title is required"),
    });
    if (!title)
        return;
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const instanceId = randomUUID();
    const now = new Date().toISOString();
    const noteJson = JSON.stringify({
        instanceId,
        title: title.trim(),
        sections: [{ name: "body", content: "", label: "Body" }],
        tags: [],
        createdAt: now,
    });
    try {
        const cid = containerId(attention);
        await cli.runOk(repo.rootPath, ["note", "create"], {
            stdin: noteJson,
            containerId: cid,
        });
        treeProvider.refresh();
        vscode.window.showInformationMessage(`SRS: Note '${title}' created.`);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create note: ${msg}`);
    }
}
// ---- Create Tag ----
async function cmdCreateTag(cli, repoProvider, treeProvider) {
    const repo = requireActiveRepo(repoProvider);
    if (!repo)
        return;
    const slug = await vscode.window.showInputBox({
        title: "SRS: Create Tag",
        prompt: "Tag slug (kebab-case identifier)",
        placeHolder: "e.g. needs-review",
        validateInput: (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim())
            ? undefined
            : "Slug must be kebab-case (e.g. my-tag)",
    });
    if (!slug)
        return;
    const label = await vscode.window.showInputBox({
        title: "SRS: Create Tag",
        prompt: "Display label (optional)",
        placeHolder: "e.g. Needs Review",
    });
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const instanceId = randomUUID();
    const now = new Date().toISOString();
    const tagJson = JSON.stringify({
        instanceId,
        slug: slug.trim(),
        label: label?.trim() || undefined,
        createdAt: now,
    });
    try {
        await cli.runOk(repo.rootPath, ["tag", "create"], {
            stdin: tagJson,
        });
        treeProvider.refresh();
        vscode.window.showInformationMessage(`SRS: Tag '${slug}' created.`);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create tag: ${msg}`);
    }
}
// ---- Create Record ----
async function cmdCreateRecord(cli, repoProvider, attention, treeProvider) {
    const repo = requireActiveRepo(repoProvider);
    if (!repo)
        return;
    // Pick a type
    let types;
    try {
        const payload = await cli.runOk(repo.rootPath, [
            "type",
            "list",
        ]);
        types = payload.types;
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to list types: ${msg}`);
        return;
    }
    if (types.length === 0) {
        vscode.window.showWarningMessage("SRS: No types defined in the active repository.");
        return;
    }
    const typeItems = types.map((t) => ({
        label: `${t.namespace}/${t.name}`,
        description: `v${t.version}`,
        detail: t.id,
        type: t,
    }));
    const picked = await vscode.window.showQuickPick(typeItems, {
        placeHolder: "Select a type for the new record",
        matchOnDescription: true,
        matchOnDetail: true,
    });
    if (!picked)
        return;
    const typeName = `${picked.type.namespace}/${picked.type.name}`;
    // Build a minimal record with empty field values — user edits via JSON after creation
    try {
        const cid = containerId(attention);
        await cli.runOk(repo.rootPath, ["record", "create", "--type", typeName, "--version", String(picked.type.version)], {
            stdin: JSON.stringify({ fieldValues: [] }),
            containerId: cid,
        });
        treeProvider.refresh();
        vscode.window.showInformationMessage(`SRS: Record of type '${typeName}' created.`);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create record: ${msg}`);
    }
}
// ---- Delete Entity ----
async function cmdDeleteEntity(cli, repoProvider, treeProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode)) {
        vscode.window.showWarningMessage("SRS: Select an entity in the SRS tree to delete.");
        return;
    }
    const repo = repoProvider.active;
    if (!repo)
        return;
    const confirmed = await vscode.window.showWarningMessage(`SRS: Delete ${node.entityKind} '${node.label}'?`, { modal: true }, "Delete");
    if (confirmed !== "Delete")
        return;
    // Map entity kind to delete subcommand args
    const deleteArgs = deleteArgsFor(node.entityKind, node.entityId);
    if (!deleteArgs) {
        vscode.window.showErrorMessage(`SRS: Delete not supported for '${node.entityKind}'.`);
        return;
    }
    try {
        await cli.runOk(repo.rootPath, deleteArgs);
        treeProvider.refresh();
        vscode.window.showInformationMessage(`SRS: ${node.entityKind} deleted.`);
    }
    catch (err) {
        if (err instanceof CliClient_1.CliError &&
            err.diagnostics.some((d) => d.includes("CannotDeleteInUse") || d.includes("used by"))) {
            vscode.window.showErrorMessage(`SRS: Cannot delete ${node.entityKind} '${node.label}' — it is referenced by other entities. Remove those references first.\n\nDetails: ${err.diagnostics.join("\n")}`, { modal: true });
        }
        else {
            const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
            vscode.window.showErrorMessage(`SRS: Failed to delete entity: ${msg}`);
        }
    }
}
function deleteArgsFor(kind, id) {
    switch (kind) {
        case "note": return ["note", "delete", id];
        case "tag": return ["tag", "delete", id];
        case "record": return ["record", "delete", id];
        case "relation": return ["relation", "delete", id];
        case "container": return ["container", "delete", id];
        case "protocol": return ["protocol", "delete", id];
        case "blueprint": return ["blueprint", "delete", id];
        case "view": return ["view", "delete", id];
        case "document-view": return ["document-view", "delete", id];
        case "theme": return ["theme", "delete", id];
        default: return undefined;
    }
}
// ---- Add/Remove member from active container ----
// These are exposed as context-menu commands on EntityNode items.
async function cmdAddToContainer(cli, repoProvider, attention, treeProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode))
        return;
    const repo = repoProvider.active;
    if (!repo)
        return;
    const cid = containerId(attention);
    if (!cid) {
        vscode.window.showWarningMessage("SRS: No active container. Use 'SRS: Set Active Container' first.");
        return;
    }
    try {
        await cli.runOk(repo.rootPath, [
            "container",
            "members",
            "add",
            cid,
            node.entityId,
        ]);
        treeProvider.refresh();
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to add to container: ${msg}`);
    }
}
async function cmdRemoveFromContainer(cli, repoProvider, attention, treeProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode))
        return;
    const repo = repoProvider.active;
    if (!repo)
        return;
    const cid = containerId(attention);
    if (!cid)
        return;
    try {
        await cli.runOk(repo.rootPath, [
            "container",
            "members",
            "remove",
            cid,
            node.entityId,
        ]);
        treeProvider.refresh();
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to remove from container: ${msg}`);
    }
}
//# sourceMappingURL=mutationCommands.js.map