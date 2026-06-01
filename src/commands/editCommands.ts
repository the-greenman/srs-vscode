import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import { EntityEditorPanel } from "../webview/EntityEditorPanel";
import { formWrapHtml, buildNoteForm, buildTagForm, buildRecordForm } from "../webview/forms";
import type {
  RelationTypeListPayload,
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

interface TagPayload {
  tagDefinition: {
    instanceId: string;
    slug: string;
    label?: string;
    createdAt?: string;
  };
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
  };
}

interface TypePayload {
  type: {
    id: string;
    name: string;
    namespace: string;
    version: number;
    fields: Array<{
      fieldId: string;
      displayLabel?: string;
      order: number;
      required: boolean;
      repeatable?: boolean;
      minItems?: number;
      maxItems?: number;
    }>;
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
      case "tag":
        await editTag(context, cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "record":
        await editRecord(context, cli, repo.rootPath, node.entityId, treeProvider);
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

// ---- Tag editor ----

async function editTag(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const payload = await cli.runOk<TagPayload>(repoPath, ["tag", "get", id]);
  const tag = payload.tagDefinition;

  const tagData = {
    instanceId: tag.instanceId,
    slug: tag.slug,
    label: tag.label,
    createdAt: tag.createdAt,
  };

  const html = formWrapHtml(`Edit Tag: ${tag.slug}`, buildTagForm(tagData));

  EntityEditorPanel.show(context, `tag:${id}`, `Edit Tag: ${tag.slug}`, html, async (data) => {
    const d = data as {
      instanceId: string;
      slug: string;
      label?: string;
      createdAt?: string;
    };

    // Concurrent-change guard
    const refetch = await cli.runOk<TagPayload>(repoPath, ["tag", "get", id]);
    if (refetch.tagDefinition.slug !== tag.slug) {
      const proceed = await vscode.window.showWarningMessage(
        `SRS: Tag was modified since you opened it. Overwrite?`,
        { modal: true },
        "Overwrite",
      );
      if (proceed !== "Overwrite") return;
    }

    await cli.runOk<unknown>(repoPath, ["tag", "update", id], {
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

  // Fetch field definitions in parallel to use field name as fallback label
  const fieldResults = await Promise.allSettled(
    typeFields.map((f) => cli.runOk<FieldPayload>(repoPath, ["field", "get", f.fieldId]))
  );

  const recordData = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeName: record.typeName,
    typeNamespace: record.typeNamespace,
    typeVersion: record.typeVersion,
    createdAt: record.createdAt,
    fieldValues: record.fieldValues,
  };

  const fieldData = typeFields.map((f, i) => {
    const fr = fieldResults[i];
    const fieldName = fr.status === "fulfilled" ? fr.value.field.name : undefined;
    return {
      fieldId: f.fieldId,
      displayLabel: f.displayLabel ?? fieldName,
      order: f.order,
      required: f.required,
      repeatable: f.repeatable,
      minItems: f.minItems,
      maxItems: f.maxItems,
    };
  });

  const panelTitle = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const html = formWrapHtml(panelTitle, buildRecordForm(recordData, fieldData));

  EntityEditorPanel.show(context, `record:${id}`, panelTitle, html, async (data) => {
    const d = data as {
      instanceId: string;
      typeId: string;
      typeName: string;
      typeNamespace: string;
      typeVersion: number;
      createdAt?: string;
      fieldValues: Array<{ fieldId: string; value: string }>;
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
  let relationTypes: RelationTypeListPayload["relationTypeDefinitions"] = [];
  try {
    const payload = await cli.runOk<RelationTypeListPayload>(repo.rootPath, [
      "relation-type",
      "list",
    ]);
    relationTypes = payload.relationTypeDefinitions;
  } catch {
    // Fall back to canonical built-ins if relation-type list is unavailable
  }

  const CANONICAL_TYPES = [
    "contains", "depends-on", "supersedes", "refines",
    "derived-from", "evidences", "precedes",
  ];

  const typeItems =
    relationTypes.length > 0
      ? relationTypes.map((rt) => ({
          label: rt.label,
          description: rt.relationType,
          value: rt.relationType,
        }))
      : CANONICAL_TYPES.map((t) => ({ label: t, description: "", value: t }));

  const pickedType = await vscode.window.showQuickPick(typeItems, {
    placeHolder: "Select relation type",
  });
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
    relationType: pickedType.value,
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
      `SRS: Relation '${pickedType.value}' created.`,
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
        label: `${r.typeNamespace}/${r.typeName}`,
        description: `record · ${r.instanceId.slice(0, 8)}`,
        id: r.instanceId,
      });
    }
  } catch { /* ignore */ }

  return items;
}
