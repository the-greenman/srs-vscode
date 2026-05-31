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
exports.PreviewPanel = void 0;
exports.wrapHtml = wrapHtml;
exports.esc = esc;
const vscode = __importStar(require("vscode"));
/**
 * A single, reusable webview panel keyed by a stable string id.
 * Calling PreviewPanel.show() with the same id brings the existing panel
 * to the foreground rather than opening a duplicate.
 */
class PreviewPanel {
    static show(context, id, title, html) {
        const existing = PreviewPanel._panels.get(id);
        if (existing) {
            existing._panel.reveal(vscode.ViewColumn.Active);
            existing._panel.title = title;
            existing._update(html);
            return existing;
        }
        const panel = new PreviewPanel(context, id, title, html);
        PreviewPanel._panels.set(id, panel);
        return panel;
    }
    constructor(context, _id, title, html) {
        this._id = _id;
        this._panel = vscode.window.createWebviewPanel("srsPreview", title, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, {
            enableScripts: false,
            localResourceRoots: [],
        });
        this._update(html);
        this._panel.onDidDispose(() => {
            PreviewPanel._panels.delete(this._id);
        });
    }
    _update(html) {
        this._panel.webview.html = html;
    }
    dispose() {
        this._panel.dispose();
    }
}
exports.PreviewPanel = PreviewPanel;
PreviewPanel._panels = new Map();
// ---- HTML helpers ----
const CSS = `
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
           color: var(--vscode-foreground); background: var(--vscode-editor-background);
           padding: 1.5em 2em; max-width: 900px; line-height: 1.6; }
    h1 { font-size: 1.4em; margin-bottom: 0.25em; }
    h2 { font-size: 1.15em; margin-top: 1.5em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.2em; }
    h3 { font-size: 1em; margin-top: 1em; color: var(--vscode-descriptionForeground); }
    .meta { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 1.5em; }
    .tag { display: inline-block; background: var(--vscode-badge-background);
           color: var(--vscode-badge-foreground); border-radius: 3px;
           padding: 0 6px; font-size: 0.8em; margin: 0 2px; }
    .field-row { display: flex; gap: 1em; margin: 0.4em 0; }
    .field-label { width: 160px; flex-shrink: 0; font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .field-value { flex: 1; word-break: break-word; }
    .section { margin-top: 1.2em; }
    .section-name { font-size: 0.8em; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin-bottom: 0.3em; }
    .member-row { padding: 0.2em 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 0.8em; border-radius: 4px;
          overflow-x: auto; font-size: 0.9em; white-space: pre-wrap; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
  </style>
`;
function wrapHtml(title, body) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${CSS}<title>${esc(title)}</title></head><body>${body}</body></html>`;
}
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
//# sourceMappingURL=PreviewPanel.js.map