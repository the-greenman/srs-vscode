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
    it("falls back to the field name when `title` is a long description sentence, not a real label", async () => {
        // srs-rust's title fallback is displayLabel ?? description, never the field
        // name — a field with no displayLabel and a long description would otherwise
        // show that whole sentence, uppercased, as its form/preview/table-header label.
        const cli = new FakeCli({
            ratified_at: {
                type: "string",
                title: "The date the decision was ratified by the assembly and formally recorded",
            },
        });
        const fields = await (0, typeFields_1.resolveTypeFields)(cli, "/repo", "type-1");
        assert.strictEqual(fields[0].displayLabel, "ratified_at");
    });
});
//# sourceMappingURL=typeFields.test.js.map