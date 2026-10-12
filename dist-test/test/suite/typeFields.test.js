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
const typeFields_1 = require("../../src/cli/typeFields");
// Regression coverage for typeFields.ts's JSON-Schema-to-ResolvedField parsing,
// independent of any particular command that calls it.
class FakeCli {
    constructor(properties, required = []) {
        this.properties = properties;
        this.required = required;
    }
    async runOk(_repoPath, _args) {
        return { schema: { properties: this.properties, required: this.required } };
    }
}
describe("resolveTypeFields — label fallback", () => {
    it("uses a short title as the display label", async () => {
        const cli = new FakeCli({ room: { type: "string", title: "Room" } });
        const fields = await (0, typeFields_1.resolveTypeFields)(cli, "/repo", "type-1");
        assert.strictEqual(fields[0].displayLabel, "Room");
    });
    it("shows the field name when there is no title", async () => {
        const cli = new FakeCli({ ratified_at: { type: "string" } });
        const fields = await (0, typeFields_1.resolveTypeFields)(cli, "/repo", "type-1");
        assert.strictEqual(fields[0].displayLabel, "ratified_at");
    });
    it("keeps a long authored label unchanged", async () => {
        const label = "Date the assembly ratified and formally recorded the decision";
        const cli = new FakeCli({ ratified_at: { type: "string", title: label } });
        const fields = await (0, typeFields_1.resolveTypeFields)(cli, "/repo", "type-1");
        assert.strictEqual(fields[0].displayLabel, label);
    });
    it("reads help from x-srs-description, not the aiGuidance description", async () => {
        const cli = new FakeCli({
            room: { type: "string", description: "Fill with the room name.", "x-srs-description": "Where the meeting is held." },
        });
        const fields = await (0, typeFields_1.resolveTypeFields)(cli, "/repo", "type-1");
        assert.strictEqual(fields[0].description, "Where the meeting is held.");
    });
});
//# sourceMappingURL=typeFields.test.js.map