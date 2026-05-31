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
exports.AttentionManager = void 0;
const vscode = __importStar(require("vscode"));
const STORAGE_KEY = "srs.activeContainer";
class AttentionManager {
    constructor(workspaceState, cli) {
        this.workspaceState = workspaceState;
        this.cli = cli;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
    }
    get active() {
        return this._active;
    }
    // Load persisted container from workspaceState and verify it still exists.
    // Call once on activation after the active repository is known.
    async restore(repoPath) {
        const stored = this.workspaceState.get(STORAGE_KEY);
        if (!stored) {
            return;
        }
        try {
            await this.cli.runOk(repoPath, ["container", "get", stored.containerId]);
            this._active = stored;
            this._onDidChange.fire(this._active);
        }
        catch {
            // Container no longer exists — clear silently
            await this.workspaceState.update(STORAGE_KEY, undefined);
        }
    }
    async set(container, repoPath) {
        // Verify the container exists before storing
        await this.cli.runOk(repoPath, [
            "container",
            "get",
            container.containerId,
        ]);
        this._active = container;
        await this.workspaceState.update(STORAGE_KEY, container);
        this._onDidChange.fire(this._active);
    }
    async clear() {
        this._active = undefined;
        await this.workspaceState.update(STORAGE_KEY, undefined);
        this._onDidChange.fire(undefined);
    }
    dispose() {
        this._onDidChange.dispose();
    }
}
exports.AttentionManager = AttentionManager;
//# sourceMappingURL=AttentionManager.js.map