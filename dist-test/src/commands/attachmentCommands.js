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
exports.registerAttachmentCommands = registerAttachmentCommands;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const CliClient_1 = require("../cli/CliClient");
function registerAttachmentCommands(context, cli, repoProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.attachmentAdd", () => cmdAttachmentAdd(cli, repoProvider)), vscode.commands.registerCommand("srs.attachmentList", () => cmdAttachmentList(cli, repoProvider)), vscode.commands.registerCommand("srs.attachmentExport", () => cmdAttachmentExport(cli, repoProvider)));
}
function requireActiveRepo(repoProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
        return undefined;
    }
    return repo;
}
async function cmdAttachmentAdd(cli, repoProvider) {
    const repo = requireActiveRepo(repoProvider);
    if (!repo)
        return;
    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Add Attachment",
    });
    if (!picked || picked.length === 0)
        return;
    const fsPath = picked[0].fsPath;
    const title = await vscode.window.showInputBox({
        title: "SRS: Add Attachment",
        prompt: "Title (optional — leave blank to derive from filename)",
        placeHolder: path.basename(fsPath),
    });
    if (title === undefined)
        return;
    const subdir = await vscode.window.showInputBox({
        title: "SRS: Add Attachment",
        prompt: "Subdirectory within source-documents/ (optional)",
    });
    if (subdir === undefined)
        return;
    const args = ["attachment", "add", fsPath];
    if (title.trim())
        args.push("--title", title.trim());
    if (subdir.trim())
        args.push("--subdir", subdir.trim());
    try {
        const payload = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "SRS: Adding attachment…" }, () => cli.runOk(repo.rootPath, args));
        vscode.window.showInformationMessage(`SRS: Attachment added (${payload.contentPath}).`);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to add attachment: ${msg}`);
    }
}
async function cmdAttachmentList(cli, repoProvider) {
    const repo = requireActiveRepo(repoProvider);
    if (!repo)
        return;
    let payload;
    try {
        payload = await cli.runOk(repo.rootPath, [
            "attachment",
            "list",
        ]);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to list attachments: ${msg}`);
        return;
    }
    if (payload.entries.length === 0) {
        vscode.window.showInformationMessage("SRS: No attachments in this repository.");
        return;
    }
    const items = payload.entries.map((e) => ({
        label: e.title ?? path.basename(e.path),
        description: e.path,
        detail: e.sizeBytes != null ? formatBytes(e.sizeBytes) : undefined,
    }));
    await vscode.window.showQuickPick(items, {
        placeHolder: `${payload.entries.length} attachment(s) in ${payload.sourceDocumentsPath}/`,
        matchOnDescription: true,
    });
}
async function cmdAttachmentExport(cli, repoProvider) {
    const repo = requireActiveRepo(repoProvider);
    if (!repo)
        return;
    let payload;
    try {
        payload = await cli.runOk(repo.rootPath, [
            "attachment",
            "list",
        ]);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to list attachments: ${msg}`);
        return;
    }
    if (payload.entries.length === 0) {
        vscode.window.showInformationMessage("SRS: No attachments to export.");
        return;
    }
    const items = payload.entries.map((e) => ({
        label: e.title ?? path.basename(e.path),
        description: e.path,
        detail: e.sizeBytes != null ? formatBytes(e.sizeBytes) : undefined,
        entry: e,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select an attachment to export",
        matchOnDescription: true,
    });
    if (!picked)
        return;
    const sourcePath = path.join(repo.rootPath, payload.sourceDocumentsPath, picked.entry.path);
    const defaultName = path.basename(picked.entry.path);
    const target = await vscode.window.showSaveDialog({
        saveLabel: "Export Attachment",
        defaultUri: vscode.Uri.file(defaultName),
    });
    if (!target)
        return;
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `SRS: Exporting ${defaultName}…`,
        }, () => fs.copyFile(sourcePath, target.fsPath));
        vscode.window.showInformationMessage(`SRS: Exported ${defaultName}.`);
    }
    catch (err) {
        vscode.window.showErrorMessage(`SRS: Export failed: ${String(err)}`);
    }
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
//# sourceMappingURL=attachmentCommands.js.map