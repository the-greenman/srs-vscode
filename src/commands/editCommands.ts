import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import { EntityEditorPanel } from "../webview/EntityEditorPanel";
import { formWrapHtml, buildNoteForm, buildRecordForm } from "../webview/forms";
import type { TypeFieldData, TypeFieldGroupData } from "../webview/forms";
import type {
  RelationTypeListPayload,
  ViewListPayload,
  DocumentViewListPayload,
  ThemeListPayload,
  NoteListPayload,
  RecordListPayload,
} from "../cli/types";

// ---- Local payload shapes ----

interface NotePayload {
  note: {
    instanceId: string;
    title: string;
    tags?: string[];
    createdAt?: string;
    sections?: Array<{ name: string; label?: string; content: string; tags?: string[] }>;
  };
}

interface FieldAssignmentPayload {
  fieldId: string;
  displayLabel?: string;
  order: number;
  required: boolean;
  repeatable?: boolean;
  minItems?: number;
  maxItems?: number;
}

interface FieldGroupPayload {
  groupId: string;
  label?: string;
  description?: string;
  order: number;
  required?: boolean;
  repeatable?: boolean;
  minItems?: number;
  maxItems?: number;
  fields: FieldAssignmentPayload[];
}

interface FieldGroupValuePayload {
  groupId: string;
  entries: Array<{
    entryId?: string;
    fieldValues: Array<{ fieldId: string; value: unknown; entries?: Array<{ value: unknown }> }>;
  }>;
}

interface RecordPayload {
  record: {
    instanceId: string;
    typeId: string;
    typeName: string;
    typeNamespace: string;
    typeVersion: number;
    createdAt?: string;
    fieldValues: Array<{ fieldId: string; value: unknown; entries?: Array<{ value: unknown }> }>;
    groupValues?: FieldGroupValuePayload[];
  };
}

interface TypePayload {
  type: {
    id: string;
    name: string;
    namespace: string;
    version: number;
    fields: FieldAssignmentPayload[];
    fieldGroups?: FieldGroupPayload[];
  };
}

interface FieldPayload {
  field: {
    id: string;
    name: string;
    namespace: string;
    version: number;
    valueType: string;
  };
}

// ---- Registration ----

export function registerEditCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.editEntity", (node: unknown) =>
      cmdEditEntity(context, cli, repoProvider, treeProvider, node),
    ),
    vscode.commands.registerCommand("srs.createRelation", () =>
      cmdCreateRelation(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createRelationType", () =>
      cmdCreateRelationType(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.updateRelationType", () =>
      cmdUpdateRelationType(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.deleteRelationType", () =>
      cmdDeleteRelationType(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createView", () =>
      cmdCreateView(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.updateView", () =>
      cmdUpdateView(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createDocumentView", () =>
      cmdCreateDocumentView(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.updateDocumentView", () =>
      cmdUpdateDocumentView(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createTheme", () =>
      cmdCreateTheme(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.updateTheme", () =>
      cmdUpdateTheme(cli, repoProvider, treeProvider),
    ),
  );
}

// ---- Dispatch ----

async function cmdEditEntity(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) {
    vscode.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to edit.",
    );
    return;
  }

  const repo = repoProvider.active;
  if (!repo) return;

  try {
    switch (node.entityKind) {
      case "note":
        await editNote(context, cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "record":
        await editRecord(context, cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "view":
        await editView(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "document-view":
        await editDocumentView(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "theme":
        await editTheme(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      default:
        vscode.window.showInformationMessage(
          `SRS: No form editor for '${node.entityKind}'. Open the entity JSON to edit directly.`,
        );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Edit failed: ${msg}`);
  }
}

// ---- Note editor ----

async function editNote(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const payload = await cli.runOk<NotePayload>(repoPath, ["note", "get", id]);
  const note = payload.note;

  const noteData = {
    instanceId: note.instanceId,
    title: note.title,
    tags: note.tags,
    createdAt: note.createdAt,
    sections: note.sections,
  };

  const html = formWrapHtml(note.title, buildNoteForm(noteData));

  EntityEditorPanel.show(context, `note:${id}`, note.title, html, async (data) => {
    const d = data as {
      instanceId: string;
      title: string;
      tags: string[];
      sections: Array<{ name: string; label?: string; content: string }>;
      createdAt?: string;
    };

    // Concurrent-change guard
    const refetch = await cli.runOk<NotePayload>(repoPath, ["note", "get", id]);
    if (refetch.note.title !== note.title) {
      const proceed = await vscode.window.showWarningMessage(
        `SRS: Note was modified since you opened it (title changed to "${refetch.note.title}"). Overwrite?`,
        { modal: true },
        "Overwrite",
      );
      if (proceed !== "Overwrite") return;
    }

    await cli.runOk<unknown>(repoPath, ["note", "update", id], {
      stdin: JSON.stringify(d),
    });

    treeProvider.refresh();
  });
}

// ---- Record editor ----

async function editRecord(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const payload = await cli.runOk<RecordPayload>(repoPath, ["record", "get", id]);
  const record = payload.record;

  // Fetch type to get ordered field definitions with displayLabels
  const typePayload = await cli.runOk<TypePayload>(repoPath, [
    "type",
    "get",
    record.typeId,
  ]);
  const typeFields = typePayload.type.fields;
  const fieldGroups = typePayload.type.fieldGroups ?? [];

  // Fetch field definitions (top-level fields + fields nested in groups) in
  // parallel to use field name as fallback label
  const allFieldIds = [...new Set([
    ...typeFields.map((f) => f.fieldId),
    ...fieldGroups.flatMap((g) => g.fields.map((f) => f.fieldId)),
  ])];
  const fieldResults = await Promise.allSettled(
    allFieldIds.map((fieldId) => cli.runOk<FieldPayload>(repoPath, ["field", "get", fieldId]))
  );
  const fieldNameById = new Map<string, string>();
  allFieldIds.forEach((fieldId, i) => {
    const fr = fieldResults[i];
    if (fr.status === "fulfilled") fieldNameById.set(fieldId, fr.value.field.name);
  });

  const recordData = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeName: record.typeName,
    typeNamespace: record.typeNamespace,
    typeVersion: record.typeVersion,
    createdAt: record.createdAt,
    fieldValues: record.fieldValues,
    groupValues: record.groupValues,
  };

  const toFieldData = (f: FieldAssignmentPayload): TypeFieldData => ({
    fieldId: f.fieldId,
    displayLabel: f.displayLabel ?? fieldNameById.get(f.fieldId),
    order: f.order,
    required: f.required,
    repeatable: f.repeatable,
    minItems: f.minItems,
    maxItems: f.maxItems,
  });

  const fieldData = typeFields.map(toFieldData);

  const groupData: TypeFieldGroupData[] = fieldGroups.map((g) => ({
    groupId: g.groupId,
    label: g.label,
    description: g.description,
    order: g.order,
    required: g.required,
    repeatable: g.repeatable,
    minItems: g.minItems,
    maxItems: g.maxItems,
    fields: g.fields.map(toFieldData),
  }));

  const panelTitle = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const html = formWrapHtml(panelTitle, buildRecordForm(recordData, fieldData, groupData));

  EntityEditorPanel.show(context, `record:${id}`, panelTitle, html, async (data) => {
    const d = data as {
      instanceId: string;
      typeId: string;
      typeName: string;
      typeNamespace: string;
      typeVersion: number;
      createdAt?: string;
      fieldValues: Array<{ fieldId: string; value: string }>;
      groupValues?: Array<{
        groupId: string;
        entries: Array<{
          entryId?: string;
          fieldValues: Array<{ fieldId: string; value: string; entries?: Array<{ value: string }> }>;
        }>;
      }>;
    };

    // Concurrent-change guard
    const refetch = await cli.runOk<RecordPayload>(repoPath, ["record", "get", id]);
    if (refetch.record.fieldValues.length !== record.fieldValues.length) {
      const proceed = await vscode.window.showWarningMessage(
        `SRS: Record was modified since you opened it. Overwrite?`,
        { modal: true },
        "Overwrite",
      );
      if (proceed !== "Overwrite") return;
    }

    await cli.runOk<unknown>(repoPath, ["record", "update", id], {
      stdin: JSON.stringify(d),
    });

    treeProvider.refresh();
  });
}

// ---- View CRUD ----

async function cmdCreateView(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) { vscode.window.showWarningMessage("SRS: No active repository."); return; }

  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      $schema: "https://srs.semanticops.com/schema/2.0/view.json",
      id: randomUUID(),
      namespace: "com.example",
      name: "my-view",
      version: 1,
      description: "Description of what this view presents.",
      fieldViews: [],
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );

  const doc = await vscode.workspace.openTextDocument({ content: scaffold, language: "json" });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    "SRS: Edit the view definition above, then click Create.",
    "Create",
    "Cancel",
  );
  if (answer !== "Create") return;

  try {
    await cli.runOk<unknown>(repo.rootPath, ["view", "create"], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: View created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create view: ${msg}`);
  }
}

async function cmdUpdateView(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) { vscode.window.showWarningMessage("SRS: No active repository."); return; }

  const picked = await pickView(cli, repo.rootPath);
  if (!picked) return;

  await editView(cli, repo.rootPath, picked.id, treeProvider);
}

async function editView(
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  interface ViewGetPayload { view: Record<string, unknown> }
  const payload = await cli.runOk<ViewGetPayload>(repoPath, ["view", "get", id]);

  const doc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(payload.view, null, 2),
    language: "json",
  });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    `SRS: Edit the view definition above, then click Update.`,
    "Update",
    "Cancel",
  );
  if (answer !== "Update") return;

  try {
    await cli.runOk<unknown>(repoPath, ["view", "update", id], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: View updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to update view: ${msg}`);
  }
}

// ---- Document View CRUD ----

async function cmdCreateDocumentView(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) { vscode.window.showWarningMessage("SRS: No active repository."); return; }

  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      $schema: "https://srs.semanticops.com/schema/2.0/document-view.json",
      id: randomUUID(),
      namespace: "com.example",
      name: "my-document-view",
      version: 1,
      description: "Description of what document this produces.",
      sections: [],
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );

  const doc = await vscode.workspace.openTextDocument({ content: scaffold, language: "json" });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    "SRS: Edit the document view definition above, then click Create.",
    "Create",
    "Cancel",
  );
  if (answer !== "Create") return;

  try {
    await cli.runOk<unknown>(repo.rootPath, ["document-view", "create"], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Document view created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create document view: ${msg}`);
  }
}

async function cmdUpdateDocumentView(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) { vscode.window.showWarningMessage("SRS: No active repository."); return; }

  const picked = await pickDocumentView(cli, repo.rootPath);
  if (!picked) return;

  await editDocumentView(cli, repo.rootPath, picked.id, treeProvider);
}

async function editDocumentView(
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  interface DocumentViewGetPayload { documentView: Record<string, unknown> }
  const payload = await cli.runOk<DocumentViewGetPayload>(repoPath, ["document-view", "get", id]);

  const doc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(payload.documentView, null, 2),
    language: "json",
  });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    `SRS: Edit the document view definition above, then click Update.`,
    "Update",
    "Cancel",
  );
  if (answer !== "Update") return;

  try {
    await cli.runOk<unknown>(repoPath, ["document-view", "update", id], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Document view updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to update document view: ${msg}`);
  }
}

// ---- Theme CRUD ----

async function cmdCreateTheme(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) { vscode.window.showWarningMessage("SRS: No active repository."); return; }

  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      $schema: "https://srs.semanticops.com/schema/2.0/theme.json",
      id: randomUUID(),
      namespace: "com.example",
      name: "my-theme",
      version: 1,
      description: "Description of this theme and its intended output format.",
      targets: ["html"],
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );

  const doc = await vscode.workspace.openTextDocument({ content: scaffold, language: "json" });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    "SRS: Edit the theme definition above, then click Create.",
    "Create",
    "Cancel",
  );
  if (answer !== "Create") return;

  try {
    await cli.runOk<unknown>(repo.rootPath, ["theme", "create"], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Theme created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create theme: ${msg}`);
  }
}

async function cmdUpdateTheme(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) { vscode.window.showWarningMessage("SRS: No active repository."); return; }

  const picked = await pickTheme(cli, repo.rootPath);
  if (!picked) return;

  await editTheme(cli, repo.rootPath, picked.id, treeProvider);
}

async function editTheme(
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  interface ThemeGetPayload { theme: Record<string, unknown> }
  const payload = await cli.runOk<ThemeGetPayload>(repoPath, ["theme", "get", id]);

  const doc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(payload.theme, null, 2),
    language: "json",
  });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    `SRS: Edit the theme definition above, then click Update.`,
    "Update",
    "Cancel",
  );
  if (answer !== "Update") return;

  try {
    await cli.runOk<unknown>(repoPath, ["theme", "update", id], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Theme updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to update theme: ${msg}`);
  }
}

// ---- Relation creator ----

async function cmdCreateRelation(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage("SRS: No active repository.");
    return;
  }

  // 1. Pick relation type
  const pickedType = await pickRelationType(cli, repo.rootPath);
  if (!pickedType) return;

  // 2. Build instance list for source/target pickers
  // Combine notes and records into one searchable list
  const instanceItems = await buildInstanceItems(cli, repo.rootPath);
  if (instanceItems.length === 0) {
    vscode.window.showWarningMessage(
      "SRS: No instances found to relate. Create some notes or records first.",
    );
    return;
  }

  const source = await vscode.window.showQuickPick(instanceItems, {
    placeHolder: "Select source instance",
    matchOnDescription: true,
  });
  if (!source) return;

  const target = await vscode.window.showQuickPick(
    instanceItems.filter((i) => i.id !== source.id),
    { placeHolder: "Select target instance", matchOnDescription: true },
  );
  if (!target) return;

  const { randomUUID } = await import("crypto");
  const relationJson = JSON.stringify({
    relationId: randomUUID(),
    relationType: pickedType.relationType,
    sourceInstanceId: source.id,
    targetInstanceId: target.id,
    createdAt: new Date().toISOString(),
  });

  try {
    await cli.runOk<unknown>(repo.rootPath, ["relation", "create"], {
      stdin: relationJson,
    });
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `SRS: Relation '${pickedType.relationType}' created.`,
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create relation: ${msg}`);
  }
}

// ---- Relation type CRUD ----

async function cmdCreateRelationType(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage("SRS: No active repository.");
    return;
  }

  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      id: randomUUID(),
      version: 1,
      relationType: "namespace/name",
      namespace: "com.example",
      label: "My relation type",
      description: "Description of what this relation means.",
      category: "association",
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );

  const doc = await vscode.workspace.openTextDocument({
    content: scaffold,
    language: "json",
  });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    "SRS: Edit the relation type definition above, then click Create.",
    "Create",
    "Cancel",
  );
  if (answer !== "Create") return;

  const content = doc.getText();
  try {
    await cli.runOk<unknown>(repo.rootPath, ["relation-type", "create"], {
      stdin: content,
    });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Relation type created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create relation type: ${msg}`);
  }
}

async function cmdUpdateRelationType(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage("SRS: No active repository.");
    return;
  }

  const picked = await pickRelationType(cli, repo.rootPath);
  if (!picked) return;

  interface RelationTypeGetPayload {
    relationTypeDefinition: Record<string, unknown>;
  }
  const payload = await cli.runOk<RelationTypeGetPayload>(repo.rootPath, [
    "relation-type",
    "get",
    picked.id,
  ]);

  const doc = await vscode.workspace.openTextDocument({
    content: JSON.stringify(payload.relationTypeDefinition, null, 2),
    language: "json",
  });
  await vscode.window.showTextDocument(doc);

  const answer = await vscode.window.showInformationMessage(
    `SRS: Edit '${picked.label}', then click Update.`,
    "Update",
    "Cancel",
  );
  if (answer !== "Update") return;

  const content = doc.getText();
  try {
    await cli.runOk<unknown>(repo.rootPath, ["relation-type", "update", picked.id], {
      stdin: content,
    });
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Relation type updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to update relation type: ${msg}`);
  }
}

async function cmdDeleteRelationType(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage("SRS: No active repository.");
    return;
  }

  const picked = await pickRelationType(cli, repo.rootPath);
  if (!picked) return;

  const confirm = await vscode.window.showWarningMessage(
    `SRS: Delete relation type '${picked.label}' (${picked.relationType})? This will fail if any stored relations reference it.`,
    { modal: true },
    "Delete",
  );
  if (confirm !== "Delete") return;

  try {
    await cli.runOk<unknown>(repo.rootPath, ["relation-type", "delete", picked.id]);
    treeProvider.refresh();
    vscode.window.showInformationMessage("SRS: Relation type deleted.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to delete relation type: ${msg}`);
  }
}

// ---- Helpers ----

interface InstanceItem {
  label: string;
  description: string;
  id: string;
}

async function pickRelationType(
  cli: CliClient,
  repoPath: string,
): Promise<{ id: string; label: string; relationType: string } | undefined> {
  let defs: RelationTypeListPayload["relationTypeDefinitions"] = [];
  try {
    const payload = await cli.runOk<RelationTypeListPayload>(repoPath, ["relation-type", "list"]);
    defs = payload.relationTypeDefinitions;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Could not load relation types: ${msg}`);
    return undefined;
  }

  if (defs.length === 0) {
    vscode.window.showWarningMessage("SRS: No relation type definitions found in this repository.");
    return undefined;
  }

  const items = defs.map((rt) => ({
    label: rt.label,
    description: rt.relationType,
    id: rt.id,
    relationType: rt.relationType,
  }));

  return vscode.window.showQuickPick(items, { placeHolder: "Select relation type" });
}

async function pickView(
  cli: CliClient,
  repoPath: string,
): Promise<{ id: string; label: string } | undefined> {
  let views: ViewListPayload["views"] = [];
  try {
    const payload = await cli.runOk<ViewListPayload>(repoPath, ["view", "list"]);
    views = payload.views;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Could not load views: ${msg}`);
    return undefined;
  }

  if (views.length === 0) {
    vscode.window.showWarningMessage("SRS: No view definitions found in this repository.");
    return undefined;
  }

  const items = views.map((v) => ({
    label: `${v.namespace}/${v.name}`,
    description: v.id,
    id: v.id,
  }));

  return vscode.window.showQuickPick(items, { placeHolder: "Select view" });
}

async function pickDocumentView(
  cli: CliClient,
  repoPath: string,
): Promise<{ id: string; label: string } | undefined> {
  let views: DocumentViewListPayload["documentViews"] = [];
  try {
    const payload = await cli.runOk<DocumentViewListPayload>(repoPath, ["document-view", "list"]);
    views = payload.documentViews;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Could not load document views: ${msg}`);
    return undefined;
  }

  if (views.length === 0) {
    vscode.window.showWarningMessage("SRS: No document view definitions found in this repository.");
    return undefined;
  }

  const items = views.map((v) => ({
    label: `${v.namespace}/${v.name}`,
    description: `v${v.version}`,
    id: v.id,
  }));

  return vscode.window.showQuickPick(items, { placeHolder: "Select document view" });
}

async function pickTheme(
  cli: CliClient,
  repoPath: string,
): Promise<{ id: string; label: string } | undefined> {
  let themes: ThemeListPayload["themes"] = [];
  try {
    const payload = await cli.runOk<ThemeListPayload>(repoPath, ["theme", "list"]);
    themes = payload.themes;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Could not load themes: ${msg}`);
    return undefined;
  }

  if (themes.length === 0) {
    vscode.window.showWarningMessage("SRS: No theme definitions found in this repository.");
    return undefined;
  }

  const items = themes.map((t) => ({
    label: `${t.namespace}/${t.name}`,
    description: `v${t.version}`,
    id: t.id,
  }));

  return vscode.window.showQuickPick(items, { placeHolder: "Select theme" });
}

async function buildInstanceItems(
  cli: CliClient,
  repoPath: string,
): Promise<InstanceItem[]> {
  const items: InstanceItem[] = [];

  try {
    const notes = await cli.runOk<NoteListPayload>(repoPath, ["note", "list"]);
    for (const n of notes.notes) {
      items.push({ label: n.title, description: `note · ${n.instanceId.slice(0, 8)}`, id: n.instanceId });
    }
  } catch { /* ignore */ }

  try {
    const records = await cli.runOk<RecordListPayload>(repoPath, ["record", "list"]);
    for (const r of records.records) {
      items.push({
        label: r.displayLabel,
        description: `record · ${r.instanceId.slice(0, 8)}`,
        id: r.instanceId,
      });
    }
  } catch { /* ignore */ }

  return items;
}
