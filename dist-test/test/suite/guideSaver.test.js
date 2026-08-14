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
const guideSaver_1 = require("../../src/webview/guides/guideSaver");
// Regression coverage for saveGuide's concurrent save + partial-failure reporting
// (guide + every section save independently and in parallel; a failure in one must
// not be silently indistinguishable from "nothing saved").
class FakeCli {
    constructor(failingInstanceId) {
        this.failingInstanceId = failingInstanceId;
        this.updates = [];
    }
    async runOk(_repoPath, args) {
        if (args[0] === "record" && args[1] === "get") {
            return { record: { fieldValues: {} } };
        }
        if (args[0] === "record" && args[1] === "update") {
            const instanceId = args[2];
            if (instanceId === this.failingInstanceId) {
                throw new Error(`validation failed for ${instanceId}`);
            }
            this.updates.push(instanceId);
            return {};
        }
        throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
}
function makeGuide() {
    return {
        containerId: "c-1",
        guideInstanceId: "guide-1",
        guideTypeId: "type-guide",
        guideTypeVersion: 1,
        slug: "s",
        title: "My Guide",
        subtitle: "",
        body: "",
        sections: [
            { instanceId: "sec-1", typeId: "type-text", typeVersion: 1, type: "text", heading: "H1", slug: "s1" },
            { instanceId: "sec-2", typeId: "type-text", typeVersion: 1, type: "text", heading: "H2", slug: "s2" },
            { instanceId: "sec-3", typeId: "type-text", typeVersion: 1, type: "text", heading: "H3", slug: "s3" },
        ],
    };
}
describe("saveGuide", () => {
    it("saves the guide and every section when all succeed", async () => {
        const cli = new FakeCli();
        await (0, guideSaver_1.saveGuide)(cli, "/repo", makeGuide());
        assert.deepStrictEqual(cli.updates.sort(), ["guide-1", "sec-1", "sec-2", "sec-3"]);
    });
    it("reports a partial-failure summary naming what succeeded and what failed, instead of a single opaque error", async () => {
        const cli = new FakeCli("sec-2");
        await assert.rejects(() => (0, guideSaver_1.saveGuide)(cli, "/repo", makeGuide()), (err) => {
            assert.match(err.message, /3\/4 saved/);
            assert.match(err.message, /sec-2/);
            return true;
        });
        // The other three saves were already in flight (Promise.allSettled) and must
        // have completed — this is the "already-persisted" state the error must reflect,
        // not silently claim nothing happened.
        assert.deepStrictEqual(cli.updates.sort(), ["guide-1", "sec-1", "sec-3"]);
    });
});
//# sourceMappingURL=guideSaver.test.js.map