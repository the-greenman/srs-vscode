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
// Regression test for #83: the record editor only rendered a Type's
// top-level `fields`, never `fieldGroups` (ext:field-groups) — so grouped
// and repeatable-group field data was invisible and uneditable in the vscode
// editor, even though the CLI/record model fully supports it.
describe("buildRecordForm — field groups", () => {
    it("renders a non-repeatable group's fields with their current values", () => {
        const html = (0, forms_1.buildRecordForm)({
            instanceId: "rec-1",
            typeId: "type-1",
            typeName: "committee",
            typeNamespace: "com.example",
            typeVersion: 1,
            fieldValues: [],
            groupValues: [
                {
                    groupId: "g-charter",
                    entries: [
                        {
                            entryId: "e-1",
                            fieldValues: [{ fieldId: "f-purpose", value: "Oversees budget" }],
                        },
                    ],
                },
            ],
        }, [], [
            {
                groupId: "g-charter",
                label: "Charter",
                order: 0,
                repeatable: false,
                fields: [{ fieldId: "f-purpose", displayLabel: "Purpose", order: 0, required: true }],
            },
        ]);
        assert.match(html, /data-group-id="g-charter"/);
        assert.match(html, /Charter/);
        assert.match(html, /Purpose/);
        assert.match(html, /Oversees budget/);
        // Non-repeatable groups get no add/remove-entry controls (the JS helper
        // functions referencing these classes are still emitted once any group
        // exists, so assert on the rendered elements, not raw substrings).
        assert.doesNotMatch(html, /<button[^>]*data-add-group="0"/);
        assert.doesNotMatch(html, /<button[^>]*class="btn-remove-group-entry"/);
        assert.doesNotMatch(html, /<template id="group-entry-template-0">/);
    });
    it("renders every existing entry of a repeatable group, plus add/remove controls", () => {
        const html = (0, forms_1.buildRecordForm)({
            instanceId: "rec-1",
            typeId: "type-1",
            typeName: "committee",
            typeNamespace: "com.example",
            typeVersion: 1,
            fieldValues: [],
            groupValues: [
                {
                    groupId: "g-role",
                    entries: [
                        { entryId: "e-1", fieldValues: [{ fieldId: "f-name", value: "Chair" }] },
                        { entryId: "e-2", fieldValues: [{ fieldId: "f-name", value: "Secretary" }] },
                    ],
                },
            ],
        }, [], [
            {
                groupId: "g-role",
                label: "Role",
                order: 0,
                repeatable: true,
                fields: [{ fieldId: "f-name", displayLabel: "Name", order: 0, required: true }],
            },
        ]);
        assert.match(html, /Chair/);
        assert.match(html, /Secretary/);
        assert.match(html, /data-add-group="0"/);
        assert.match(html, /btn-remove-group-entry/);
        assert.match(html, /id="group-entry-template-0"/);
    });
    it("omits group markup entirely when the type declares no fieldGroups", () => {
        const html = (0, forms_1.buildRecordForm)({
            instanceId: "rec-1",
            typeId: "type-1",
            typeName: "committee",
            typeNamespace: "com.example",
            typeVersion: 1,
            fieldValues: [{ fieldId: "f-title", value: "Board" }],
        }, [{ fieldId: "f-title", displayLabel: "Title", order: 0, required: true }]);
        assert.doesNotMatch(html, /data-group/);
        assert.doesNotMatch(html, /collectGroupValues/);
    });
});
describe("editRecord — field groups round-trip", () => {
    const TYPE_ID = "type-1";
    const RECORD_ID = "rec-1";
    class FakeCli {
        constructor() {
            this.calls = [];
        }
        async runOk(_repoPath, args, opts) {
            this.calls.push({ args, stdin: opts?.stdin });
            if (args[0] === "record" && args[1] === "get") {
                return {
                    record: {
                        instanceId: RECORD_ID,
                        typeId: TYPE_ID,
                        typeName: "committee",
                        typeNamespace: "com.example",
                        typeVersion: 1,
                        fieldValues: [],
                        groupValues: [
                            { groupId: "g-role", entries: [{ entryId: "e-1", fieldValues: [{ fieldId: "f-name", value: "Chair" }] }] },
                        ],
                    },
                };
            }
            if (args[0] === "type" && args[1] === "get") {
                return {
                    type: {
                        id: TYPE_ID,
                        name: "committee",
                        namespace: "com.example",
                        version: 1,
                        fields: [],
                        fieldGroups: [
                            {
                                groupId: "g-role",
                                label: "Role",
                                order: 0,
                                repeatable: true,
                                fields: [{ fieldId: "f-name", order: 0, required: true }],
                            },
                        ],
                    },
                };
            }
            if (args[0] === "field" && args[1] === "get") {
                return { field: { id: args[2], name: "role_name", namespace: "com.example", version: 1, valueType: "string" } };
            }
            if (args[0] === "record" && args[1] === "update") {
                return {};
            }
            throw new Error(`unexpected CLI call: ${args.join(" ")}`);
        }
    }
    it("fetches fieldGroups from the type and forwards edited groupValues to `record update`", async () => {
        const cli = new FakeCli();
        const context = { subscriptions: [] };
        const repoProvider = { active: { rootPath: "/repo" } };
        const treeProvider = { refresh: () => { } };
        (0, editCommands_1.registerEditCommands)(context, cli, repoProvider, treeProvider);
        const cmd = vscode
            .getRegisteredCommand("srs.editEntity");
        const node = new SrsTreeDataProvider_1.EntityNode(RECORD_ID, "record", "committee", ["record", "get", RECORD_ID]);
        const editPromise = cmd(node);
        // Wait a tick for the async fetches (record/type/field) inside editRecord to settle
        // before the webview panel + its message handler are wired up.
        await new Promise((resolve) => setImmediate(resolve));
        const panel = vscode.window.lastWebviewPanel;
        assert.ok(panel, "expected editRecord to open a webview panel");
        assert.match(panel.html, /data-group-id="g-role"/, "rendered form must include the fieldGroup");
        // Simulate what the in-webview collectFormData() would have produced after
        // the user edited the repeatable group's single entry.
        await panel.messageHandler({
            type: "save",
            data: {
                instanceId: RECORD_ID,
                typeId: TYPE_ID,
                typeName: "committee",
                typeNamespace: "com.example",
                typeVersion: 1,
                fieldValues: [],
                groupValues: [
                    { groupId: "g-role", entries: [{ entryId: "e-1", fieldValues: [{ fieldId: "f-name", value: "Vice Chair" }] }] },
                ],
            },
        });
        await editPromise;
        const updateCall = cli.calls.find((c) => c.args[0] === "record" && c.args[1] === "update");
        assert.ok(updateCall, "expected a `record update` CLI call");
        const sent = JSON.parse(updateCall.stdin);
        assert.deepStrictEqual(sent.groupValues, [
            { groupId: "g-role", entries: [{ entryId: "e-1", fieldValues: [{ fieldId: "f-name", value: "Vice Chair" }] }] },
        ]);
    });
});
//# sourceMappingURL=recordFieldGroups.test.js.map