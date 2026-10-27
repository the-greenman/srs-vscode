import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
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

  it("maps the revision-11 container entries (#144)", () => {
    assert.strictEqual(
      schemaFor("**/containers/*/entries/*.json"),
      "schemas/2.0/stored-container-entry.json",
    );
  });

  it("points every glob at a schema the mirror carries", () => {
    for (const { schema } of SCHEMA_ASSOCIATIONS) {
      assert.ok(fs.existsSync(path.join(__dirname, "../../..", schema)), schema);
    }
  });
});
