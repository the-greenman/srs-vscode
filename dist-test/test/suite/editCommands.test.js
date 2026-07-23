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
// Regression test for #46: cmdCreateRelation must not fall back to a
// hardcoded canonical relation-type list (R3 — no client ships its own
// vocabulary). An empty `relation-type list` payload means the repo has no
// installed relation types, and that state must be surfaced, not papered
// over with invented types that would fail server-side resolution.
class FakeCli {
    constructor(relationTypes) {
        this.relationTypes = relationTypes;
        this.calls = [];
    }
    async runOk(_repoPath, args) {
        this.calls.push(args);
        if (args[0] === "relation-type" && args[1] === "list") {
            return { relationTypeDefinitions: this.relationTypes };
        }
        if (args[0] === "note" && args[1] === "list") {
            return { notes: [] };
        }
        if (args[0] === "record" && args[1] === "list") {
            return { records: [] };
        }
        if (args[0] === "relation" && args[1] === "create") {
            return {};
        }
        throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
    cmds() {
        return this.calls.map((a) => a.join(" "));
    }
}
function invokeCreateRelation(cli) {
    const context = { subscriptions: [] };
    const repoProvider = { active: { rootPath: "/repo" } };
    const treeProvider = { refresh: () => { } };
    (0, editCommands_1.registerEditCommands)(context, cli, repoProvider, treeProvider);
    const cmd = vscode
        .getRegisteredCommand("srs.createRelation");
    return cmd();
}
describe("cmdCreateRelation", () => {
    beforeEach(() => {
        vscode.window.quickPickIndex = 0;
        vscode.window.lastQuickPick = undefined;
    });
    it("does not fall back to a hardcoded canonical type list when relation-type list is empty", async () => {
        const cli = new FakeCli([]);
        await invokeCreateRelation(cli);
        // No QuickPick of relation types was ever shown — the command must bail
        // out on the "no relation types installed" warning instead of inventing
        // canonical built-ins (contains/depends-on/supersedes/...).
        const capture = vscode.window.lastQuickPick;
        assert.strictEqual(capture, undefined, "must not show a picker when no relation types are installed");
        // And it must never proceed to create a relation with an invented type.
        assert.ok(!cli.cmds().some((c) => c.startsWith("relation create")), "must not attempt to create a relation when no types are installed");
    });
    it("offers only the repo's installed relation types (no invented built-ins mixed in)", async () => {
        const cli = new FakeCli([
            { id: "rt-1", relationType: "custom-link", label: "Custom Link", namespace: "com.example" },
        ]);
        await invokeCreateRelation(cli);
        const capture = vscode.window
            .lastQuickPick;
        assert.ok(capture, "expected a relation-type QuickPick");
        assert.strictEqual(capture.items.length, 1);
        assert.strictEqual(capture.items[0].description, "custom-link");
        assert.ok(!capture.items.some((i) => i.description === "contains" || i.description === "depends-on"), "must not mix in hardcoded canonical types alongside the repo's real types");
    });
});
//# sourceMappingURL=editCommands.test.js.map