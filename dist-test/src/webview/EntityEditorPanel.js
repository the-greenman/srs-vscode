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
exports.EntityEditorPanel = void 0;
const vscode = __importStar(require("vscode"));
const errors_1 = require("../cli/errors");
class EntityEditorPanel {
    static show(context, id, title, html, onSave) {
        const existing = EntityEditorPanel._panels.get(id);
        if (existing) {
            existing._panel.reveal(vscode.ViewColumn.Active);
            existing._panel.title = title;
            existing._onSave = onSave;
            existing._update(html);
            return existing;
        }
        const panel = new EntityEditorPanel(context, id, title, html, onSave);
        EntityEditorPanel._panels.set(id, panel);
        return panel;
    }
    constructor(_context, _id, title, html, onSave) {
        this._id = _id;
        this._onSave = onSave;
        this._panel = vscode.window.createWebviewPanel("srsEditor", title, { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, {
            enableScripts: true,
            localResourceRoots: [],
        });
        this._update(html);
        this._panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === "cancel") {
                this.dispose();
                return;
            }
            if (msg.type === "save") {
                try {
                    await this._onSave(msg.data);
                    // Success — close the panel
                    this.dispose();
                }
                catch (err) {
                    const messages = err instanceof errors_1.CliError
                        ? err.diagnostics
                        : [String(err)];
                    this._panel.webview.postMessage({ type: "error", messages });
                }
            }
        });
        this._panel.onDidDispose(() => {
            EntityEditorPanel._panels.delete(this._id);
        });
    }
    _update(html) {
        this._panel.webview.html = html;
    }
    dispose() {
        this._panel.dispose();
    }
}
exports.EntityEditorPanel = EntityEditorPanel;
EntityEditorPanel._panels = new Map();
//# sourceMappingURL=EntityEditorPanel.js.map