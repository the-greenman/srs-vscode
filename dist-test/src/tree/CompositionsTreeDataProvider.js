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
exports.CompositionsTreeDataProvider = void 0;
exports.defaultPresentation = defaultPresentation;
// The Compositions view: the repository read as the documents it composes into,
// which is the view a reader wants first. The entity-kind trees stay beneath it
// as the raw-data views.
const vscode = __importStar(require("vscode"));
const errors_1 = require("../cli/errors");
const SrsTreeDataProvider_1 = require("./SrsTreeDataProvider");
class CompositionsTreeDataProvider {
    constructor(cli, repoProvider) {
        this.cli = cli;
        this.repoProvider = repoProvider;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._disposables = [];
        this._disposables.push(repoProvider.onDidChangeActive(() => this.refresh()));
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        const repo = this.repoProvider.active;
        if (element || !repo)
            return [];
        try {
            const [list, presentations] = await Promise.all([
                this.cli.runOk(repo.rootPath, ["composition", "list"]),
                // RFC-015: which document a conformant viewer opens. Best-effort — an
                // older CLI or a repo without renderedPresentations just marks nothing.
                this.cli
                    .runOk(repo.rootPath, ["repo", "presentation", "list"])
                    .catch(() => ({ presentations: [] })),
            ]);
            const defaultId = defaultPresentation(presentations.presentations);
            return list.compositions.map((c) => {
                const isDefault = c.id === defaultId;
                const node = new SrsTreeDataProvider_1.EntityNode(c.id, "composition", `${c.namespace}/${c.name}`, ["composition", "get", c.id], isDefault ? `v${c.version} · default` : `v${c.version}`);
                node.tooltip = c.description ?? `composition: ${c.id}`;
                node.iconPath = new vscode.ThemeIcon(isDefault ? "star-full" : "book");
                return node;
            });
        }
        catch (err) {
            const msg = err instanceof errors_1.CliError ? err.message : String(err);
            return [new SrsTreeDataProvider_1.ErrorNode(`Failed to load compositions: ${msg}`)];
        }
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.CompositionsTreeDataProvider = CompositionsTreeDataProvider;
/** RFC-015: the first presentation flagged isDefault, else the first declared. */
function defaultPresentation(presentations) {
    return (presentations.find((p) => p.isDefault) ?? presentations[0])?.compositionId;
}
//# sourceMappingURL=CompositionsTreeDataProvider.js.map