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
const SrsTreeDataProvider_1 = require("../../src/tree/SrsTreeDataProvider");
// Unit tests for the tree node classes themselves — no VS Code API needed,
// no CliClient spawning, no RepositoryProvider. Tests that require
// SrsTreeDataProvider with mocked dependencies belong in integration tests.
describe("GroupNode", () => {
    it("shows count in label when count > 0", () => {
        const node = new SrsTreeDataProvider_1.GroupNode("note", "Notes", 5);
        assert.ok(node.label.includes("5"));
    });
    it("shows plain label when count is 0", () => {
        const node = new SrsTreeDataProvider_1.GroupNode("tag", "Tags", 0);
        // label should not contain "(0)" to avoid visual noise for unknown counts
        assert.strictEqual(node.label, "Tags");
    });
    it("sets contextValue to srsGroup", () => {
        const node = new SrsTreeDataProvider_1.GroupNode("record", "Records", 10);
        assert.strictEqual(node.contextValue, "srsGroup");
    });
});
describe("EntityNode", () => {
    it("sets entityId and entityKind", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("abc-123", "note", "My Note", ["note", "get", "abc-123"]);
        assert.strictEqual(node.entityId, "abc-123");
        assert.strictEqual(node.entityKind, "note");
    });
    it("sets a per-kind contextValue under the srsEntity prefix", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("id", "tag", "Label", ["tag", "get", "id"]);
        assert.strictEqual(node.contextValue, "srsEntity.tag");
    });
    it("camelCases kebab-case kinds in the contextValue suffix", () => {
        // The relation-type menu targets `srsEntity.relationType`, so kebab kinds
        // must collapse to a regex-safe camelCase suffix.
        const rt = new SrsTreeDataProvider_1.EntityNode("id", "relation-type", "RT", ["relation-type", "get", "id"]);
        assert.strictEqual(rt.contextValue, "srsEntity.relationType");
        const container = new SrsTreeDataProvider_1.EntityNode("id", "container", "C", ["container", "get", "id"]);
        assert.strictEqual(container.contextValue, "srsEntity.container");
    });
    it("stores correct getArgs for note", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("note-001", "note", "First Note", ["note", "get", "note-001"]);
        assert.deepStrictEqual(node.getArgs, ["note", "get", "note-001"]);
    });
    it("stores correct getArgs for container", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("cont-001", "container", "Sprint 1", ["container", "get", "cont-001"]);
        assert.deepStrictEqual(node.getArgs, ["container", "get", "cont-001"]);
    });
    it("command triggers srs.openEntityDefault with self as argument", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("id", "record", "Label", ["record", "get", "id"]);
        assert.strictEqual(node.command?.command, "srs.openEntityDefault");
        assert.deepStrictEqual(node.command?.arguments, [node]);
    });
    it("description shows first 8 chars of id when no description is given", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("abcdefgh-1234-5678-abcd-ef0123456789", "note", "Title", ["note", "get", "abcdefgh-1234-5678-abcd-ef0123456789"]);
        assert.strictEqual(node.description, "abcdefgh");
    });
    it("uses the given description instead of the id stub when provided", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("abcdefgh-1234-5678-abcd-ef0123456789", "record", "P-74", ["record", "get", "abcdefgh-1234-5678-abcd-ef0123456789"], "com.mudemocracy.argument/problem");
        assert.strictEqual(node.description, "com.mudemocracy.argument/problem");
    });
    it("uses composition (no rename artifacts) as the contextValue suffix", () => {
        const node = new SrsTreeDataProvider_1.EntityNode("id", "composition", "guide-body-view", ["composition", "get", "id"]);
        assert.strictEqual(node.contextValue, "srsEntity.composition");
    });
    it("extension kind has no uuid8 description — entityId IS the label", () => {
        // `repo extensions list` returns bare strings, not instances with an
        // instanceId; slicing one like a UUID would produce a meaningless stub.
        const node = new SrsTreeDataProvider_1.EntityNode("ext:lifecycle", "extension", "ext:lifecycle", ["repo", "extensions", "list"]);
        assert.strictEqual(node.description, undefined);
        assert.strictEqual(node.tooltip, "ext:lifecycle");
    });
});
describe("ErrorNode", () => {
    it("carries the message as label and tooltip under the srsError contextValue", () => {
        const node = new SrsTreeDataProvider_1.ErrorNode("Failed to load record: boom");
        assert.strictEqual(node.label, "Failed to load record: boom");
        assert.strictEqual(node.tooltip, "Failed to load record: boom");
        assert.strictEqual(node.contextValue, "srsError");
    });
});
//# sourceMappingURL=SrsTreeDataProvider.test.js.map