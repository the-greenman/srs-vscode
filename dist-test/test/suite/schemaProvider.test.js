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
const SchemaProvider_1 = require("../../src/schema/SchemaProvider");
const schemaFor = (glob) => SchemaProvider_1.SCHEMA_ASSOCIATIONS.find((a) => a.glob === glob)?.schema;
describe("SchemaProvider container globs (RFC-051)", () => {
    it("keeps the revision <= 10 single-file container glob", () => {
        assert.strictEqual(schemaFor("**/containers/*.json"), "schemas/2.0/container.json");
    });
    it("maps the revision-11 container head", () => {
        assert.strictEqual(schemaFor("**/containers/*/container.json"), "schemas/2.0/container.json");
    });
    it("leaves the revision-11 entry glob unmapped until the mirror carries its schema (#144)", () => {
        assert.strictEqual(schemaFor("**/containers/*/entries/*.json"), undefined);
    });
});
//# sourceMappingURL=schemaProvider.test.js.map