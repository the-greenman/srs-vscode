import * as assert from "assert";
import { normalizeRelationList } from "../../src/cli/relations";
import type { RelationListPayload } from "../../src/cli/types";

describe("normalizeRelationList (srs-rust#1697)", () => {
  it("passes the schema names through", () => {
    const out = normalizeRelationList({
      relations: [
        { relationId: "r1", relationType: "precedes", sourceInstanceId: "a", targetInstanceId: "b" },
      ],
    });
    assert.strictEqual(out.relations[0].sourceInstanceId, "a");
    assert.strictEqual(out.relations[0].targetInstanceId, "b");
  });

  it("reads the pre-rename sourceId / targetId from an older CLI", () => {
    const legacy = {
      relations: [{ relationId: "r2", relationType: "precedes", sourceId: "c", targetId: "d" }],
    } as unknown as RelationListPayload;
    const out = normalizeRelationList(legacy);
    assert.strictEqual(out.relations[0].sourceInstanceId, "c");
    assert.strictEqual(out.relations[0].targetInstanceId, "d");
  });
});
