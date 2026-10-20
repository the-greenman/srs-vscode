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
const guideLoader_1 = require("../../src/webview/guides/guideLoader");
// Coverage for loadGuide's anchor resolution. anchorInstanceId (RFC-013
// amended, I-145) is the only source of the guide record: the
// rootInstanceIds[0] positional fallback is withdrawn at dataModelRevision 8
// (RFC-043 [R4]), so a container without an anchor is an error, never a guess.
const GUIDE_ID = "guide-1";
const CONTAINER_ID = "c-1";
class FakeCli {
    constructor(container) {
        this.container = container;
    }
    async runOk(_repoPath, args) {
        if (args[0] === "container" && args[1] === "get") {
            return { container: { containerId: CONTAINER_ID, title: "Guide", ...this.container } };
        }
        if (args[0] === "record" && args[1] === "get") {
            const instanceId = args[2];
            return {
                record: {
                    instanceId,
                    typeId: "8f138dd6-11d2-42a5-99ec-3d6e23bed54f",
                    typeName: "guide",
                    typeNamespace: "com.mudemocracy",
                    typeVersion: 1,
                    fieldValues: { title: "My Guide", slug: "my-guide", subtitle: "", body: "" },
                },
            };
        }
        if (args[0] === "relation" && args[1] === "list") {
            return { relations: [] };
        }
        throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
}
describe("loadGuide — anchor resolution", () => {
    it("uses anchorInstanceId", async () => {
        const cli = new FakeCli({ memberInstanceIds: [GUIDE_ID], anchorInstanceId: GUIDE_ID });
        const doc = await (0, guideLoader_1.loadGuide)(cli, "/repo", CONTAINER_ID);
        assert.strictEqual(doc.guideInstanceId, GUIDE_ID);
    });
    it("throws a clear error, with no positional fallback, when anchorInstanceId is absent", async () => {
        // A stale pre-revision-8 rootInstanceIds must be ignored, not used.
        const cli = new FakeCli({
            memberInstanceIds: [GUIDE_ID],
            rootInstanceIds: [GUIDE_ID],
        });
        await assert.rejects(() => (0, guideLoader_1.loadGuide)(cli, "/repo", CONTAINER_ID), (err) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /has no anchorInstanceId/);
            return true;
        });
    });
});
//# sourceMappingURL=guideLoader.test.js.map