import * as assert from "assert";
import { resolveTypeFields } from "../../src/cli/typeFields";

// Regression coverage for typeFields.ts's JSON-Schema-to-ResolvedField parsing,
// independent of any particular command that calls it.

class FakeCli {
  constructor(private readonly properties: Record<string, unknown>, private readonly required: string[] = []) {}
  async runOk<T>(_repoPath: string, _args: string[]): Promise<T> {
    return { schema: { properties: this.properties, required: this.required } } as T;
  }
}

describe("resolveTypeFields — label fallback", () => {
  it("uses a short title as the display label", async () => {
    const cli = new FakeCli({ room: { type: "string", title: "Room" } });
    const fields = await resolveTypeFields(cli as never, "/repo", "type-1");
    assert.strictEqual(fields[0].displayLabel, "Room");
  });

  it("shows the field name when there is no title", async () => {
    const cli = new FakeCli({ ratified_at: { type: "string" } });
    const fields = await resolveTypeFields(cli as never, "/repo", "type-1");
    assert.strictEqual(fields[0].displayLabel, "ratified_at");
  });

  it("keeps a long authored label unchanged", async () => {
    const label = "Date the assembly ratified and formally recorded the decision";
    const cli = new FakeCli({ ratified_at: { type: "string", title: label } });
    const fields = await resolveTypeFields(cli as never, "/repo", "type-1");
    assert.strictEqual(fields[0].displayLabel, label);
  });

  it("reads help from x-srs-description, not the aiGuidance description", async () => {
    const cli = new FakeCli({
      room: { type: "string", description: "Fill with the room name.", "x-srs-description": "Where the meeting is held." },
    });
    const fields = await resolveTypeFields(cli as never, "/repo", "type-1");
    assert.strictEqual(fields[0].description, "Where the meeting is held.");
  });
});
