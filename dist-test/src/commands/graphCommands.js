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
exports.registerGraphCommands = registerGraphCommands;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
const GraphPanel_1 = require("../graph/GraphPanel");
const EntityDocumentProvider_1 = require("../provider/EntityDocumentProvider");
function registerGraphCommands(context, cli, repoProvider, entityProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.showRelationGraph", () => cmdShowRelationGraph(context, cli, repoProvider)), vscode.commands.registerCommand("srs.openEntityById", (id, kind, repoPath) => cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider)));
}
async function cmdShowRelationGraph(context, cli, repoProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
        return;
    }
    try {
        await GraphPanel_1.GraphPanel.show(context, cli, repo.rootPath, repo.title);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to open relation graph: ${msg}`);
    }
}
async function cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider) {
    const repo = repoProvider.active;
    if (!repo)
        return;
    // repoPath from the graph panel must match the active repo; use its repositoryId for the URI
    const entityKind = kind;
    try {
        const uri = (0, EntityDocumentProvider_1.entityUri)(repo.repositoryId, entityKind, id);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc, {
            preview: true,
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false,
        });
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
    }
}
//# sourceMappingURL=graphCommands.js.map