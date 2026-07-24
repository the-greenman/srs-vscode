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
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const editCommands_1 = require("../../src/commands/editCommands");
const mutationCommands_1 = require("../../src/commands/mutationCommands");
const SrsTreeDataProvider_1 = require("../../src/tree/SrsTreeDataProvider");
// Regression test for #76: the tag write surface (create/edit/delete) targeted
// CLI subcommands (`tag create`, `tag update`, `tag delete`) that no longer
// exist — `srs tag` only supports `list`/`get` since the move to RFC-006
// vocabulary terms. Those calls failed at runtime. The fix removes the dead
// write surface entirely; tags stay read-only (list/get) in the extension
// until a real term-authoring CLI surface exists (#73).
class FakeCli {
    constructor() {
        this.calls = [];
    }
    async runOk(_repoPath, args) {
        this.calls.push(args);
        throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
    cmds() {
        return this.calls.map((a) => a.join(" "));
    }
}
function makeContext() {
    return { subscriptions: [] };
}
describe("tag CRUD dead-surface removal (#76)", () => {
    it("does not register a srs.createTag command", () => {
        const cli = new FakeCli();
        const repoProvider = { active: { rootPath: "/repo" } };
        const attention = { active: undefined };
        const treeProvider = { refresh: () => { } };
        (0, mutationCommands_1.registerMutationCommands)(makeContext(), cli, repoProvider, attention, treeProvider);
        const cmd = vscode
            .getRegisteredCommand("srs.createTag");
        assert.strictEqual(cmd, undefined, "srs.createTag must not be registered");
    });
    it("editing a tag entity does not invoke `tag update`", async () => {
        const cli = new FakeCli();
        const repoProvider = { active: { rootPath: "/repo" } };
        const treeProvider = { refresh: () => { } };
        (0, editCommands_1.registerEditCommands)(makeContext(), cli, repoProvider, treeProvider);
        const editCmd = vscode
            .getRegisteredCommand("srs.editEntity");
        assert.ok(editCmd, "expected srs.editEntity to be registered");
        const node = new SrsTreeDataProvider_1.EntityNode("tag-1", "tag", "needs-review", ["tag", "get", "tag-1"]);
        await editCmd(node);
        assert.ok(!cli.cmds().some((c) => c.startsWith("tag update") || c.startsWith("tag create")), "must never invoke a nonexistent tag write subcommand");
    });
    it("deleting a tag entity does not invoke `tag delete`", async () => {
        const cli = new FakeCli();
        const repoProvider = { active: { rootPath: "/repo" } };
        const treeProvider = { refresh: () => { } };
        const attention = { active: undefined };
        (0, mutationCommands_1.registerMutationCommands)(makeContext(), cli, repoProvider, attention, treeProvider);
        const deleteCmd = vscode
            .getRegisteredCommand("srs.deleteEntity");
        assert.ok(deleteCmd, "expected srs.deleteEntity to be registered");
        // The mock's showWarningMessage always resolves undefined (no confirm
        // dialog picked); simulate the user confirming so the delete path
        // actually runs and we can assert what CLI args it would use.
        const original = vscode.window.showWarningMessage;
        vscode.window.showWarningMessage = (() => Promise.resolve("Delete"));
        try {
            const node = new SrsTreeDataProvider_1.EntityNode("tag-1", "tag", "needs-review", ["tag", "get", "tag-1"]);
            await deleteCmd(node);
        }
        finally {
            vscode.window.showWarningMessage = original;
        }
        assert.ok(!cli.cmds().some((c) => c.startsWith("tag delete")), "must never invoke a nonexistent tag delete subcommand");
    });
});
//# sourceMappingURL=tagCrud.test.js.map