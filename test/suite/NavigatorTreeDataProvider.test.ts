import * as assert from "assert";
import {
  NavigatorTreeDataProvider,
  CompositionNode,
  CompositionSectionNode,
  EmptyNode,
} from "../../src/tree/NavigatorTreeDataProvider";

// Regression coverage for srs-vscode#119 workstream 2: the Navigator's
// composition section drill-down was rebuilt around the real `source.type`
// discriminant (container-subset / discovery-query) since the CLI's rename
// (DocumentView -> Composition, srs-rust PR #921/f7c9bfec) also collapsed
// away `semanticObjectType`, the field the old code keyed off of — making
// every section unexpandable regardless of the payload-key fix alone.

const REPO_PATH = "/repo";

class FakeCli {
  calls: string[][] = [];
  constructor(private readonly responses: Record<string, unknown>) {}
  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    this.calls.push(args);
    const key = args.slice(0, 2).join(" ");
    if (key in this.responses) return this.responses[key] as T;
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
}

function fakeRepoProvider(rootPath: string) {
  return {
    active: { rootPath, repositoryId: "r1" },
    onDidChangeActive: () => ({ dispose() { /* no-op */ } }),
  };
}

describe("NavigatorTreeDataProvider — composition sections", () => {
  it("a container-subset section resolves its members via container resolve-view", async () => {
    const cli = new FakeCli({
      "composition list": {
        compositions: [{ id: "comp-1", namespace: "com.ex", name: "guide-body-view", version: 1 }],
      },
      "composition get": {
        composition: {
          sections: [
            { sectionId: "guide-body", title: "Body", source: { type: "container-subset", containerId: "cont-1" } },
          ],
        },
      },
      "container resolve-view": {
        containerView: {
          members: [
            { instanceId: "rec-1", tier: 2, displayLabel: "P-01", isVisibleByDefault: true },
          ],
        },
      },
    });
    const nav = new NavigatorTreeDataProvider(cli as never, fakeRepoProvider(REPO_PATH) as never);
    nav.setMode("compositions");

    const roots = await nav.getChildren();
    assert.strictEqual(roots.length, 1);
    const comp = roots[0] as CompositionNode;
    assert.ok(comp instanceof CompositionNode);

    const sections = await nav.getChildren(comp);
    assert.strictEqual(sections.length, 1);
    const section = sections[0] as CompositionSectionNode;
    assert.ok(section instanceof CompositionSectionNode);
    assert.strictEqual(section.label, "Body");

    const records = await nav.getChildren(section);
    assert.strictEqual(records.length, 1);
    assert.strictEqual((records[0] as { label?: unknown }).label, "P-01");
    assert.ok(
      cli.calls.some((c) => c.join(" ") === "container resolve-view cont-1"),
      `expected a resolve-view call, got: ${JSON.stringify(cli.calls)}`,
    );
  });

  it("a discovery-query section resolves via record list --type namespace/name (not a UUID)", async () => {
    const cli = new FakeCli({
      "composition list": {
        compositions: [{ id: "comp-2", namespace: "com.ex", name: "problem-statements-document", version: 1 }],
      },
      "composition get": {
        composition: {
          sections: [
            {
              sectionId: "problem-set-root",
              title: "Problem statements",
              source: { type: "discovery-query", query: { typeNamespace: "com.ex.argument", typeName: "problem-set" } },
            },
          ],
        },
      },
      "record list": { records: [{ instanceId: "rec-2", displayLabel: "Problem statements" }] },
    });
    const nav = new NavigatorTreeDataProvider(cli as never, fakeRepoProvider(REPO_PATH) as never);
    nav.setMode("compositions");

    const [comp] = await nav.getChildren();
    const [section] = await nav.getChildren(comp);
    const records = await nav.getChildren(section);

    assert.strictEqual(records.length, 1);
    assert.ok(
      cli.calls.some((c) => c.join(" ") === "record list --type com.ex.argument/problem-set"),
      `expected a namespace/name --type call, got: ${JSON.stringify(cli.calls)}`,
    );
  });

  it("a section with no title falls back to its sectionId", async () => {
    const cli = new FakeCli({
      "composition list": {
        compositions: [{ id: "comp-3", namespace: "com.ex", name: "guide-body-view", version: 1 }],
      },
      "composition get": {
        composition: {
          sections: [{ sectionId: "guide-body", source: { type: "container-subset", containerId: "cont-1" } }],
        },
      },
    });
    const nav = new NavigatorTreeDataProvider(cli as never, fakeRepoProvider(REPO_PATH) as never);
    nav.setMode("compositions");

    const [comp] = await nav.getChildren();
    const [section] = await nav.getChildren(comp);
    assert.strictEqual((section as CompositionSectionNode).label, "guide-body");
  });

  it("a section with no resolvable source shape is a leaf, not silently expandable-but-empty", async () => {
    const cli = new FakeCli({
      "composition list": {
        compositions: [{ id: "comp-4", namespace: "com.ex", name: "weird-view", version: 1 }],
      },
      "composition get": {
        composition: { sections: [{ sectionId: "mystery", title: "Mystery", source: { type: "something-new" } }] },
      },
    });
    const nav = new NavigatorTreeDataProvider(cli as never, fakeRepoProvider(REPO_PATH) as never);
    nav.setMode("compositions");

    const [comp] = await nav.getChildren();
    const [section] = await nav.getChildren(comp);
    // vscode.TreeItemCollapsibleState.None === 0 in the mock enum
    assert.strictEqual((section as CompositionSectionNode).collapsibleState, 0);
  });

  it("a failing composition list yields an EmptyNode, not a thrown error", async () => {
    const cli = new FakeCli({});
    const nav = new NavigatorTreeDataProvider(cli as never, fakeRepoProvider(REPO_PATH) as never);
    nav.setMode("compositions");

    const roots = await nav.getChildren();
    assert.strictEqual(roots.length, 1);
    assert.ok(roots[0] instanceof EmptyNode);
  });
});
