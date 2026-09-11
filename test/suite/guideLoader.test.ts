import * as assert from "assert";
import { loadGuide } from "../../src/webview/guides/guideLoader";

// Regression coverage for loadGuide's anchor resolution (srs-vscode#119
// workstream 4): guideLoader.ts used to destructure `rootInstanceIds` as a
// required string[] and index [0] unconditionally. Rust's
// Container.root_instance_ids is Option<Vec<String>> — an anchor-era
// container can omit it entirely, which was a live `undefined[0]`
// TypeError. anchorInstanceId (RFC-013 amended, I-145) is now read first,
// with rootInstanceIds?.[0] only as the documented transitional fallback.

const GUIDE_ID = "guide-1";
const CONTAINER_ID = "c-1";

class FakeCli {
  constructor(private readonly container: {
    memberInstanceIds: string[];
    anchorInstanceId?: string;
    rootInstanceIds?: string[];
  }) {}

  async runOk<T>(_repoPath: string, args: string[]): Promise<T> {
    if (args[0] === "container" && args[1] === "get") {
      return { container: { containerId: CONTAINER_ID, title: "Guide", ...this.container } } as T;
    }
    if (args[0] === "record" && args[1] === "get") {
      const instanceId = args[2];
      return {
        record: {
          instanceId,
          typeId: "8f138dd6-11d2-42a5-99ec-3d6e23bed54f",
          typeName: "guide",
          typeNamespace: "com.mudemocracy",
          typeVersion: 1,
          fieldValues: { title: "My Guide", slug: "my-guide", subtitle: "", body: "" },
        },
      } as T;
    }
    if (args[0] === "relation" && args[1] === "list") {
      return { relations: [] } as T;
    }
    throw new Error(`unexpected CLI call: ${args.join(" ")}`);
  }
}

describe("loadGuide — anchor resolution", () => {
  it("uses anchorInstanceId directly when rootInstanceIds is entirely absent", async () => {
    const cli = new FakeCli({ memberInstanceIds: [GUIDE_ID], anchorInstanceId: GUIDE_ID });
    const doc = await loadGuide(cli as never, "/repo", CONTAINER_ID);
    assert.strictEqual(doc.guideInstanceId, GUIDE_ID);
  });

  it("falls back to rootInstanceIds[0] when anchorInstanceId is absent (transitional)", async () => {
    const cli = new FakeCli({ memberInstanceIds: [GUIDE_ID], rootInstanceIds: [GUIDE_ID, "other"] });
    const doc = await loadGuide(cli as never, "/repo", CONTAINER_ID);
    assert.strictEqual(doc.guideInstanceId, GUIDE_ID);
  });

  it("prefers anchorInstanceId over rootInstanceIds[0] when both are present", async () => {
    // "stale-root" is deliberately NOT a container member — if the code took
    // rootInstanceIds[0] here it would fail with "Guide record ... not found
    // in container members" rather than silently succeed on the wrong id.
    const cli = new FakeCli({
      memberInstanceIds: [GUIDE_ID],
      anchorInstanceId: GUIDE_ID,
      rootInstanceIds: ["stale-root"],
    });
    const doc = await loadGuide(cli as never, "/repo", CONTAINER_ID);
    assert.strictEqual(doc.guideInstanceId, GUIDE_ID);
  });

  it("throws a clear error instead of an undefined[0] TypeError when neither is present", async () => {
    const cli = new FakeCli({ memberInstanceIds: [GUIDE_ID] });
    await assert.rejects(
      () => loadGuide(cli as never, "/repo", CONTAINER_ID),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /no anchorInstanceId or rootInstanceIds/);
        return true;
      },
    );
  });
});
