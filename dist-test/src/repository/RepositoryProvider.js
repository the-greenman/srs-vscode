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
exports.RepositoryProvider = void 0;
const vscode = __importStar(require("vscode"));
class RepositoryProvider {
    constructor(cli) {
        this.cli = cli;
        this._onDidChangeActive = new vscode.EventEmitter();
        this.onDidChangeActive = this._onDidChangeActive.event;
    }
    get active() {
        return this._active;
    }
    // Probe one path: returns DetectedRepository if srs repo map succeeds, undefined otherwise.
    // Swallows all errors — any directory that isn't a valid SRS repo returns undefined.
    async probe(rootPath) {
        try {
            const payload = await this.cli.runOk(rootPath, ["repo", "map"]);
            return {
                rootPath,
                title: payload.repoMap.repository.title ?? payload.repoMap.repository.repositoryId,
                repositoryId: payload.repoMap.repository.repositoryId,
                counts: payload.repoMap.counts,
            };
        }
        catch {
            return undefined;
        }
    }
    // Scan all workspace folders concurrently; return those where probe succeeds.
    async discoverAll() {
        const folders = vscode.workspace.workspaceFolders ?? [];
        const results = await Promise.all(folders.map((f) => this.probe(f.uri.fsPath)));
        return results.filter((r) => r !== undefined);
    }
    // Set (or clear) the active repository and broadcast the change.
    setActive(repo) {
        this._active = repo;
        vscode.commands.executeCommand("setContext", "srs.repositoryActive", repo !== undefined);
        this._onDidChangeActive.fire(repo);
    }
    // Re-probe the current active path and refresh its counts.
    async refresh() {
        if (!this._active) {
            return;
        }
        const updated = await this.probe(this._active.rootPath);
        if (updated) {
            this.setActive(updated);
        }
    }
    dispose() {
        this._onDidChangeActive.dispose();
    }
}
exports.RepositoryProvider = RepositoryProvider;
//# sourceMappingURL=RepositoryProvider.js.map