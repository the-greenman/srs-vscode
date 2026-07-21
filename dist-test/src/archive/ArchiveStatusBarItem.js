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
exports.ArchiveStatusBarItem = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
// Status-bar indicator for archive-backed repositories. Visible only when the
// active repository was opened from a `.srs` archive; shows a filled dot while
// the working copy has unsaved changes (diverged from the packed archive) and
// offers a one-click "Save to .srs".
class ArchiveStatusBarItem {
    constructor(archiveManager, repoProvider) {
        this.archiveManager = archiveManager;
        this.repoProvider = repoProvider;
        this._disposables = [];
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this._item.command = "srs.saveArchive";
        this._disposables.push(this._item);
        this._disposables.push(archiveManager.onDidChangeDirty(() => this._update()), repoProvider.onDidChangeActive(() => this._update()));
        this._update();
    }
    _update() {
        const archivePath = this.repoProvider.active?.archivePath;
        if (!archivePath) {
            this._item.hide();
            return;
        }
        const name = path.basename(archivePath);
        if (this.archiveManager.isDirty) {
            this._item.text = `$(archive) ● ${name}`;
            this._item.tooltip = `SRS: ${name} has unsaved changes — click to save to .srs`;
        }
        else {
            this._item.text = `$(archive) ${name}`;
            this._item.tooltip = `SRS: ${name} (saved) — click to re-pack to .srs`;
        }
        this._item.show();
    }
    dispose() {
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.ArchiveStatusBarItem = ArchiveStatusBarItem;
//# sourceMappingURL=ArchiveStatusBarItem.js.map