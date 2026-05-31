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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("./cli/CliClient");
const RepositoryProvider_1 = require("./repository/RepositoryProvider");
const SrsTreeDataProvider_1 = require("./tree/SrsTreeDataProvider");
const repositoryCommands_1 = require("./commands/repositoryCommands");
async function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("SRS");
    context.subscriptions.push(outputChannel);
    const cli = new CliClient_1.CliClient(outputChannel);
    const repoProvider = new RepositoryProvider_1.RepositoryProvider(cli);
    const treeProvider = new SrsTreeDataProvider_1.SrsTreeDataProvider(cli, repoProvider);
    context.subscriptions.push(repoProvider, treeProvider);
    const treeView = vscode.window.createTreeView("srsRepositoryTree", {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    // Keep tree view title in sync with active repository name
    repoProvider.onDidChangeActive((repo) => {
        treeView.title = repo ? `SRS: ${repo.title}` : "SRS Repository";
    });
    (0, repositoryCommands_1.registerRepositoryCommands)(context, cli, repoProvider, treeProvider, outputChannel);
    // Auto-detect on activation
    await autoDetectRepository(cli, repoProvider);
}
async function autoDetectRepository(cli, repoProvider) {
    const config = vscode.workspace.getConfiguration("srs");
    const configuredPath = config.get("repository.path", null);
    if (configuredPath) {
        const repo = await repoProvider.probe(configuredPath);
        if (repo) {
            repoProvider.setActive(repo);
        }
        else {
            const action = "Open Settings";
            const choice = await vscode.window.showWarningMessage(`SRS: Configured path '${configuredPath}' is not a valid SRS repository.`, action);
            if (choice === action) {
                vscode.commands.executeCommand("workbench.action.openSettings", "srs.repository.path");
            }
        }
        return;
    }
    const discovered = await repoProvider.discoverAll();
    if (discovered.length === 1) {
        repoProvider.setActive(discovered[0]);
    }
    else if (discovered.length > 1) {
        vscode.window.showInformationMessage(`SRS: Found ${discovered.length} repositories in workspace. Use 'SRS: Select Repository' to choose one.`);
    }
    // If 0: remain inactive; user runs 'SRS: Select Repository' manually.
}
function deactivate() {
    // Disposables registered in context.subscriptions are cleaned up automatically.
}
//# sourceMappingURL=extension.js.map