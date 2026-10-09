import * as assert from "assert";
import * as vscode from "vscode";
import { registerMutationCommands } from "../../src/commands/mutationCommands";
import { EntityNode } from "../../src/tree/SrsTreeDataProvider";
import { CliError } from "../../src/cli/CliClient";

// Regression test for #131: `cmdDeleteEntity`'s in-use detection matched
// `diagnostics` text for "CannotDeleteInUse" / "used by", but the engine
// emits neither — the real message is "cannot delete X 'id': still
// referenced by [...]" (srs-rust error.rs). Since srs-rust#1338 landed, every
// `ok:false` envelope also carries a structured `errors[]` with a stable
// `code` (ADR-053); the fix branches on `code === "cannot-delete-in-use"`
// instead of matching prose.

class FakeCli {
  constructor(private readonly failWith: unknown) {}
  async runOk<T>(): Promise<T> {
    throw this.failWith;
  }
}

function makeContext() {
  return { subscriptions: [] as unknown[] };
}

describe("delete in-use detection (#131)", () => {
  it("shows the referenced-by modal when the engine reports cannot-delete-in-use", async () => {
    const cliError = new CliError(
      "srs type delete failed: cannot delete Type 'abc': still referenced by [rec-1, rec-2]",
      ["cannot delete Type 'abc': still referenced by [rec-1, rec-2]"],
      "type",
      [
        {
          code: "cannot-delete-in-use",
          message: "cannot delete Type 'abc': still referenced by [rec-1, rec-2]",
          details: { usedBy: ["rec-1", "rec-2"] },
        },
      ],
    );
    const cli = new FakeCli(cliError);
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

    const deleteCmd = (
      vscode as never as {
        getRegisteredCommand(id: string): (node: unknown) => Promise<void>;
      }
    ).getRegisteredCommand("srs.deleteEntity");
    assert.ok(deleteCmd, "expected srs.deleteEntity to be registered");

    const originalWarn = vscode.window.showWarningMessage;
    const originalError = vscode.window.showErrorMessage;
    const errorCalls: unknown[][] = [];
    vscode.window.showWarningMessage = (() => Promise.resolve("Delete")) as never;
    vscode.window.showErrorMessage = ((...args: unknown[]) => {
      errorCalls.push(args);
      return Promise.resolve(undefined);
    }) as never;
    try {
      const node = new EntityNode("abc", "view", "Thing", ["view", "get", "abc"]);
      await deleteCmd(node);
    } finally {
      vscode.window.showWarningMessage = originalWarn;
      vscode.window.showErrorMessage = originalError;
    }

    assert.strictEqual(errorCalls.length, 1, "expected exactly one showErrorMessage call");
    const [message, options] = errorCalls[0];
    assert.ok(
      (message as string).includes("referenced by other entities"),
      `expected the in-use modal, got: ${message}`,
    );
    assert.ok((message as string).includes("rec-1, rec-2"), `expected usedBy in message: ${message}`);
    assert.deepStrictEqual(options, { modal: true });
  });

  it("falls back to the generic error for an unrelated CliError", async () => {
    const cliError = new CliError(
      "srs type delete failed: type not found",
      ["type not found"],
      "type",
      [{ code: "type-not-found", message: "type not found" }],
    );
    const cli = new FakeCli(cliError);
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

    const deleteCmd = (
      vscode as never as {
        getRegisteredCommand(id: string): (node: unknown) => Promise<void>;
      }
    ).getRegisteredCommand("srs.deleteEntity");

    const originalWarn = vscode.window.showWarningMessage;
    const originalError = vscode.window.showErrorMessage;
    const errorCalls: unknown[][] = [];
    vscode.window.showWarningMessage = (() => Promise.resolve("Delete")) as never;
    vscode.window.showErrorMessage = ((...args: unknown[]) => {
      errorCalls.push(args);
      return Promise.resolve(undefined);
    }) as never;
    try {
      const node = new EntityNode("abc", "view", "Thing", ["view", "get", "abc"]);
      await deleteCmd!(node);
    } finally {
      vscode.window.showWarningMessage = originalWarn;
      vscode.window.showErrorMessage = originalError;
    }

    assert.strictEqual(errorCalls.length, 1, "expected exactly one showErrorMessage call");
    const [message] = errorCalls[0];
    assert.ok(
      !(message as string).includes("referenced by other entities"),
      `did not expect the in-use modal, got: ${message}`,
    );
  });
});
