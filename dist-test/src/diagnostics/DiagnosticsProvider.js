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
exports.DiagnosticsProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// Synthetic URI used when we cannot map a diagnostic to a specific file.
// VS Code surfaces these under a virtual "SRS Repository" entry in the Problems panel.
const REPO_DIAGNOSTIC_SOURCE = "SRS";
class DiagnosticsProvider {
    constructor(cli, repoProvider) {
        this.cli = cli;
        this.repoProvider = repoProvider;
        this._disposables = [];
        this._collection = vscode.languages.createDiagnosticCollection("srs");
        this._disposables.push(this._collection);
    }
    // Run validation and populate the DiagnosticCollection.
    // Called explicitly (e.g. after save) or by commands.
    async validate() {
        const repo = this.repoProvider.active;
        if (!repo) {
            return;
        }
        this._collection.clear();
        // ok:false means CLI invocation failed (bad binary, no manifest, etc.) — not semantic errors
        const envelope = await this.cli.run(repo.rootPath, ["repo", "validate"]);
        if (!envelope.ok) {
            // Surface the invocation error against a synthetic URI for the repo root
            const uri = vscode.Uri.file(path.join(repo.rootPath, "manifest.json"));
            this._collection.set(uri, [
                new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), envelope.diagnostics.join("; "), vscode.DiagnosticSeverity.Error),
            ]);
            return;
        }
        const { diagnostics } = envelope.payload;
        if (diagnostics.length === 0) {
            return;
        }
        // Group diagnostics by file URI
        const byUri = new Map();
        for (const d of diagnostics) {
            const uri = d.relative_path
                ? vscode.Uri.file(path.join(repo.rootPath, d.relative_path)).toString()
                : vscode.Uri.file(path.join(repo.rootPath, "manifest.json")).toString();
            const severity = severityFor(d.severity);
            const diag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), d.message, severity);
            diag.source = REPO_DIAGNOSTIC_SOURCE;
            if (!byUri.has(uri)) {
                byUri.set(uri, []);
            }
            byUri.get(uri).push(diag);
        }
        for (const [uriStr, diags] of byUri) {
            this._collection.set(vscode.Uri.parse(uriStr), diags);
        }
    }
    // Clear all diagnostics (e.g. when active repo changes)
    clear() {
        this._collection.clear();
    }
    dispose() {
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.DiagnosticsProvider = DiagnosticsProvider;
function severityFor(s) {
    switch (s) {
        case "Error": return vscode.DiagnosticSeverity.Error;
        case "Warning": return vscode.DiagnosticSeverity.Warning;
        default: return vscode.DiagnosticSeverity.Information;
    }
}
//# sourceMappingURL=DiagnosticsProvider.js.map