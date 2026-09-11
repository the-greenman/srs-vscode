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
const NavigatorTreeDataProvider_1 = require("../../src/tree/NavigatorTreeDataProvider");
// Regression coverage for srs-vscode#119 workstream 2: the Navigator's
// composition section drill-down was rebuilt around the real `source.type`
// discriminant (container-subset / discovery-query) since the CLI's rename
// (DocumentView -> Composition, srs-rust PR #921/f7c9bfec) also collapsed
// away `semanticObjectType`, the field the old code keyed off of — making
// every section unexpandable regardless of the payload-key fix alone.
const REPO_PATH = "/repo";
class FakeCli {
    constructor(responses) {
        this.responses = responses;
        this.calls = [];
    }
    async runOk(_repoPath, args) {
        this.calls.push(args);
        const key = args.slice(0, 2).join(" ");
        if (key in this.responses)
            return this.responses[key];
        throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
}
function fakeRepoProvider(rootPath) {
    return {
        active: { rootPath, repositoryId: "r1" },
        onDidChangeActive: () => ({ dispose() { } }),
    };
}
describe("NavigatorTreeDataProvider — composition sections", () => {
    it("a container-subset section resolves its members via container resolve-view", async () => {
        const cli = new FakeCli({
            "composition list": {
                compositions: [{ id: "comp-1", namespace: "com.ex", name: "guide-body-view", version: 1 }],
            },
            "composition get": {
                composition: {
                    sections: [
                        { sectionId: "guide-body", title: "Body", source: { type: "container-subset", containerId: "cont-1" } },
                    ],
                },
            },
            "container resolve-view": {
                containerView: {
                    members: [
                        { instanceId: "rec-1", tier: 2, displayLabel: "P-01", isVisibleByDefault: true },
                    ],
                },
            },
        });
        const nav = new NavigatorTreeDataProvider_1.NavigatorTreeDataProvider(cli, fakeRepoProvider(REPO_PATH));
        nav.setMode("compositions");
        const roots = await nav.getChildren();
        assert.strictEqual(roots.length, 1);
        const comp = roots[0];
        assert.ok(comp instanceof NavigatorTreeDataProvider_1.CompositionNode);
        const sections = await nav.getChildren(comp);
        assert.strictEqual(sections.length, 1);
        const section = sections[0];
        assert.ok(section instanceof NavigatorTreeDataProvider_1.CompositionSectionNode);
        assert.strictEqual(section.label, "Body");
        const records = await nav.getChildren(section);
        assert.strictEqual(records.length, 1);
        assert.strictEqual(records[0].label, "P-01");
        assert.ok(cli.calls.some((c) => c.join(" ") === "container resolve-view cont-1"), `expected a resolve-view call, got: ${JSON.stringify(cli.calls)}`);
    });
    it("a discovery-query section resolves via record list --type namespace/name (not a UUID)", async () => {
        const cli = new FakeCli({
            "composition list": {
                compositions: [{ id: "comp-2", namespace: "com.ex", name: "problem-statements-document", version: 1 }],
            },
            "composition get": {
                composition: {
                    sections: [
                        {
                            sectionId: "problem-set-root",
                            title: "Problem statements",
                            source: { type: "discovery-query", query: { typeNamespace: "com.ex.argument", typeName: "problem-set" } },
                        },
                    ],
                },
            },
            "record list": { records: [{ instanceId: "rec-2", displayLabel: "Problem statements" }] },
        });
        const nav = new NavigatorTreeDataProvider_1.NavigatorTreeDataProvider(cli, fakeRepoProvider(REPO_PATH));
        nav.setMode("compositions");
        const [comp] = await nav.getChildren();
        const [section] = await nav.getChildren(comp);
        const records = await nav.getChildren(section);
        assert.strictEqual(records.length, 1);
        assert.ok(cli.calls.some((c) => c.join(" ") === "record list --type com.ex.argument/problem-set"), `expected a namespace/name --type call, got: ${JSON.stringify(cli.calls)}`);
    });
    it("a section with no title falls back to its sectionId", async () => {
        const cli = new FakeCli({
            "composition list": {
                compositions: [{ id: "comp-3", namespace: "com.ex", name: "guide-body-view", version: 1 }],
            },
            "composition get": {
                composition: {
                    sections: [{ sectionId: "guide-body", source: { type: "container-subset", containerId: "cont-1" } }],
                },
            },
        });
        const nav = new NavigatorTreeDataProvider_1.NavigatorTreeDataProvider(cli, fakeRepoProvider(REPO_PATH));
        nav.setMode("compositions");
        const [comp] = await nav.getChildren();
        const [section] = await nav.getChildren(comp);
        assert.strictEqual(section.label, "guide-body");
    });
    it("a section with no resolvable source shape is a leaf, not silently expandable-but-empty", async () => {
        const cli = new FakeCli({
            "composition list": {
                compositions: [{ id: "comp-4", namespace: "com.ex", name: "weird-view", version: 1 }],
            },
            "composition get": {
                composition: { sections: [{ sectionId: "mystery", title: "Mystery", source: { type: "something-new" } }] },
            },
        });
        const nav = new NavigatorTreeDataProvider_1.NavigatorTreeDataProvider(cli, fakeRepoProvider(REPO_PATH));
        nav.setMode("compositions");
        const [comp] = await nav.getChildren();
        const [section] = await nav.getChildren(comp);
        // vscode.TreeItemCollapsibleState.None === 0 in the mock enum
        assert.strictEqual(section.collapsibleState, 0);
    });
    it("a failing composition list yields an EmptyNode, not a thrown error", async () => {
        const cli = new FakeCli({});
        const nav = new NavigatorTreeDataProvider_1.NavigatorTreeDataProvider(cli, fakeRepoProvider(REPO_PATH));
        nav.setMode("compositions");
        const roots = await nav.getChildren();
        assert.strictEqual(roots.length, 1);
        assert.ok(roots[0] instanceof NavigatorTreeDataProvider_1.EmptyNode);
    });
});
//# sourceMappingURL=NavigatorTreeDataProvider.test.js.map