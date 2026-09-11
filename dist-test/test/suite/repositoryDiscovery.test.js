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
const vscode_mock_1 = require("../fixtures/vscode-mock");
const RepositoryProvider_1 = require("../../src/repository/RepositoryProvider");
// A CLI stub that only recognises `repoRoot` as a repository.
function cliFor(repoRoot, probed) {
    return {
        runOk: async (cwd) => {
            probed.push(cwd);
            if (cwd !== repoRoot) {
                throw new Error("not a repo");
            }
            return {
                repoMap: {
                    repository: { repositoryId: "r1", title: "muSrs" },
                    counts: { totalInstances: 1, notes: 0, records: 1 },
                },
            };
        },
    };
}
describe("RepositoryProvider.discoverAll — nested repositories (#117)", () => {
    afterEach(() => {
        vscode_mock_1.workspace.workspaceFolders = [];
        vscode_mock_1.workspace.findFilesResult = [];
    });
    it("finds a repository in a subdirectory of the workspace folder", async () => {
        const probed = [];
        vscode_mock_1.workspace.workspaceFolders = [{ uri: { fsPath: "/ws" } }];
        vscode_mock_1.workspace.findFilesResult = [{ fsPath: "/ws/muSrs/manifest.json" }];
        const found = await new RepositoryProvider_1.RepositoryProvider(cliFor("/ws/muSrs", probed)).discoverAll();
        assert.deepStrictEqual(found.map((r) => r.rootPath), ["/ws/muSrs"]);
        assert.ok(probed.includes("/ws"), "still probes the workspace-folder root");
    });
    it("probes a workspace-folder root that also holds the manifest only once", async () => {
        const probed = [];
        vscode_mock_1.workspace.workspaceFolders = [{ uri: { fsPath: "/ws" } }];
        vscode_mock_1.workspace.findFilesResult = [{ fsPath: "/ws/manifest.json" }];
        const found = await new RepositoryProvider_1.RepositoryProvider(cliFor("/ws", probed)).discoverAll();
        assert.strictEqual(found.length, 1);
        assert.strictEqual(probed.filter((p) => p === "/ws").length, 1);
    });
});
//# sourceMappingURL=repositoryDiscovery.test.js.map