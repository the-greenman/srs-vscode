import * as assert from "assert";
import * as vscode from "vscode";
import { registerEditCommands } from "../../src/commands/editCommands";
import { registerMutationCommands } from "../../src/commands/mutationCommands";
import { EntityNode } from "../../src/tree/SrsTreeDataProvider";

// Regression test for #76: the tag write surface (create/edit/delete) targeted
// CLI subcommands (`tag create`, `tag update`, `tag delete`) that no longer
// exist — `srs tag` only supports `list`/`get` since the move to RFC-006
// vocabulary terms. Those calls failed at runtime. The fix removes the dead
// write surface entirely; tags stay read-only (list/get) in the extension
// until a real term-authoring CLI surface exists (#73).

class FakeCli {
  calls: string[][] = [];
  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    this.calls.push(args);
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
  cmds(): string[] {
    return this.calls.map((a) => a.join(" "));
  }
}

function makeContext() {
  return { subscriptions: [] as unknown[] };
}

describe("tag CRUD dead-surface removal (#76)", () => {
  it("does not register a srs.createTag command", () => {
    const cli = new FakeCli();
    const repoProvider = { active: { rootPath: "/repo" } };
    const attention = { active: undefined };
    const treeProvider = { refresh: () => {} };

    registerMutationCommands(
      makeContext() as never,
      cli as never,
      repoProvider as never,
      attention as never,
      treeProvider as never,
    );

    const cmd = (vscode as never as { getRegisteredCommand(id: string): unknown })
      .getRegisteredCommand("srs.createTag");
    assert.strictEqual(cmd, undefined, "srs.createTag must not be registered");
  });

  it("editing a tag entity does not invoke `tag update`", async () => {
    const cli = new FakeCli();
    const repoProvider = { active: { rootPath: "/repo" } };
    const treeProvider = { refresh: () => {} };

    registerEditCommands(makeContext() as never, cli as never, repoProvider as never, treeProvider as never);

    const editCmd = (vscode as never as { getRegisteredCommand(id: string): (node: unknown) => Promise<void> })
      .getRegisteredCommand("srs.editEntity");
    assert.ok(editCmd, "expected srs.editEntity to be registered");

    const node = new EntityNode("tag-1", "tag", "needs-review", ["tag", "get", "tag-1"]);
    await editCmd(node);

    assert.ok(
      !cli.cmds().some((c) => c.startsWith("tag update") || c.startsWith("tag create")),
      "must never invoke a nonexistent tag write subcommand",
    );
  });

  it("deleting a tag entity does not invoke `tag delete`", async () => {
    const cli = new FakeCli();
    const repoProvider = { active: { rootPath: "/repo" } };
    const treeProvider = { refresh: () => {} };
    const attention = { active: undefined };

    registerMutationCommands(
      makeContext() as never,
      cli as never,
      repoProvider as never,
      attention as never,
      treeProvider as never,
    );

    const deleteCmd = (vscode as never as { getRegisteredCommand(id: string): (node: unknown) => Promise<void> })
      .getRegisteredCommand("srs.deleteEntity");
    assert.ok(deleteCmd, "expected srs.deleteEntity to be registered");

    // The mock's showWarningMessage always resolves undefined (no confirm
    // dialog picked); simulate the user confirming so the delete path
    // actually runs and we can assert what CLI args it would use.
    const original = vscode.window.showWarningMessage;
    vscode.window.showWarningMessage = (() => Promise.resolve("Delete")) as never;
    try {
      const node = new EntityNode("tag-1", "tag", "needs-review", ["tag", "get", "tag-1"]);
      await deleteCmd(node);
    } finally {
      vscode.window.showWarningMessage = original;
    }

    assert.ok(
      !cli.cmds().some((c) => c.startsWith("tag delete")),
      "must never invoke a nonexistent tag delete subcommand",
    );
  });
});
