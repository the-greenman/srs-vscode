import * as assert from "assert";
import { SCHEMA_ASSOCIATIONS } from "../../src/schema/SchemaProvider";

const schemaFor = (glob: string) =>
  SCHEMA_ASSOCIATIONS.find((a) => a.glob === glob)?.schema;

describe("SchemaProvider container globs (RFC-051)", () => {
  it("keeps the revision <= 10 single-file container glob", () => {
    assert.strictEqual(schemaFor("**/containers/*.json"), "schemas/2.0/container.json");
  });

  it("maps the revision-11 container head", () => {
    assert.strictEqual(schemaFor("**/containers/*/container.json"), "schemas/2.0/container.json");
  });

  it("leaves the revision-11 entry glob unmapped until the mirror carries its schema (#144)", () => {
    assert.strictEqual(schemaFor("**/containers/*/entries/*.json"), undefined);
  });
});
