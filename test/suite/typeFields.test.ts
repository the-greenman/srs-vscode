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

  it("falls back to the field name when `title` is a long description sentence, not a real label", async () => {
    // srs-rust's title fallback is displayLabel ?? description, never the field
    // name — a field with no displayLabel and a long description would otherwise
    // show that whole sentence, uppercased, as its form/preview/table-header label.
    const cli = new FakeCli({
      ratified_at: {
        type: "string",
        title: "The date the decision was ratified by the assembly and formally recorded",
      },
    });
    const fields = await resolveTypeFields(cli as never, "/repo", "type-1");
    assert.strictEqual(fields[0].displayLabel, "ratified_at");
  });
});
