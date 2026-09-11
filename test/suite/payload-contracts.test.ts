/**
 * Payload contract validation tests.
 *
 * Loads JSON Schema golden files from the vendored schemas/payload/ mirror
 * (srs-vscode#119 workstream 7 — synced from srs-rust's
 * crates/srs-cli/schemas/payload/ via scripts/sync-payload-schemas.sh, drift-
 * checked by scripts/check-payload-schema-drift.sh, same pattern as
 * schemas/2.0/) and validates fixture CLI payloads against them using AJV.
 *
 * Because these schemas are committed to this repo rather than resolved from
 * a co-located sibling checkout, this suite always runs — it no longer skips
 * when srs-rust isn't checked out next to srs-vscode (that was the CI gate
 * bug: CI never checked out srs-rust, so `before()` called `this.skip()`
 * every single run, and the one test that would have caught the
 * DocumentView->Composition rename validated a schema file that no longer
 * existed while still reporting a pass).
 *
 * A schema file that's missing from the vendored mirror is now a hard
 * failure, not a silently-skipped assertion — see loadSchema().
 *
 * When a contract test fails:
 *   1. Check whether the fixture payload needs updating, OR
 *   2. Whether the Rust payload struct changed — run
 *      scripts/sync-payload-schemas.sh to refresh the vendored mirror.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";

const SCHEMA_DIR = path.join(__dirname, "../../../schemas/payload");

function loadSchema(name: string): object {
  const schemaPath = path.join(SCHEMA_DIR, `${name}.json`);
  if (!fs.existsSync(schemaPath)) {
    // A missing golden schema is a real gap — either the vendored mirror is
    // stale (run scripts/sync-payload-schemas.sh) or the test named the
    // wrong schema. Either way, silently treating it as "nothing to check"
    // (the old behaviour) is exactly how this suite went blind to the
    // DocumentView->Composition rename.
    throw new Error(
      `Golden schema '${name}' not found at ${schemaPath}. ` +
        `Run scripts/sync-payload-schemas.sh, or fix the schema name.`,
    );
  }
  return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
}

function makeValidator(schemaName: string): (payload: unknown) => void {
  const schema = loadSchema(schemaName);
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
  it("the vendored schema mirror exists (schemas/payload/)", () => {
    assert.ok(fs.existsSync(SCHEMA_DIR), `expected ${SCHEMA_DIR} to exist — see scripts/sync-payload-schemas.sh`);
    const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".json"));
    assert.ok(files.length > 100, `expected a full vendored mirror, found only ${files.length} schema files`);
  });

  it("fails (not skips) when a named golden schema file is missing", () => {
    assert.throws(
      () => loadSchema("this-schema-does-not-exist"),
      /Golden schema 'this-schema-does-not-exist' not found/,
    );
  });

  // ── note list ──────────────────────────────────────────────────────────────

  it("validates note-list payload against golden schema", () => {
    const check = makeValidator("note-list");
    // Valid payload: notes array with instanceId and title
    check({ notes: [{ instanceId: "note-001", title: "First Note" }] });
    check({ notes: [] });
  });

  it("rejects note-list payload missing required 'notes' key", () => {
    const schema = loadSchema("note-list");
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
    check({
      summary: { checked: 100, errors: 0, warnings: 0 },
      diagnostics: [],
    });
  });

  it("validates repo-validate payload (with errors) against golden schema", () => {
    const check = makeValidator("repo-validate");
    check({
      summary: { checked: 50, errors: 2, warnings: 1 },
      diagnostics: [
        { severity: "error", path: "records/foo.json", message: "invalid field value" },
      ],
    });
  });

  it("rejects repo-validate payload missing summary.checked", () => {
    const schema = loadSchema("repo-validate");
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
    check({
      totalNotes: 10,
      tags: [{ tag: "foundation", noteCount: 3 }],
    });
    check({ totalNotes: 0, tags: [] });
  });

  // ── tag list ───────────────────────────────────────────────────────────────

  it("validates tag-list payload against golden schema", () => {
    const check = makeValidator("tag-list");
    // terms is an array of RFC-006 vocabulary Terms (external type, validated at runtime)
    check({
      terms: [
        {
          id: "b5db2773-cf71-454f-a4a6-ceada8fc8602",
          version: 1,
          namespace: "com.example.spec",
          key: "topic:foundation",
          label: "Foundation",
        },
      ],
    });
    check({ terms: [] });
  });

  // ── composition list / get / list-for-container ─────────────────────────────
  // (renamed from document-view, srs-rust PR #921/f7c9bfec — this is the exact
  // contract this suite failed to catch drift on, see file header)

  it("validates composition-list payload against golden schema", () => {
    const check = makeValidator("composition-list");
    check({
      compositions: [
        {
          id: "85502740-9f96-46e4-9a04-ae09fc68db61",
          namespace: "com.mudemocracy",
          name: "guides-index",
          version: 1,
          description: "Index of the guide collection.",
        },
      ],
    });
    check({ compositions: [] });
  });

  it("rejects composition-list payload missing required 'compositions' key", () => {
    const schema = loadSchema("composition-list");
    const ajv = new Ajv({ strict: false, formats: { uint: true, int64: true } });
    const validate = ajv.compile(schema);
    assert.strictEqual(
      validate({ documentViews: [] }),
      false,
      "Expected validation to fail for the retired documentViews key name",
    );
  });

  it("validates composition-get payload against golden schema", () => {
    const check = makeValidator("composition-get");
    check({
      composition: {
        id: "2aba4d85-317b-44e1-a600-d38a743b4cb4",
        namespace: "com.mudemocracy",
        name: "guide-body-view",
        version: 1,
        sections: [],
      },
    });
  });

  it("validates composition-list-for-container payload against golden schema", () => {
    const check = makeValidator("composition-list-for-container");
    check({
      containerId: "1c843817-c0f9-4ba6-b65f-c6d23af161a7",
      compositions: [],
    });
  });

  // ── render composition ────────────────────────────────────────────────────

  it("validates render-composition payload against golden schema", () => {
    const check = makeValidator("render-composition");
    check({ rendered: "# My Document\n...", diagnostics: [] });
    check({ rendered: "", diagnostics: ["warning: empty view"] });
  });

  // ── container resolve-view ────────────────────────────────────────────────

  it("validates container-resolve-view payload against golden schema", () => {
    const check = makeValidator("container-resolve-view");
    check({
      containerView: {
        containerId: "1706c6a2-a901-4503-98a3-876b9a437ec9",
        compositionId: "2aba4d85-317b-44e1-a600-d38a743b4cb4",
        members: [],
        columns: [],
        excludeLifecycleStates: [],
        diagnostics: [],
      },
    });
  });

  // ── repo map ───────────────────────────────────────────────────────────────

  it("validates repo-map payload against golden schema", () => {
    const check = makeValidator("repo-map");
    check({
      repoMap: {
        counts: { totalInstances: 0, notes: 0, typedRecords: 0, records: 0, byTier: {} },
        repository: {},
      },
    });
  });

  // ── repo extensions list ──────────────────────────────────────────────────
  // (was `extension list`; moved to `repo extensions list`, returning plain
  // strings rather than objects — srs-vscode#119 workstream 3)

  it("validates repo-extensions-list payload against golden schema", () => {
    const check = makeValidator("repo-extensions-list");
    check({ extensions: ["ext:lifecycle", "ext:repository", "ext:views-l2"] });
    check({ extensions: [] });
  });

  it("rejects repo-extensions-list payload with object entries instead of plain strings", () => {
    const schema = loadSchema("repo-extensions-list");
    const ajv = new Ajv({ strict: false, formats: { uint: true, int64: true } });
    const validate = ajv.compile(schema);
    assert.strictEqual(
      validate({ extensions: [{ instanceId: "x", extensionId: "ext:lifecycle" }] }),
      false,
      "Expected validation to fail for the retired object-shaped extension entries",
    );
  });

  // ── package list ───────────────────────────────────────────────────────────

  it("validates package-list payload against golden schema", () => {
    const check = makeValidator("package-list");
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
