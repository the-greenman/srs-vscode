import * as assert from "assert";
import * as vscode from "vscode";
import { EntityNode } from "../../src/tree/SrsTreeDataProvider";
import { DocViewNode } from "../../src/tree/NavigatorTreeDataProvider";
import { registerPreviewCommands } from "../../src/commands/previewCommands";

// Two document views with distinct namespaces/versions, used to assert the
// picker item shape (label / description / detail) required by fix #1.
const V1 = { id: "11111111-1111-4111-8111-111111111111", name: "spec-doc", namespace: "com.ex.a", version: 2 };
const V2 = { id: "22222222-2222-4222-8222-222222222222", name: "rfc-doc", namespace: "com.ex.b", version: 1 };
const CID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Records every CLI invocation and returns canned payloads keyed by the command.
class FakeCli {
  calls: string[][] = [];
  constructor(
    private readonly full: unknown,
    private readonly filtered: unknown,
  ) {}
  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    this.calls.push(args);
    if (args[0] === "document-view" && args[1] === "list-for-container") {
      return this.filtered as T;
    }
    if (args[0] === "document-view" && args[1] === "list") {
      return this.full as T;
    }
    if (args[0] === "render") {
      return { rendered: "# Rendered\n\nbody", diagnostics: [] } as T;
    }
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
  cmds(): string[] {
    return this.calls.map((a) => a.join(" "));
  }
}

function invokeRender(cli: FakeCli, attentionActive: unknown, node: unknown): Promise<void> {
  const context = { subscriptions: [] as unknown[] };
  const repoProvider = { active: { rootPath: "/repo" } };
  const attention = { active: attentionActive };
  registerPreviewCommands(
    context as never,
    cli as never,
    repoProvider as never,
    attention as never,
  );
  const cmd = (vscode as never as { getRegisteredCommand(id: string): (n: unknown) => Promise<void> })
    .getRegisteredCommand("srs.previewRender");
  return cmd(node);
}

describe("cmdPreviewRender", () => {
  beforeEach(() => {
    (vscode.window as never as { quickPickIndex: number }).quickPickIndex = 0;
    (vscode.window as never as { lastQuickPick: unknown }).lastQuickPick = undefined;
  });

  it("(a) container node: type-filters via list-for-container, falls back to full list when empty, then renders the picked view", async () => {
    const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
    const node = new EntityNode(CID, "container", "My Container", ["container", "get", CID]);

    await invokeRender(cli, undefined, node);

    const cmds = cli.cmds();
    // container context → list-for-container FIRST, using the container's own id
    assert.ok(
      cmds.includes(`document-view list-for-container ${CID}`),
      `expected list-for-container call, got: ${JSON.stringify(cmds)}`,
    );
    // filtered result empty → fall back to the unfiltered list
    assert.ok(cmds.includes("document-view list"), "expected fallback to full list");

    // Picker item shape (fix #1): label=namespace/name, description=v<version>, detail=id
    const capture = (vscode.window as never as { lastQuickPick: { items: Array<Record<string, unknown>>; options: Record<string, unknown> } }).lastQuickPick;
    assert.ok(capture, "expected a QuickPick to be shown");
    assert.deepStrictEqual(capture.items[0].label, "com.ex.a/spec-doc");
    assert.deepStrictEqual(capture.items[0].description, "v2");
    assert.deepStrictEqual(capture.items[0].detail, V1.id);
    assert.strictEqual(capture.options.matchOnDescription, true);
    assert.strictEqual(capture.options.matchOnDetail, true);

    // Renders the picked (index 0) view, WITHOUT injecting --container
    assert.ok(
      cmds.includes(`render document-view --view ${V1.id}`),
      `expected plain render of picked view, got: ${JSON.stringify(cmds)}`,
    );
    assert.ok(
      !cmds.some((c) => c.startsWith("render") && c.includes("--container")),
      "container context must not be injected into the render call",
    );
  });

  it("(a') record node with an active container: filters via that container and uses the filtered set (no fallback)", async () => {
    const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [V2] });
    const node = new EntityNode("rec-1", "record", "A Record", ["record", "get", "rec-1"]);

    await invokeRender(cli, { containerId: CID, title: "Ctx" }, node);

    const cmds = cli.cmds();
    assert.ok(cmds.includes(`document-view list-for-container ${CID}`), "record resolves to active container");
    // filtered set non-empty → the full list is NOT consulted (genuine narrowing)
    assert.ok(!cmds.includes("document-view list"), "should not fall back when filtered set is non-empty");
    const capture = (vscode.window as never as { lastQuickPick: { items: Array<Record<string, unknown>> } }).lastQuickPick;
    assert.strictEqual(capture.items.length, 1);
    assert.strictEqual(capture.items[0].detail, V2.id);
  });

  it("(no context) uses the full list when there is no container context", async () => {
    const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
    const node = new EntityNode("rec-1", "record", "A Record", ["record", "get", "rec-1"]);

    await invokeRender(cli, undefined, node);

    const cmds = cli.cmds();
    assert.ok(!cmds.some((c) => c.startsWith("document-view list-for-container")), "no container context → no list-for-container");
    assert.ok(cmds.includes("document-view list"), "expected the full list");
  });

  it("(b) DocViewNode (Navigator): renders directly with no picker", async () => {
    const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
    const node = new DocViewNode(V1.id, "com.ex.a/spec-doc", []);

    await invokeRender(cli, undefined, node);

    const capture = (vscode.window as never as { lastQuickPick: unknown }).lastQuickPick;
    assert.strictEqual(capture, undefined, "direct render must not show a picker");
    assert.ok(cli.cmds().includes(`render document-view --view ${V1.id}`), "should render the node's view directly");
  });

  it("(b') document-view EntityNode (main tree): renders directly with no picker", async () => {
    const cli = new FakeCli({ documentViews: [V1, V2] }, { documentViews: [] });
    const node = new EntityNode(V2.id, "document-view", "com.ex.b/rfc-doc", ["document-view", "get", V2.id]);

    await invokeRender(cli, undefined, node);

    const capture = (vscode.window as never as { lastQuickPick: unknown }).lastQuickPick;
    assert.strictEqual(capture, undefined, "direct render must not show a picker");
    assert.ok(cli.cmds().includes(`render document-view --view ${V2.id}`), "should render the node's view directly");
  });
});
