import * as assert from "assert";
import * as vscode from "vscode";
import { registerEditCommands } from "../../src/commands/editCommands";

// Regression test for #46: cmdCreateRelation must not fall back to a
// hardcoded canonical relation-type list (R3 — no client ships its own
// vocabulary). An empty `relation-type list` payload means the repo has no
// installed relation types, and that state must be surfaced, not papered
// over with invented types that would fail server-side resolution.

class FakeCli {
  calls: string[][] = [];
  constructor(private readonly relationTypes: Array<Record<string, unknown>>) {}
  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    this.calls.push(args);
    if (args[0] === "relation-type" && args[1] === "list") {
      return { relationTypeDefinitions: this.relationTypes } as T;
    }
    if (args[0] === "note" && args[1] === "list") {
      return { notes: [] } as T;
    }
    if (args[0] === "record" && args[1] === "list") {
      return { records: [] } as T;
    }
    if (args[0] === "relation" && args[1] === "create") {
      return {} as T;
    }
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
  cmds(): string[] {
    return this.calls.map((a) => a.join(" "));
  }
}

function invokeCreateRelation(cli: FakeCli): Promise<void> {
  const context = { subscriptions: [] as unknown[] };
  const repoProvider = { active: { rootPath: "/repo" } };
  const treeProvider = { refresh: () => {} };
  registerEditCommands(context as never, cli as never, repoProvider as never, treeProvider as never);
  const cmd = (vscode as never as { getRegisteredCommand(id: string): () => Promise<void> })
    .getRegisteredCommand("srs.createRelation");
  return cmd();
}

describe("cmdCreateRelation", () => {
  beforeEach(() => {
    (vscode.window as never as { quickPickIndex: number }).quickPickIndex = 0;
    (vscode.window as never as { lastQuickPick: unknown }).lastQuickPick = undefined;
  });

  it("does not fall back to a hardcoded canonical type list when relation-type list is empty", async () => {
    const cli = new FakeCli([]);

    await invokeCreateRelation(cli);

    // No QuickPick of relation types was ever shown — the command must bail
    // out on the "no relation types installed" warning instead of inventing
    // canonical built-ins (contains/depends-on/supersedes/...).
    const capture = (vscode.window as never as { lastQuickPick: unknown }).lastQuickPick;
    assert.strictEqual(capture, undefined, "must not show a picker when no relation types are installed");

    // And it must never proceed to create a relation with an invented type.
    assert.ok(
      !cli.cmds().some((c) => c.startsWith("relation create")),
      "must not attempt to create a relation when no types are installed",
    );
  });

  it("offers only the repo's installed relation types (no invented built-ins mixed in)", async () => {
    const cli = new FakeCli([
      { id: "rt-1", relationType: "custom-link", label: "Custom Link", namespace: "com.example" },
    ]);

    await invokeCreateRelation(cli);

    const capture = (vscode.window as never as { lastQuickPick: { items: Array<Record<string, unknown>> } })
      .lastQuickPick;
    assert.ok(capture, "expected a relation-type QuickPick");
    assert.strictEqual(capture.items.length, 1);
    assert.strictEqual(capture.items[0].description, "custom-link");
    assert.ok(
      !capture.items.some((i) => i.description === "contains" || i.description === "depends-on"),
      "must not mix in hardcoded canonical types alongside the repo's real types",
    );
  });
});
