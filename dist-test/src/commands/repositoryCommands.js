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
exports.registerRepositoryCommands = registerRepositoryCommands;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
const SrsTreeDataProvider_1 = require("../tree/SrsTreeDataProvider");
const EntityDocumentProvider_1 = require("../provider/EntityDocumentProvider");
function registerRepositoryCommands(context, cli, repoProvider, treeProvider, outputChannel, entityProvider, diagnosticsProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.selectRepository", () => cmdSelectRepository(cli, repoProvider)), vscode.commands.registerCommand("srs.refreshRepository", () => cmdRefreshRepository(repoProvider, treeProvider)), vscode.commands.registerCommand("srs.validateRepository", () => cmdValidateRepository(cli, repoProvider, outputChannel, diagnosticsProvider)), vscode.commands.registerCommand("srs.openRepositoryMap", () => cmdOpenRepositoryMap(cli, repoProvider, outputChannel)), vscode.commands.registerCommand("srs.openEntity", (node) => cmdOpenEntity(repoProvider, entityProvider, node)), vscode.commands.registerCommand("srs.openEntityDefault", (node) => cmdOpenEntityDefault(repoProvider, entityProvider, node)));
}
async function cmdSelectRepository(cli, repoProvider) {
    const discovered = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: "SRS: Scanning workspace for repositories…",
    }, () => repoProvider.discoverAll());
    if (discovered.length === 0) {
        const action = "Open Settings";
        const choice = await vscode.window.showWarningMessage("No SRS repositories found. Check that srs is installed and srs.cli.path is set correctly.", action);
        if (choice === action) {
            vscode.commands.executeCommand("workbench.action.openSettings", "srs.cli.path");
        }
        return;
    }
    const items = discovered.map((r) => ({
        label: r.title,
        description: r.rootPath,
        detail: `${r.counts.notes} notes · ${r.counts.records} records · ${r.counts.totalInstances} total`,
        repo: r,
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select an SRS repository",
        matchOnDescription: true,
    });
    if (picked) {
        repoProvider.setActive(picked.repo);
    }
}
async function cmdRefreshRepository(repoProvider, treeProvider) {
    await repoProvider.refresh();
    treeProvider.refresh();
}
async function cmdValidateRepository(cli, repoProvider, outputChannel, diagnosticsProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
        return;
    }
    outputChannel.show(true);
    outputChannel.appendLine(`\n── srs repo validate ── ${repo.rootPath}`);
    try {
        const envelope = await cli.run(repo.rootPath, ["repo", "validate"]);
        if (envelope.ok) {
            const { summary, diagnostics } = envelope.payload;
            outputChannel.appendLine(`Checked: ${summary.checked}  Errors: ${summary.errors}  Warnings: ${summary.warnings}`);
            if (diagnostics.length === 0) {
                outputChannel.appendLine("✓ No issues found.");
            }
            else {
                for (const d of diagnostics) {
                    const sev = (d.severity ?? "Info").toUpperCase().padEnd(7);
                    const loc = d.relative_path ? ` [${d.relative_path}]` : "";
                    outputChannel.appendLine(`  ${sev}${loc}: ${d.message}`);
                }
            }
        }
        else {
            outputChannel.appendLine("Validation invocation failed:");
            for (const msg of envelope.diagnostics) {
                outputChannel.appendLine(`  ${msg}`);
            }
        }
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        outputChannel.appendLine(`Error: ${msg}`);
        vscode.window.showErrorMessage(`SRS validation error: ${msg}`);
    }
    // Also populate the Problems panel
    await diagnosticsProvider.validate();
}
async function cmdOpenRepositoryMap(cli, repoProvider, outputChannel) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
        return;
    }
    outputChannel.show(true);
    outputChannel.appendLine(`\n── srs repo map ── ${repo.rootPath}`);
    try {
        // Use run() (not runOk) so we see the full envelope including version
        const envelope = await cli.run(repo.rootPath, ["repo", "map"], {
            pretty: true,
        });
        outputChannel.appendLine(JSON.stringify(envelope, null, 2));
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        outputChannel.appendLine(`Error: ${msg}`);
        vscode.window.showErrorMessage(`SRS: ${msg}`);
    }
}
// Kinds with a rich preview webview
const PREVIEW_KINDS = new Set(["note", "record", "container"]);
// Kinds with a form editor
const EDIT_KINDS = new Set(["note", "tag", "record"]);
async function cmdOpenEntityDefault(repoProvider, entityProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode))
        return;
    if (PREVIEW_KINDS.has(node.entityKind)) {
        return vscode.commands.executeCommand("srs.previewEntity", node);
    }
    if (EDIT_KINDS.has(node.entityKind)) {
        return vscode.commands.executeCommand("srs.editEntity", node);
    }
    return cmdOpenEntity(repoProvider, entityProvider, node);
}
async function cmdOpenEntity(repoProvider, entityProvider, node) {
    if (!(node instanceof SrsTreeDataProvider_1.EntityNode)) {
        return;
    }
    const repo = repoProvider.active;
    if (!repo) {
        return;
    }
    try {
        const uri = (0, EntityDocumentProvider_1.entityUri)(repo.repositoryId, node.entityKind, node.entityId);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Active,
            preserveFocus: false,
        });
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
    }
}
//# sourceMappingURL=repositoryCommands.js.map