import * as assert from "assert";
import { loadGuide } from "../../src/webview/guides/guideLoader";

// Coverage for loadGuide's anchor resolution. anchorInstanceId (RFC-013
// amended, I-145) is the only source of the guide record: the
// rootInstanceIds[0] positional fallback is withdrawn at dataModelRevision 8
// (RFC-043 [R4]), so a container without an anchor is an error, never a guess.

const GUIDE_ID = "guide-1";
const CONTAINER_ID = "c-1";

class FakeCli {
  constructor(private readonly container: {
    memberInstanceIds: string[];
    anchorInstanceId?: string;
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
  it("uses anchorInstanceId", async () => {
    const cli = new FakeCli({ memberInstanceIds: [GUIDE_ID], anchorInstanceId: GUIDE_ID });
    const doc = await loadGuide(cli as never, "/repo", CONTAINER_ID);
    assert.strictEqual(doc.guideInstanceId, GUIDE_ID);
  });

  it("throws a clear error, with no positional fallback, when anchorInstanceId is absent", async () => {
    // A stale pre-revision-8 rootInstanceIds must be ignored, not used.
    const cli = new FakeCli({
      memberInstanceIds: [GUIDE_ID],
      rootInstanceIds: [GUIDE_ID],
    } as never);
    await assert.rejects(
      () => loadGuide(cli as never, "/repo", CONTAINER_ID),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /has no anchorInstanceId/);
        return true;
      },
    );
  });
});
