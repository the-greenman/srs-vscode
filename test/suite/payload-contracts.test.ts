/**
 * Payload contract validation tests.
 *
 * Loads JSON Schema golden files from srs-rust/crates/srs-cli/schemas/payload/
 * and validates fixture CLI payloads against them using AJV.
 *
 * These tests catch TypeScript fixture drift against the authoritative Rust
 * payload definitions. If a schema file is missing or the golden schema
 * directory cannot be found (e.g. srs-rust is not co-located), the suite
 * logs a warning and skips rather than failing.
 *
 * When a contract test fails:
 *   1. Check whether the fixture payload needs updating, OR
 *   2. Whether the Rust payload struct was changed — run
 *      `cargo run --bin generate-schemas` in srs-rust/ to regenerate.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";

// Golden schema files are in the sibling srs-rust workspace.
// From dist-test/test/suite/ go up 4 levels to reach semanticops/.
const SCHEMA_DIR = path.resolve(
  __dirname,
  "../../../../srs-rust/crates/srs-cli/schemas/payload",
);

const schemaDirExists = fs.existsSync(SCHEMA_DIR);

function loadSchema(name: string): object | null {
  const schemaPath = path.join(SCHEMA_DIR, `${name}.json`);
  if (!fs.existsSync(schemaPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
}

function makeValidator(schemaName: string): ((payload: unknown) => void) | null {
  if (!schemaDirExists) {
    return null;
  }
  const schema = loadSchema(schemaName);
  if (!schema) {
    return null;
  }
  const ajv = new Ajv({ strict: false, formats: { uint: true, int64: true } });
  const validate = ajv.compile(schema);
  return (payload: unknown) => {
    const valid = validate(payload);
    if (!valid) {
      const errors = validate.errors
        ?.map((e) => `${e.instancePath} ${e.message}`)
        .join("; ");
      assert.fail(
        `Payload does not match schema '${schemaName}': ${errors}\n` +
          `Payload: ${JSON.stringify(payload, null, 2)}`,
      );
    }
  };
}

describe("payload contracts", () => {
  before(function () {
    if (!schemaDirExists) {
      console.warn(
        `[payload-contracts] WARN: Schema directory not found at ${SCHEMA_DIR}. ` +
          `Co-locate srs-rust/ with srs-vscode/ to enable contract validation. Skipping.`,
      );
      this.skip();
    }
  });

  // ── note list ──────────────────────────────────────────────────────────────

  it("validates note-list payload against golden schema", () => {
    const check = makeValidator("note-list");
    if (!check) {
      return;
    }
    // Valid payload: notes array with instanceId and title
    check({ notes: [{ instanceId: "note-001", title: "First Note" }] });
    check({ notes: [] });
  });

  it("rejects note-list payload missing required 'notes' key", () => {
    const schema = loadSchema("note-list");
    if (!schema) {
      return;
    }
    const ajv = new Ajv({ strict: false, formats: { uint: true, int64: true } });
    const validate = ajv.compile(schema);
    assert.strictEqual(
      validate({ notez: [] }),
      false,
      "Expected validation to fail for wrong key name",
    );
  });

  // ── repo validate ──────────────────────────────────────────────────────────

  it("validates repo-validate payload (clean) against golden schema", () => {
    const check = makeValidator("repo-validate");
    if (!check) {
      return;
    }
    check({
      summary: { checked: 100, errors: 0, warnings: 0 },
      diagnostics: [],
    });
  });

  it("validates repo-validate payload (with errors) against golden schema", () => {
    const check = makeValidator("repo-validate");
    if (!check) {
      return;
    }
    check({
      summary: { checked: 50, errors: 2, warnings: 1 },
      diagnostics: [
        { severity: "error", path: "records/foo.json", message: "invalid field value" },
      ],
    });
  });

  it("rejects repo-validate payload missing summary.checked", () => {
    const schema = loadSchema("repo-validate");
    if (!schema) {
      return;
    }
    const ajv = new Ajv({ strict: false, formats: { uint: true, int64: true } });
    const validate = ajv.compile(schema);
    // summary.checked is required by RepoValidateSummary
    assert.strictEqual(
      validate({ summary: { errors: 0, warnings: 0 }, diagnostics: [] }),
      false,
      "Expected validation to fail for missing summary.checked",
    );
  });

  // ── note tag list ──────────────────────────────────────────────────────────

  it("validates note-tag-list payload against golden schema", () => {
    const check = makeValidator("note-tag-list");
    if (!check) {
      return;
    }
    check({
      totalNotes: 10,
      tags: [{ tag: "foundation", noteCount: 3 }],
    });
    check({ totalNotes: 0, tags: [] });
  });

  // ── tag list ───────────────────────────────────────────────────────────────

  it("validates tag-list payload against golden schema", () => {
    const check = makeValidator("tag-list");
    if (!check) {
      return;
    }
    // tagDefinitions is an array of any (external type, validated at runtime)
    check({
      tagDefinitions: [{ instanceId: "tag-001", slug: "foundation" }],
    });
    check({ tagDefinitions: [] });
  });

  // ── render document-view ───────────────────────────────────────────────────

  it("validates render-document-view payload against golden schema", () => {
    const check = makeValidator("render-document-view");
    if (!check) {
      return;
    }
    check({ rendered: "# My Document\n...", diagnostics: [] });
    check({ rendered: "", diagnostics: ["warning: empty view"] });
  });

  // ── package list ───────────────────────────────────────────────────────────

  it("validates package-list payload against golden schema", () => {
    const check = makeValidator("package-list");
    if (!check) {
      return;
    }
    check({
      packages: [
        {
          id: "pkg-001",
          namespace: "com.example",
          name: "my-package",
          version: "1.0.0",
          boundaryPath: null,
          fieldCount: 5,
          typeCount: 2,
        },
      ],
    });
  });
});
