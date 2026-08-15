"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const forms_1 = require("../../src/webview/forms");
const SrsTreeDataProvider_1 = require("../../src/tree/SrsTreeDataProvider");
const editCommands_1 = require("../../src/commands/editCommands");
// Regression coverage for #92: the record editor must speak the RFC-039 name-keyed
// recursive object carrier (fieldValues keyed by Field.name, composite ranges as
// nested objects/arrays) rather than the retired fieldId array + FieldGroup shapes.
describe("buildRecordForm — RFC-039 composite fields", () => {
    it("renders a list-composite field's existing entries with nested composite children", () => {
        const html = (0, forms_1.buildRecordForm)({
            instanceId: "rec-1",
            typeId: "type-1",
            typeName: "table",
            typeNamespace: "com.example",
            typeVersion: 3,
            fieldValues: {
                rows: [{ cells: ["a", "b"] }, { cells: ["c", "d"] }],
            },
        }, [
            {
                name: "rows",
                displayLabel: "Rows",
                order: 0,
                required: true,
                kind: "list-composite",
                minItems: 1,
                children: [
                    { name: "cells", displayLabel: "Cells", order: 0, required: true, kind: "list-scalar" },
                ],
            },
        ]);
        assert.match(html, /data-field="rows"/);
        assert.match(html, /data-kind="list-composite"/);
        assert.match(html, /data-field="cells"/);
        assert.match(html, /data-kind="list-scalar"/);
        assert.match(html, />a<\/textarea>/);
        assert.match(html, />c<\/textarea>/);
        // A blank-entry template is emitted for the "+ Add" control to clone. No id/data-*
        // pairing scheme — scoping is DOM-relative (parentElement), immune to id collisions
        // across clones (see forms.ts RECORD_FORM_JS).
        assert.match(html, /<template>\s*<div class="entry group-entry" data-entry>/);
    });
    it("renders a single composite field's children nested one level, keyed by field name not fieldId", () => {
        const html = (0, forms_1.buildRecordForm)({
            instanceId: "rec-1",
            typeId: "type-1",
            typeName: "meeting",
            typeNamespace: "com.example",
            typeVersion: 1,
            fieldValues: { location: { building: "HQ", room: "12B" } },
        }, [
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
        ]);
        assert.match(html, /data-field="location"[^>]*data-kind="composite"/);
        assert.match(html, /data-field="building"/);
        assert.match(html, />HQ<\/textarea>/);
        assert.match(html, />12B<\/textarea>/);
    });
    it("omits composite markup entirely for a scalar-only type", () => {
        const html = (0, forms_1.buildRecordForm)({
            instanceId: "rec-1",
            typeId: "type-1",
            typeName: "note",
            typeNamespace: "com.example",
            typeVersion: 1,
            fieldValues: { title: "Board" },
        }, [{ name: "title", displayLabel: "Title", order: 0, required: true, kind: "scalar" }]);
        assert.match(html, /data-kind="scalar"/);
        // The generic recursive collector JS is always included and legitimately mentions
        // 'list-composite' as a comparison literal — assert on rendered field markers, not
        // the shared script text.
        assert.doesNotMatch(html, /data-kind="(list-)?composite"/);
        assert.doesNotMatch(html, /class="composite-body/);
    });
});
describe("editRecord — RFC-039 carrier round-trip", () => {
    const TYPE_ID = "type-1";
    const RECORD_ID = "rec-1";
    function baseRecordFieldValues() {
        return { intro: "Intro prose", rows: [{ cells: ["Scenario", "Guidance"] }] };
    }
    class FakeCli {
        constructor(recordFieldValues) {
            this.calls = [];
            this.recordFieldValues = recordFieldValues;
        }
        async runOk(_repoPath, args, opts) {
            this.calls.push({ args, stdin: opts?.stdin });
            if (args[0] === "record" && args[1] === "get") {
                return {
                    record: {
                        instanceId: RECORD_ID,
                        typeId: TYPE_ID,
                        typeName: "table",
                        typeNamespace: "com.example",
                        typeVersion: 3,
                        fieldValues: this.recordFieldValues,
                    },
                };
            }
            if (args[0] === "type" && args[1] === "schema") {
                return {
                    schema: {
                        properties: {
                            intro: { type: "string", title: "Intro", "x-srs-order": 0 },
                            rows: {
                                type: "array",
                                title: "Rows",
                                "x-srs-order": 1,
                                minItems: 1,
                                items: {
                                    type: "object",
                                    properties: {
                                        cells: { type: "array", items: { type: "string" }, title: "Cells", "x-srs-order": 0 },
                                    },
                                    required: ["cells"],
                                },
                            },
                        },
                        required: ["rows"],
                    },
                };
            }
            if (args[0] === "record" && args[1] === "update") {
                return {};
            }
            throw new Error(`unexpected CLI call: ${args.join(" ")}`);
        }
    }
    function invokeEditRecord(cli) {
        const context = { subscriptions: [] };
        const repoProvider = { active: { rootPath: "/repo" } };
        const treeProvider = { refresh: () => { } };
        (0, editCommands_1.registerEditCommands)(context, cli, repoProvider, treeProvider);
        const cmd = vscode
            .getRegisteredCommand("srs.editEntity");
        const node = new SrsTreeDataProvider_1.EntityNode(RECORD_ID, "record", "table", ["record", "get", RECORD_ID]);
        return { editPromise: cmd(node) };
    }
    it("sends a name-keyed object fieldValues (not the retired fieldId array) to `record update`", async () => {
        const cli = new FakeCli(baseRecordFieldValues());
        const { editPromise } = invokeEditRecord(cli);
        await new Promise((resolve) => setImmediate(resolve));
        const panel = vscode.window.lastWebviewPanel;
        assert.ok(panel, "expected editRecord to open a webview panel");
        assert.match(panel.html, /data-field="rows"/, "rendered form must include the composite field");
        // Simulate what the webview's collectFormData() produces: a nested object carrier.
        await panel.messageHandler({
            type: "save",
            data: {
                instanceId: RECORD_ID,
                typeId: TYPE_ID,
                typeName: "table",
                typeNamespace: "com.example",
                typeVersion: 3,
                fieldValues: {
                    intro: "Intro prose",
                    rows: [{ cells: ["Scenario", "Guidance"] }, { cells: ["New row", "New guidance"] }],
                },
            },
        });
        await editPromise;
        const updateCall = cli.calls.find((c) => c.args[0] === "record" && c.args[1] === "update");
        assert.ok(updateCall, "expected a `record update` CLI call");
        // The record is pinned to typeVersion 3 — `type schema` must be asked for THAT
        // version, not the default (latest), or a newer/older Type shape could silently
        // corrupt the record on save.
        const schemaCall = cli.calls.find((c) => c.args[0] === "type" && c.args[1] === "schema");
        assert.ok(schemaCall, "expected a `type schema` CLI call");
        assert.ok(schemaCall.args.includes("--type-version") && schemaCall.args[schemaCall.args.indexOf("--type-version") + 1] === "3", `expected type schema to be called with --type-version 3, got: ${schemaCall.args.join(" ")}`);
        const sent = JSON.parse(updateCall.stdin);
        assert.ok(!Array.isArray(sent.fieldValues), "fieldValues must be an object, not the retired array carrier");
        assert.deepStrictEqual(sent.fieldValues, {
            intro: "Intro prose",
            rows: [{ cells: ["Scenario", "Guidance"] }, { cells: ["New row", "New guidance"] }],
        });
    });
    it("blocks the save on a concurrent edit that changes a value without changing the key set", async () => {
        // Regression for the old length-based guard (`fieldValues.length !== ...length`):
        // a same-key-set value change is invisible to a length comparison, so the old guard
        // would silently let this overwrite through. The mock's showWarningMessage resolves
        // `undefined` (not "Overwrite"), so if the deep-equal guard fires, `record update`
        // must never be called.
        const cli = new FakeCli(baseRecordFieldValues());
        const { editPromise } = invokeEditRecord(cli);
        await new Promise((resolve) => setImmediate(resolve));
        // Between open and save, someone else changed `intro` — same keys, different value.
        cli.recordFieldValues = { ...baseRecordFieldValues(), intro: "Someone else's edit" };
        const panel = vscode.window.lastWebviewPanel;
        await panel.messageHandler({
            type: "save",
            data: {
                instanceId: RECORD_ID,
                typeId: TYPE_ID,
                typeName: "table",
                typeNamespace: "com.example",
                typeVersion: 3,
                fieldValues: baseRecordFieldValues(),
            },
        });
        await editPromise;
        assert.ok(!cli.calls.some((c) => c.args[0] === "record" && c.args[1] === "update"), "expected the deep-equal guard to block the save on a same-key-set value change");
    });
    it("preserves a stored field that `type schema` never projected (e.g. a skipped unresolvable fieldId assignment)", async () => {
        // `type schema` can return ok:true with a field silently missing (CLI-side
        // diagnostic, not a failure) — that field is then never rendered, so the form
        // could never have let the user edit or intentionally clear it. A full-replace
        // save must not delete it just because it wasn't on screen.
        const cli = new FakeCli({ ...baseRecordFieldValues(), "unresolvable-legacy-field": "must survive" });
        const { editPromise } = invokeEditRecord(cli);
        await new Promise((resolve) => setImmediate(resolve));
        const panel = vscode.window.lastWebviewPanel;
        await panel.messageHandler({
            type: "save",
            data: {
                instanceId: RECORD_ID,
                typeId: TYPE_ID,
                typeName: "table",
                typeNamespace: "com.example",
                typeVersion: 3,
                // What collectFormData() would produce: only the fields the (unaware) form
                // rendered — "unresolvable-legacy-field" was never part of the schema, so it
                // was never on screen and never in this object.
                fieldValues: baseRecordFieldValues(),
            },
        });
        await editPromise;
        const updateCall = cli.calls.find((c) => c.args[0] === "record" && c.args[1] === "update");
        assert.ok(updateCall, "expected a `record update` CLI call");
        const sent = JSON.parse(updateCall.stdin);
        assert.strictEqual(sent.fieldValues["unresolvable-legacy-field"], "must survive", "a field the schema never projected must survive an untouched save");
    });
});
//# sourceMappingURL=recordComposite.test.js.map