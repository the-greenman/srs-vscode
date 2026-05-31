import * as assert from "assert";
import { GroupNode, EntityNode } from "../../src/tree/SrsTreeDataProvider";

// Unit tests for the tree node classes themselves — no VS Code API needed,
// no CliClient spawning, no RepositoryProvider. Tests that require
// SrsTreeDataProvider with mocked dependencies belong in integration tests.

describe("GroupNode", () => {
  it("shows count in label when count > 0", () => {
    const node = new GroupNode("note", "Notes", 5);
    assert.ok((node.label as string).includes("5"));
  });

  it("shows plain label when count is 0", () => {
    const node = new GroupNode("tag", "Tags", 0);
    // label should not contain "(0)" to avoid visual noise for unknown counts
    assert.strictEqual(node.label, "Tags");
  });

  it("sets contextValue to srsGroup", () => {
    const node = new GroupNode("record", "Records", 10);
    assert.strictEqual(node.contextValue, "srsGroup");
  });
});

describe("EntityNode", () => {
  it("sets entityId and entityKind", () => {
    const node = new EntityNode(
      "abc-123",
      "note",
      "My Note",
      ["note", "get", "abc-123"],
    );
    assert.strictEqual(node.entityId, "abc-123");
    assert.strictEqual(node.entityKind, "note");
  });

  it("sets contextValue to srsEntity", () => {
    const node = new EntityNode("id", "tag", "Label", ["tag", "get", "id"]);
    assert.strictEqual(node.contextValue, "srsEntity");
  });

  it("stores correct getArgs for note", () => {
    const node = new EntityNode(
      "note-001",
      "note",
      "First Note",
      ["note", "get", "note-001"],
    );
    assert.deepStrictEqual(node.getArgs, ["note", "get", "note-001"]);
  });

  it("stores correct getArgs for container", () => {
    const node = new EntityNode(
      "cont-001",
      "container",
      "Sprint 1",
      ["container", "get", "cont-001"],
    );
    assert.deepStrictEqual(node.getArgs, ["container", "get", "cont-001"]);
  });

  it("command triggers srs.openEntityDefault with self as argument", () => {
    const node = new EntityNode("id", "record", "Label", ["record", "get", "id"]);
    assert.strictEqual(node.command?.command, "srs.openEntityDefault");
    assert.deepStrictEqual(node.command?.arguments, [node]);
  });

  it("description shows first 8 chars of id", () => {
    const node = new EntityNode(
      "abcdefgh-1234-5678-abcd-ef0123456789",
      "note",
      "Title",
      ["note", "get", "abcdefgh-1234-5678-abcd-ef0123456789"],
    );
    assert.strictEqual(node.description, "abcdefgh");
  });
});
