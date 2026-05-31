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
exports.ContainerStatusBarItem = void 0;
const vscode = __importStar(require("vscode"));
class ContainerStatusBarItem {
    constructor(attention) {
        this.attention = attention;
        this._disposables = [];
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this._item.command = "srs.setActiveContainer";
        this._item.tooltip = "SRS: Click to set active container";
        this._disposables.push(this._item);
        this._disposables.push(attention.onDidChange(() => this._update()));
        this._update();
    }
    show() {
        this._item.show();
    }
    hide() {
        this._item.hide();
    }
    _update() {
        const active = this.attention.active;
        if (active) {
            this._item.text = `$(package) ${active.title}`;
            this._item.tooltip = `SRS Container: ${active.title}\nClick to change`;
        }
        else {
            this._item.text = `$(package) No container`;
            this._item.tooltip = "SRS: No active container. Click to set one.";
        }
    }
    dispose() {
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.ContainerStatusBarItem = ContainerStatusBarItem;
//# sourceMappingURL=ContainerStatusBarItem.js.map