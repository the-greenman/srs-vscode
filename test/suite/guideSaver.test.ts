import * as assert from "assert";
import { saveGuide } from "../../src/webview/guides/guideSaver";
import { GuideDoc } from "../../src/webview/guides/guideTypes";

// Regression coverage for saveGuide's concurrent save + partial-failure reporting
// (guide + every section save independently and in parallel; a failure in one must
// not be silently indistinguishable from "nothing saved").

class FakeCli {
  updates: string[] = [];
  constructor(private readonly failingInstanceId?: string) {}
  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    if (args[0] === "record" && args[1] === "get") {
      return { record: { fieldValues: {} } } as T;
    }
    if (args[0] === "record" && args[1] === "update") {
      const instanceId = args[2];
      if (instanceId === this.failingInstanceId) {
        throw new Error(`validation failed for ${instanceId}`);
      }
      this.updates.push(instanceId);
      return {} as T;
    }
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
}

function makeGuide(): GuideDoc {
  return {
    containerId: "c-1",
    guideInstanceId: "guide-1",
    guideTypeId: "type-guide",
    guideTypeVersion: 1,
    slug: "s",
    title: "My Guide",
    subtitle: "",
    body: "",
    sections: [
      { instanceId: "sec-1", typeId: "type-text", typeVersion: 1, type: "text", heading: "H1", slug: "s1" },
      { instanceId: "sec-2", typeId: "type-text", typeVersion: 1, type: "text", heading: "H2", slug: "s2" },
      { instanceId: "sec-3", typeId: "type-text", typeVersion: 1, type: "text", heading: "H3", slug: "s3" },
    ],
  };
}

describe("saveGuide", () => {
  it("saves the guide and every section when all succeed", async () => {
    const cli = new FakeCli();
    await saveGuide(cli as never, "/repo", makeGuide());
    assert.deepStrictEqual(cli.updates.sort(), ["guide-1", "sec-1", "sec-2", "sec-3"]);
  });

  it("reports a partial-failure summary naming what succeeded and what failed, instead of a single opaque error", async () => {
    const cli = new FakeCli("sec-2");
    await assert.rejects(
      () => saveGuide(cli as never, "/repo", makeGuide()),
      (err: Error) => {
        assert.match(err.message, /3\/4 saved/);
        assert.match(err.message, /sec-2/);
        return true;
      },
    );
    // The other three saves were already in flight (Promise.allSettled) and must
    // have completed — this is the "already-persisted" state the error must reflect,
    // not silently claim nothing happened.
    assert.deepStrictEqual(cli.updates.sort(), ["guide-1", "sec-1", "sec-3"]);
  });
});
