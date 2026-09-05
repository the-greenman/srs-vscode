import * as assert from "assert";
import { JSDOM } from "jsdom";
import { buildRecordForm } from "../../src/webview/forms";

// These exercise the actual generated client-side script (RECORD_FORM_JS) inside a
// real DOM — button clicks, template cloning, form collection — rather than only the
// server-rendered HTML. Two real bugs were found this way during review: (1) a
// list-composite field's nested repeatable child baked ids into its cloned <template>,
// so every "+ Add" click resolved to the FIRST clone via getElementById; (2) an unset
// optional enum field had no blank <option>, so the browser auto-selected the first
// real option and it got silently submitted. Both are fixed by scoping DOM lookups
// relative to the clicked element instead of by id, and by rendering a blank enum
// option. Static-HTML assertions (recordComposite.test.ts) cannot catch either class.

function loadForm(fieldValues: Record<string, unknown>, fields: Parameters<typeof buildRecordForm>[1]) {
  const body = buildRecordForm(
    { instanceId: "rec-1", typeId: "type-1", typeName: "t", typeNamespace: "com.example", typeVersion: 1, fieldValues },
    fields,
  );
  const dom = new JSDOM(`<!doctype html><html><body><form id="editor-form">${body}</form></body></html>`, {
    runScripts: "dangerously",
  });
  return dom.window;
}

describe("record form — client-side DOM interaction", () => {
  it("adding a value to the SECOND cloned list-composite entry's nested repeatable field lands in that entry, not the first", () => {
    const window = loadForm(
      { rows: [{ cells: ["existing"] }] },
      [
        {
          name: "rows",
          displayLabel: "Rows",
          order: 0,
          required: true,
          kind: "list-composite",
          children: [{ name: "cells", displayLabel: "Cells", order: 0, required: true, kind: "list-scalar" }],
        },
      ],
    );
    const document = window.document;

    // Add a second row entry by clicking the field's own "+ Add Rows" button.
    const addRowBtn = document.querySelector<HTMLButtonElement>('[data-field="rows"] > .btn-add-entry[data-add="entry"]')!;
    addRowBtn.dispatchEvent(new window.Event("click", { bubbles: true }));

    const entries = document.querySelectorAll('[data-field="rows"] > .entries > [data-entry]');
    assert.strictEqual(entries.length, 2, "expected a second row entry to have been added");
    const secondEntry = entries[1];

    // Click "+ Add value" on the SECOND entry's nested `cells` list-scalar field.
    const addCellBtn = secondEntry.querySelector<HTMLButtonElement>('[data-field="cells"] .btn-add-entry[data-add="value"]')!;
    addCellBtn.dispatchEvent(new window.Event("click", { bubbles: true }));

    const firstEntryCellInputs = entries[0].querySelectorAll(".repeat-value");
    const secondEntryCellInputs = secondEntry.querySelectorAll(".repeat-value");
    assert.strictEqual(firstEntryCellInputs.length, 1, "the first (untouched) entry must be unaffected");
    assert.strictEqual(secondEntryCellInputs.length, 1, "the new cell input must land in the second entry, not the first");
  });

  it("collects an unset optional enum field as absent, not as the first enum option", () => {
    const window = loadForm(
      { title: "Board" },
      [
        { name: "title", displayLabel: "Title", order: 0, required: true, kind: "scalar" },
        { name: "theme", displayLabel: "Theme", order: 1, required: false, kind: "enum", enumValues: ["default", "inverted", "highlight"] },
      ],
    );

    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual(
      "theme" in collected.fieldValues,
      false,
      "an unset optional enum field must be omitted (RFC-039 absence=unset), not defaulted to the first option",
    );
  });

  it("preserves a stored enum value that is no longer in the current vocabulary, instead of silently dropping it", () => {
    const window = loadForm(
      { theme: "legacy-value" },
      [{ name: "theme", displayLabel: "Theme", order: 0, required: false, kind: "enum", enumValues: ["default", "inverted"] }],
    );
    const select = window.document.querySelector<HTMLSelectElement>('[data-field="theme"] select')!;
    assert.strictEqual(select.value, "legacy-value", "the stale value must appear as its own selected option, not fall back to blank");

    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual(collected.fieldValues.theme, "legacy-value", "an untouched save must preserve the stale value, not drop it");
  });

  it("drops a list-composite entry added via \"+ Add\" and left entirely blank", () => {
    const window = loadForm(
      { rows: [{ cells: ["existing"] }] },
      [
        {
          name: "rows",
          displayLabel: "Rows",
          order: 0,
          required: true,
          kind: "list-composite",
          children: [{ name: "cells", displayLabel: "Cells", order: 0, required: true, kind: "list-scalar" }],
        },
      ],
    );
    const document = window.document;

    const addRowBtn = document.querySelector<HTMLButtonElement>('[data-field="rows"] > .btn-add-entry[data-add="entry"]')!;
    addRowBtn.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.strictEqual(document.querySelectorAll('[data-field="rows"] > .entries > [data-entry]').length, 2);

    // Save without touching the newly added (blank) second entry.
    const collected = window.collectFormData() as { fieldValues: { rows: unknown[] } };
    assert.strictEqual(collected.fieldValues.rows.length, 1, "the blank added-then-abandoned entry must not be submitted");
    // Cross-realm: objects built inside jsdom's runScripts sandbox aren't
    // reference-equal to Node-realm Object/Array — normalize through JSON first.
    assert.deepStrictEqual(JSON.parse(JSON.stringify(collected.fieldValues.rows[0])), { cells: ["existing"] });
  });

  it("omits an optional composite field left entirely blank, instead of sending {}", () => {
    const window = loadForm(
      {},
      [
        {
          name: "location",
          displayLabel: "Location",
          order: 0,
          required: false,
          kind: "composite",
          children: [
            { name: "building", displayLabel: "Building", order: 0, required: false, kind: "scalar" },
            { name: "room", displayLabel: "Room", order: 1, required: false, kind: "scalar" },
          ],
        },
      ],
    );

    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual(
      "location" in collected.fieldValues,
      false,
      "a composite field with no children filled in must be omitted (absence=unset), not sent as {}",
    );
  });

  it("coerces a boolean scalar field even with trailing whitespace from the textarea", () => {
    const window = loadForm(
      { active: true },
      [{ name: "active", displayLabel: "Active", order: 0, required: false, kind: "scalar", scalarType: "boolean" }],
    );
    const textarea = window.document.querySelector<HTMLTextAreaElement>('[data-field="active"] textarea')!;
    textarea.value = "true\n";

    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual(collected.fieldValues.active, true, "a trailing newline must not defeat boolean coercion");
  });

  it("round-trips an unexpanded object-shaped field (map datatype / unresolved composite) through JSON, not as a stringified blob", () => {
    const window = loadForm(
      { config: { retries: 3, enabled: true } },
      [{ name: "config", displayLabel: "Config", order: 0, required: false, kind: "scalar", scalarType: "json" }],
    );
    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(collected.fieldValues.config)),
      { retries: 3, enabled: true },
      "an untouched save must preserve the object, not corrupt it into a JSON-encoded string",
    );
  });

  it("preserves a blank middle entry in a list-scalar field at its position, instead of dropping it and shifting later entries", () => {
    const window = loadForm(
      { cells: ["Yes", "", "See note"] },
      [{ name: "cells", displayLabel: "Cells", order: 0, required: true, kind: "list-scalar" }],
    );
    const collected = window.collectFormData() as { fieldValues: { cells: unknown[] } };
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(collected.fieldValues.cells)),
      ["Yes", "", "See note"],
      "a deliberately blank middle entry must survive an untouched save at its original position",
    );
  });

  it("round-trips a list-of-map field (cardinality:list over datatype:map) through JSON per entry, not as stringified blobs", () => {
    const window = loadForm(
      { configs: [{ retries: 3 }, { retries: 5 }] },
      [{ name: "configs", displayLabel: "Configs", order: 0, required: false, kind: "list-scalar", scalarType: "json" }],
    );
    const collected = window.collectFormData() as { fieldValues: { configs: unknown[] } };
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(collected.fieldValues.configs)),
      [{ retries: 3 }, { retries: 5 }],
      "an untouched save must preserve each entry as an object, not corrupt it into a JSON string",
    );
  });

  it("trims leading/trailing whitespace from a plain string scalar on save, matching the pre-RFC-039 editor", () => {
    const window = loadForm(
      { title: "Board" },
      [{ name: "title", displayLabel: "Title", order: 0, required: true, kind: "scalar" }],
    );
    const textarea = window.document.querySelector<HTMLTextAreaElement>('[data-field="title"] textarea')!;
    textarea.value = "  Chapter One  \n";

    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual(collected.fieldValues.title, "Chapter One");
  });

  it("does not silently turn Infinity/-Infinity into a JSON null on save", () => {
    const window = loadForm(
      { count: 5 },
      [{ name: "count", displayLabel: "Count", order: 0, required: false, kind: "scalar", scalarType: "number" }],
    );
    const textarea = window.document.querySelector<HTMLTextAreaElement>('[data-field="count"] textarea')!;
    textarea.value = "Infinity";

    const collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    // Number("Infinity") is a real finite-check failure — must fall back to the raw
    // string rather than the numeric Infinity, which JSON.stringify silently turns
    // into null on the wire.
    assert.strictEqual(collected.fieldValues.count, "Infinity");
    assert.notStrictEqual(JSON.parse(JSON.stringify({ v: collected.fieldValues.count })).v, null);
  });

  it("collects a previously-set enum field's current value, and lets it be explicitly cleared", () => {
    const window = loadForm(
      { theme: "inverted" },
      [{ name: "theme", displayLabel: "Theme", order: 0, required: false, kind: "enum", enumValues: ["default", "inverted", "highlight"] }],
    );
    const document = window.document;

    const select = document.querySelector<HTMLSelectElement>('[data-field="theme"] select')!;
    assert.strictEqual(select.value, "inverted", "the select must be pre-selected to the record's current value");

    let collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual(collected.fieldValues.theme, "inverted");

    // User explicitly clears it back to the blank option.
    select.value = "";
    collected = window.collectFormData() as { fieldValues: Record<string, unknown> };
    assert.strictEqual("theme" in collected.fieldValues, false, "clearing back to the blank option must unset the field");
  });
});
