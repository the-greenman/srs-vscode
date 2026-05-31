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
const AttentionManager_1 = require("./container/AttentionManager");
const ContainerStatusBarItem_1 = require("./container/ContainerStatusBarItem");
const SchemaProvider_1 = require("./schema/SchemaProvider");
const EntityDocumentProvider_1 = require("./provider/EntityDocumentProvider");
const DiagnosticsProvider_1 = require("./diagnostics/DiagnosticsProvider");
const repositoryCommands_1 = require("./commands/repositoryCommands");
const previewCommands_1 = require("./commands/previewCommands");
const editCommands_1 = require("./commands/editCommands");
const containerCommands_1 = require("./commands/containerCommands");
const mutationCommands_1 = require("./commands/mutationCommands");
const graphCommands_1 = require("./commands/graphCommands");
const NavigatorTreeDataProvider_1 = require("./tree/NavigatorTreeDataProvider");
const navigatorCommands_1 = require("./commands/navigatorCommands");
async function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("SRS");
    context.subscriptions.push(outputChannel);
    const cli = new CliClient_1.CliClient(outputChannel);
    const repoProvider = new RepositoryProvider_1.RepositoryProvider(cli);
    const attention = new AttentionManager_1.AttentionManager(context.workspaceState, cli);
    const treeProvider = new SrsTreeDataProvider_1.SrsTreeDataProvider(cli, repoProvider, attention);
    const navigatorProvider = new NavigatorTreeDataProvider_1.NavigatorTreeDataProvider(cli, repoProvider);
    const statusBarItem = new ContainerStatusBarItem_1.ContainerStatusBarItem(attention);
    const schemaProvider = new SchemaProvider_1.SchemaProvider(context.extensionUri);
    const entityDocProvider = new EntityDocumentProvider_1.EntityDocumentProvider(cli, repoProvider);
    const diagnosticsProvider = new DiagnosticsProvider_1.DiagnosticsProvider(cli, repoProvider);
    context.subscriptions.push(repoProvider, treeProvider, navigatorProvider, attention, statusBarItem, schemaProvider, entityDocProvider, diagnosticsProvider, vscode.workspace.registerTextDocumentContentProvider(EntityDocumentProvider_1.ENTITY_SCHEME, entityDocProvider));
    const treeView = vscode.window.createTreeView("srsRepositoryTree", {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);
    const navigatorView = vscode.window.createTreeView("srsNavigatorTree", {
        treeDataProvider: navigatorProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(navigatorView);
    // Initialise context key for mode-sensitive toolbar buttons
    vscode.commands.executeCommand("setContext", "srs.navigatorMode", "relations");
    // Keep tree view title in sync with active repository name; clear stale diagnostics on change
    repoProvider.onDidChangeActive((repo) => {
        treeView.title = repo ? `SRS: ${repo.title}` : "SRS Repository";
        if (repo) {
            statusBarItem.show();
        }
        else {
            statusBarItem.hide();
            diagnosticsProvider.clear();
        }
    });
    // Validate on save when srs.validate.onSave is enabled
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
        const repo = repoProvider.active;
        if (!repo)
            return;
        const config = vscode.workspace.getConfiguration("srs");
        if (!config.get("validate.onSave", true))
            return;
        // Only trigger for files inside the active repository root
        if (!doc.uri.fsPath.startsWith(repo.rootPath))
            return;
        diagnosticsProvider.validate();
    }));
    (0, repositoryCommands_1.registerRepositoryCommands)(context, cli, repoProvider, treeProvider, outputChannel, entityDocProvider, diagnosticsProvider);
    (0, containerCommands_1.registerContainerCommands)(context, cli, repoProvider, attention, treeProvider);
    (0, mutationCommands_1.registerMutationCommands)(context, cli, repoProvider, attention, treeProvider);
    (0, previewCommands_1.registerPreviewCommands)(context, cli, repoProvider);
    (0, editCommands_1.registerEditCommands)(context, cli, repoProvider, treeProvider);
    (0, graphCommands_1.registerGraphCommands)(context, cli, repoProvider, entityDocProvider);
    (0, navigatorCommands_1.registerNavigatorCommands)(context, navigatorProvider);
    // Auto-detect on activation
    await autoDetectRepository(cli, repoProvider);
    // Restore persisted active container once the active repo is known
    const activeRepo = repoProvider.active;
    if (activeRepo) {
        await attention.restore(activeRepo.rootPath);
        statusBarItem.show();
    }
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