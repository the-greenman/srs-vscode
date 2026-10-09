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
const mutationCommands_1 = require("../../src/commands/mutationCommands");
const SrsTreeDataProvider_1 = require("../../src/tree/SrsTreeDataProvider");
const CliClient_1 = require("../../src/cli/CliClient");
// Regression test for #131: `cmdDeleteEntity`'s in-use detection matched
// `diagnostics` text for "CannotDeleteInUse" / "used by", but the engine
// emits neither — the real message is "cannot delete X 'id': still
// referenced by [...]" (srs-rust error.rs). Since srs-rust#1338 landed, every
// `ok:false` envelope also carries a structured `errors[]` with a stable
// `code` (ADR-053); the fix branches on `code === "cannot-delete-in-use"`
// instead of matching prose.
class FakeCli {
    constructor(failWith) {
        this.failWith = failWith;
    }
    async runOk() {
        throw this.failWith;
    }
}
function makeContext() {
    return { subscriptions: [] };
}
describe("delete in-use detection (#131)", () => {
    it("shows the referenced-by modal when the engine reports cannot-delete-in-use", async () => {
        const cliError = new CliClient_1.CliError("srs type delete failed: cannot delete Type 'abc': still referenced by [rec-1, rec-2]", ["cannot delete Type 'abc': still referenced by [rec-1, rec-2]"], "type", [
            {
                code: "cannot-delete-in-use",
                message: "cannot delete Type 'abc': still referenced by [rec-1, rec-2]",
                details: { usedBy: ["rec-1", "rec-2"] },
            },
        ]);
        const cli = new FakeCli(cliError);
        const repoProvider = { active: { rootPath: "/repo" } };
        const attention = { active: undefined };
        const treeProvider = { refresh: () => { } };
        (0, mutationCommands_1.registerMutationCommands)(makeContext(), cli, repoProvider, attention, treeProvider);
        const deleteCmd = vscode.getRegisteredCommand("srs.deleteEntity");
        assert.ok(deleteCmd, "expected srs.deleteEntity to be registered");
        const originalWarn = vscode.window.showWarningMessage;
        const originalError = vscode.window.showErrorMessage;
        const errorCalls = [];
        vscode.window.showWarningMessage = (() => Promise.resolve("Delete"));
        vscode.window.showErrorMessage = ((...args) => {
            errorCalls.push(args);
            return Promise.resolve(undefined);
        });
        try {
            const node = new SrsTreeDataProvider_1.EntityNode("abc", "view", "Thing", ["view", "get", "abc"]);
            await deleteCmd(node);
        }
        finally {
            vscode.window.showWarningMessage = originalWarn;
            vscode.window.showErrorMessage = originalError;
        }
        assert.strictEqual(errorCalls.length, 1, "expected exactly one showErrorMessage call");
        const [message, options] = errorCalls[0];
        assert.ok(message.includes("referenced by other entities"), `expected the in-use modal, got: ${message}`);
        assert.ok(message.includes("rec-1, rec-2"), `expected usedBy in message: ${message}`);
        assert.deepStrictEqual(options, { modal: true });
    });
    it("falls back to the generic error for an unrelated CliError", async () => {
        const cliError = new CliClient_1.CliError("srs type delete failed: type not found", ["type not found"], "type", [{ code: "type-not-found", message: "type not found" }]);
        const cli = new FakeCli(cliError);
        const repoProvider = { active: { rootPath: "/repo" } };
        const attention = { active: undefined };
        const treeProvider = { refresh: () => { } };
        (0, mutationCommands_1.registerMutationCommands)(makeContext(), cli, repoProvider, attention, treeProvider);
        const deleteCmd = vscode.getRegisteredCommand("srs.deleteEntity");
        const originalWarn = vscode.window.showWarningMessage;
        const originalError = vscode.window.showErrorMessage;
        const errorCalls = [];
        vscode.window.showWarningMessage = (() => Promise.resolve("Delete"));
        vscode.window.showErrorMessage = ((...args) => {
            errorCalls.push(args);
            return Promise.resolve(undefined);
        });
        try {
            const node = new SrsTreeDataProvider_1.EntityNode("abc", "view", "Thing", ["view", "get", "abc"]);
            await deleteCmd(node);
        }
        finally {
            vscode.window.showWarningMessage = originalWarn;
            vscode.window.showErrorMessage = originalError;
        }
        assert.strictEqual(errorCalls.length, 1, "expected exactly one showErrorMessage call");
        const [message] = errorCalls[0];
        assert.ok(!message.includes("referenced by other entities"), `did not expect the in-use modal, got: ${message}`);
    });
});
//# sourceMappingURL=deleteInUse.test.js.map