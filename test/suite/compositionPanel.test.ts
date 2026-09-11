import * as assert from "assert";
import * as vscode from "vscode";
import { mapProjection, registerCompositionCommands } from "../../src/commands/compositionCommands";
import { registerGraphCommands } from "../../src/commands/graphCommands";
import type { CompositionProjection } from "../../src/cli/types";
import type { LabelInfo } from "../../src/cli/labelMap";

const CID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOTE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Two sections declared out of order: an untitled one (guide-body-view's shape)
// and a titled one holding a tier-0 member that carries no type at all.
const PROJECTION: CompositionProjection = {
  compositionId: CID,
  sections: [
    {
      sectionId: "decisions",
      title: "Decision Log",
      order: 1,
      records: [
        {
          instanceId: NOTE,
          // tier 0: no typeId, no fields, no recordHeading
        },
      ],
    },
    {
      sectionId: "guide-body",
      order: 0,
      records: [
        {
          instanceId: REC,
          typeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          typeVersion: 2,
          typeNamespace: "com.ex",
          typeName: "problem",
          recordHeading: "P-01",
          fields: { body: "text" },
          orderedFieldKeys: ["body"],
          properties: [{ property: "lifecycleState", label: "Status", value: "Active" }],
          relations: [
            {
              relationType: "depends-on",
              direction: "forward",
              label: "Rests on",
              targets: [{ instanceId: REC, displayLabel: "C-01" }],
            },
          ],
        },
      ],
    },
  ],
};

describe("mapProjection", () => {
  const labels = new Map<string, LabelInfo>([[NOTE, { label: "A Note", kind: "note" }]]);

  it("orders sections by `order` and falls back to sectionId when a section has no title", () => {
    const sections = mapProjection(PROJECTION, labels);
    assert.deepStrictEqual(
      sections.map((s) => s.heading),
      ["guide-body", "Decision Log"],
    );
  });

  it("uses the core's recordHeading and never re-derives one", () => {
    const [first] = mapProjection(PROJECTION, labels);
    assert.strictEqual(first.records[0].heading, "P-01");
    assert.strictEqual(first.records[0].typeLabel, "com.ex/problem");
    assert.strictEqual(first.records[0].kind, "record");
    assert.strictEqual(first.records[0].relations.length, 1);
    assert.strictEqual(first.records[0].properties[0].label, "Status");
  });

  it("maps a tier-0 member with no record: label map heading, note kind, empty fields", () => {
    const tier0 = mapProjection(PROJECTION, labels)[1].records[0];
    assert.strictEqual(tier0.heading, "A Note");
    assert.strictEqual(tier0.kind, "note");
    assert.strictEqual(tier0.typeLabel, undefined);
    assert.deepStrictEqual(tier0.fields, {});
    assert.deepStrictEqual(tier0.orderedFieldKeys, []);
    assert.deepStrictEqual(tier0.relations, []);
  });

  it("falls back to a uuid8 stub when neither the projection nor the label map knows the record", () => {
    const tier0 = mapProjection(PROJECTION, new Map())[1].records[0];
    assert.strictEqual(tier0.heading, `${NOTE.slice(0, 8)}…`);
  });

  it("returns no sections for a payload that carries no projection", () => {
    assert.deepStrictEqual(mapProjection(undefined, labels), []);
  });
});

// Answers the render call according to --view-format, the way the CLI does:
// json yields the projection and an empty `rendered`, every other format the
// rendered string and no projection.
class FakeCli {
  calls: string[][] = [];
  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    this.calls.push(args);
    if (args[0] === "render") {
      const format = args[args.indexOf("--view-format") + 1];
      return (format === "json"
        ? { rendered: "", diagnostics: ["[section:x] container not found"], projection: PROJECTION }
        : { rendered: '<div class="srs-document"><h1>Doc</h1></div>', diagnostics: [] }) as T;
    }
    if (args[0] === "note") return { notes: [{ instanceId: NOTE, title: "A Note" }] } as T;
    if (args[0] === "record") return { records: [] } as T;
    if (args[0] === "type") return { schema: { properties: {} } } as T;
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
  cmds(): string[] {
    return this.calls.map((a) => a.join(" "));
  }
}

function openPanel(cli: FakeCli, compositionId: string): Promise<void> {
  const context = { subscriptions: [] as unknown[] };
  const repoProvider = { active: { rootPath: "/repo", repositoryId: "repo-1" } };
  registerCompositionCommands(context as never, cli as never, repoProvider as never);
  const cmd = (vscode as never as { getRegisteredCommand(id: string): (a: unknown) => Promise<void> })
    .getRegisteredCommand("srs.openComposition");
  return cmd({ compositionId, title: "com.ex/doc" });
}

describe("composition document panel", () => {
  it("opens in Document mode against the core's HTML renderer, and surfaces diagnostics on toggle", async () => {
    const cli = new FakeCli();
    const id = "11111111-1111-4111-8111-111111111111";
    await openPanel(cli, id);

    assert.ok(
      cli.cmds().includes(`render composition --view ${id} --view-format html`),
      `expected an html render, got: ${JSON.stringify(cli.cmds())}`,
    );
    const panel = (vscode.window as never as { lastWebviewPanel: { html: string; messageHandler?: (m: unknown) => unknown } })
      .lastWebviewPanel;
    assert.ok(panel.html.includes('class="srs-document"'), "document mode embeds the rendered fragment");
    assert.ok(!panel.html.includes("Decision Log"), "document mode must not render the projection");

    // Toggle to Source: same panel, json render, sections + clickable records.
    await panel.messageHandler!({ type: "mode", mode: "source" });
    assert.ok(
      cli.cmds().includes(`render composition --view ${id} --view-format json`),
      `expected a json render, got: ${JSON.stringify(cli.cmds())}`,
    );
    assert.ok(panel.html.includes("<h2>guide-body</h2>"), "untitled section heads with its id");
    assert.ok(panel.html.includes("<h2>Decision Log</h2>"), "titled section heads with its title");
    assert.ok(panel.html.includes(">P-01<"), "records show their core-resolved heading");
    assert.ok(panel.html.includes(`data-id="${NOTE}" data-kind="note"`), "a tier-0 member opens as a note");
    assert.ok(panel.html.includes("1 diagnostic"), "diagnostics are surfaced, not dropped");

    // ...and back, without re-opening a second panel.
    await panel.messageHandler!({ type: "mode", mode: "document" });
    assert.ok(panel.html.includes('class="srs-document"'), "toggles back to the rendered document");
  });

  it("keeps the format choice and re-renders in that format", async () => {
    const cli = new FakeCli();
    const id = "22222222-2222-4222-8222-222222222222";
    await openPanel(cli, id);
    const panel = (vscode.window as never as { lastWebviewPanel: { html: string; messageHandler?: (m: unknown) => unknown } })
      .lastWebviewPanel;

    await panel.messageHandler!({ type: "format", format: "adoc" });
    assert.ok(cli.cmds().includes(`render composition --view ${id} --view-format adoc`));
    // Re-opening the same composition keeps the format it was left in.
    await openPanel(cli, id);
    assert.strictEqual(
      cli.cmds().filter((c) => c.endsWith("--view-format adoc")).length,
      2,
      "re-opening must not reset the format to html",
    );
  });
});

describe("srs.openEntityById", () => {
  it("opens the entity's preview beside, not raw JSON", async () => {
    const executed = (vscode as never as { executedCommands: Array<{ id: string; args: unknown[] }> })
      .executedCommands;
    executed.length = 0;

    const context = { subscriptions: [] as unknown[] };
    const repoProvider = { active: { rootPath: "/repo", repositoryId: "repo-1" } };
    let openedDocument = false;
    (vscode.workspace as never as { openTextDocument: () => Promise<unknown> }).openTextDocument =
      () => {
        openedDocument = true;
        return Promise.resolve({ uri: { toString: () => "srs-entity://x" } });
      };

    registerGraphCommands(context as never, {} as never, repoProvider as never, {} as never);
    const cmd = (vscode as never as { getRegisteredCommand(id: string): (...a: unknown[]) => Promise<void> })
      .getRegisteredCommand("srs.openEntityById");
    await cmd(REC, "record", "/repo");

    assert.strictEqual(openedDocument, false, "must not open the raw JSON document");
    const preview = executed.find((c) => c.id === "srs.previewEntity");
    assert.ok(preview, `expected srs.previewEntity, got: ${JSON.stringify(executed.map((c) => c.id))}`);
    assert.deepStrictEqual(preview.args[0], {
      entityId: REC,
      entityKind: "record",
      viewColumn: vscode.ViewColumn.Beside,
    });
  });
});
