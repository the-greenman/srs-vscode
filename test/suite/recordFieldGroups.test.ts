import * as assert from "assert";
import * as vscode from "vscode";
import { buildRecordForm } from "../../src/webview/forms";
import { EntityNode } from "../../src/tree/SrsTreeDataProvider";
import { registerEditCommands } from "../../src/commands/editCommands";

// Regression test for #83: the record editor only rendered a Type's
// top-level `fields`, never `fieldGroups` (ext:field-groups) — so grouped
// and repeatable-group field data was invisible and uneditable in the vscode
// editor, even though the CLI/record model fully supports it.

describe("buildRecordForm — field groups", () => {
  it("renders a non-repeatable group's fields with their current values", () => {
    const html = buildRecordForm(
      {
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
      },
      [],
      [
        {
          groupId: "g-charter",
          label: "Charter",
          order: 0,
          repeatable: false,
          fields: [{ fieldId: "f-purpose", displayLabel: "Purpose", order: 0, required: true }],
        },
      ],
    );

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
    const html = buildRecordForm(
      {
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
      },
      [],
      [
        {
          groupId: "g-role",
          label: "Role",
          order: 0,
          repeatable: true,
          fields: [{ fieldId: "f-name", displayLabel: "Name", order: 0, required: true }],
        },
      ],
    );

    assert.match(html, /Chair/);
    assert.match(html, /Secretary/);
    assert.match(html, /data-add-group="0"/);
    assert.match(html, /btn-remove-group-entry/);
    assert.match(html, /id="group-entry-template-0"/);
  });

  it("omits group markup entirely when the type declares no fieldGroups", () => {
    const html = buildRecordForm(
      {
        instanceId: "rec-1",
        typeId: "type-1",
        typeName: "committee",
        typeNamespace: "com.example",
        typeVersion: 1,
        fieldValues: [{ fieldId: "f-title", value: "Board" }],
      },
      [{ fieldId: "f-title", displayLabel: "Title", order: 0, required: true }],
    );

    assert.doesNotMatch(html, /data-group/);
    assert.doesNotMatch(html, /collectGroupValues/);
  });
});

describe("editRecord — field groups round-trip", () => {
  const TYPE_ID = "type-1";
  const RECORD_ID = "rec-1";

  class FakeCli {
    calls: Array<{ args: string[]; stdin?: string }> = [];
    async runOk<T>(_repoPath: string, args: string[], opts?: { stdin?: string }): Promise<T> {
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
        } as T;
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
        } as T;
      }
      if (args[0] === "field" && args[1] === "get") {
        return { field: { id: args[2], name: "role_name", namespace: "com.example", version: 1, valueType: "string" } } as T;
      }
      if (args[0] === "record" && args[1] === "update") {
        return {} as T;
      }
      throw new Error(`unexpected CLI call: ${args.join(" ")}`);
    }
  }

  it("fetches fieldGroups from the type and forwards edited groupValues to `record update`", async () => {
    const cli = new FakeCli();
    const context = { subscriptions: [] as unknown[] };
    const repoProvider = { active: { rootPath: "/repo" } };
    const treeProvider = { refresh: () => {} };

    registerEditCommands(context as never, cli as never, repoProvider as never, treeProvider as never);
    const cmd = (vscode as never as { getRegisteredCommand(id: string): (node: unknown) => Promise<void> })
      .getRegisteredCommand("srs.editEntity")!;

    const node = new EntityNode(RECORD_ID, "record", "committee", ["record", "get", RECORD_ID]);
    const editPromise = cmd(node);

    // Wait a tick for the async fetches (record/type/field) inside editRecord to settle
    // before the webview panel + its message handler are wired up.
    await new Promise((resolve) => setImmediate(resolve));

    const panel = (vscode.window as never as {
      lastWebviewPanel: { html: string; messageHandler?: (msg: { type: string; data?: unknown }) => unknown };
    }).lastWebviewPanel;
    assert.ok(panel, "expected editRecord to open a webview panel");
    assert.match(panel.html, /data-group-id="g-role"/, "rendered form must include the fieldGroup");

    // Simulate what the in-webview collectFormData() would have produced after
    // the user edited the repeatable group's single entry.
    await panel.messageHandler!({
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
    const sent = JSON.parse(updateCall!.stdin!);
    assert.deepStrictEqual(sent.groupValues, [
      { groupId: "g-role", entries: [{ entryId: "e-1", fieldValues: [{ fieldId: "f-name", value: "Vice Chair" }] }] },
    ]);
  });
});
