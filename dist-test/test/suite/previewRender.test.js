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
const SrsTreeDataProvider_1 = require("../../src/tree/SrsTreeDataProvider");
const NavigatorTreeDataProvider_1 = require("../../src/tree/NavigatorTreeDataProvider");
const previewCommands_1 = require("../../src/commands/previewCommands");
// Two document views with distinct namespaces/versions, used to assert the
// picker item shape (label / description / detail) required by fix #1.
const V1 = { id: "11111111-1111-4111-8111-111111111111", name: "spec-doc", namespace: "com.ex.a", version: 2 };
const V2 = { id: "22222222-2222-4222-8222-222222222222", name: "rfc-doc", namespace: "com.ex.b", version: 1 };
const CID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
// Records every CLI invocation and returns canned payloads keyed by the command.
class FakeCli {
    constructor(full, filtered) {
        this.full = full;
        this.filtered = filtered;
        this.calls = [];
    }
    async runOk(_repoPath, args) {
        this.calls.push(args);
        if (args[0] === "document-view" && args[1] === "list-for-container") {
            return this.filtered;
        }
        if (args[0] === "document-view" && args[1] === "list") {
            return this.full;
        }
        if (args[0] === "render") {
            return { rendered: "# Rendered\n\nbody", diagnostics: [] };
        }
        throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
    cmds() {
        return this.calls.map((a) => a.join(" "));
    }
}
function invokeRender(cli, attentionActive, node) {
    const context = { subscriptions: [] };
    const repoProvider = { active: { rootPath: "/repo" } };
    const attention = { active: attentionActive };
    (0, previewCommands_1.registerPreviewCommands)(context, cli, repoProvider, attention);
    const cmd = vscode
        .getRegisteredCommand("srs.previewRender");
    return cmd(node);
}
describe("cmdPreviewRender", () => {
    beforeEach(() => {
        vscode.window.quickPickIndex = 0;
        vscode.window.lastQuickPick = undefined;
    });
    it("(a) container node: type-filters via list-for-container, falls back to full list when empty, then renders the picked view", async () => {
        const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
        const node = new SrsTreeDataProvider_1.EntityNode(CID, "container", "My Container", ["container", "get", CID]);
        await invokeRender(cli, undefined, node);
        const cmds = cli.cmds();
        // container context → list-for-container FIRST, using the container's own id
        assert.ok(cmds.includes(`document-view list-for-container ${CID}`), `expected list-for-container call, got: ${JSON.stringify(cmds)}`);
        // filtered result empty → fall back to the unfiltered list
        assert.ok(cmds.includes("document-view list"), "expected fallback to full list");
        // Picker item shape (fix #1): label=namespace/name, description=v<version>, detail=id
        const capture = vscode.window.lastQuickPick;
        assert.ok(capture, "expected a QuickPick to be shown");
        assert.deepStrictEqual(capture.items[0].label, "com.ex.a/spec-doc");
        assert.deepStrictEqual(capture.items[0].description, "v2");
        assert.deepStrictEqual(capture.items[0].detail, V1.id);
        assert.strictEqual(capture.options.matchOnDescription, true);
        assert.strictEqual(capture.options.matchOnDetail, true);
        // Renders the picked (index 0) view, WITHOUT injecting --container
        assert.ok(cmds.includes(`render document-view --view ${V1.id}`), `expected plain render of picked view, got: ${JSON.stringify(cmds)}`);
        assert.ok(!cmds.some((c) => c.startsWith("render") && c.includes("--container")), "container context must not be injected into the render call");
    });
    it("(a') record node with an active container: filters via that container and uses the filtered set (no fallback)", async () => {
        const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [V2] });
        const node = new SrsTreeDataProvider_1.EntityNode("rec-1", "record", "A Record", ["record", "get", "rec-1"]);
        await invokeRender(cli, { containerId: CID, title: "Ctx" }, node);
        const cmds = cli.cmds();
        assert.ok(cmds.includes(`document-view list-for-container ${CID}`), "record resolves to active container");
        // filtered set non-empty → the full list is NOT consulted (genuine narrowing)
        assert.ok(!cmds.includes("document-view list"), "should not fall back when filtered set is non-empty");
        const capture = vscode.window.lastQuickPick;
        assert.strictEqual(capture.items.length, 1);
        assert.strictEqual(capture.items[0].detail, V2.id);
    });
    it("(no context) uses the full list when there is no container context", async () => {
        const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
        const node = new SrsTreeDataProvider_1.EntityNode("rec-1", "record", "A Record", ["record", "get", "rec-1"]);
        await invokeRender(cli, undefined, node);
        const cmds = cli.cmds();
        assert.ok(!cmds.some((c) => c.startsWith("document-view list-for-container")), "no container context → no list-for-container");
        assert.ok(cmds.includes("document-view list"), "expected the full list");
    });
    it("(b) DocViewNode (Navigator): renders directly with no picker", async () => {
        const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
        const node = new NavigatorTreeDataProvider_1.DocViewNode(V1.id, "com.ex.a/spec-doc", []);
        await invokeRender(cli, undefined, node);
        const capture = vscode.window.lastQuickPick;
        assert.strictEqual(capture, undefined, "direct render must not show a picker");
        assert.ok(cli.cmds().includes(`render document-view --view ${V1.id}`), "should render the node's view directly");
    });
    it("(b') document-view EntityNode (main tree): renders directly with no picker", async () => {
        const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
        const node = new SrsTreeDataProvider_1.EntityNode(V2.id, "document-view", "com.ex.b/rfc-doc", ["document-view", "get", V2.id]);
        await invokeRender(cli, undefined, node);
        const capture = vscode.window.lastQuickPick;
        assert.strictEqual(capture, undefined, "direct render must not show a picker");
        assert.ok(cli.cmds().includes(`render document-view --view ${V2.id}`), "should render the node's view directly");
    });
});
//# sourceMappingURL=previewRender.test.js.map