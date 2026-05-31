import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import type {
  TypeListPayload,
  RelationTypeListPayload,
  NoteListPayload,
  RecordListPayload,
  TagListPayload,
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
    fieldValues: Array<{ fieldId: string; value: unknown }>;
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
    }>;
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
      cmdEditEntity(cli, repoProvider, treeProvider, node),
    ),
    vscode.commands.registerCommand("srs.createRelation", () =>
      cmdCreateRelation(cli, repoProvider, treeProvider),
    ),
  );
}

// ---- Dispatch ----

async function cmdEditEntity(
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
        await editNote(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "tag":
        await editTag(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "record":
        await editRecord(cli, repo.rootPath, node.entityId, treeProvider);
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
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const payload = await cli.runOk<NotePayload>(repoPath, ["note", "get", id]);
  const note = payload.note;

  // --- Title ---
  const title = await vscode.window.showInputBox({
    title: "Edit Note (1/3) — Title",
    value: note.title,
    prompt: "Note title",
    validateInput: (v) => (v.trim() ? undefined : "Title is required"),
  });
  if (title === undefined) return; // cancelled

  // --- Tags ---
  const tagsInput = await vscode.window.showInputBox({
    title: "Edit Note (2/3) — Tags",
    value: (note.tags ?? []).join(", "),
    prompt: "Comma-separated tag slugs (leave blank to clear)",
  });
  if (tagsInput === undefined) return;
  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // --- Sections ---
  // For each existing section, offer to edit content in a multi-line input box.
  const sections = note.sections ? [...note.sections] : [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const sectionLabel = s.label ?? s.name;
    const content = await vscode.window.showInputBox({
      title: `Edit Note (3/3) — Section: ${sectionLabel}`,
      value: s.content,
      prompt: `Content for section "${sectionLabel}" (markdown)`,
    });
    if (content === undefined) return; // cancelled
    sections[i] = { ...s, content };
  }

  const updated = {
    instanceId: note.instanceId,
    title: title.trim(),
    tags,
    sections,
    createdAt: note.createdAt,
  };

  // Concurrent-change guard: re-fetch and compare title before saving
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
    stdin: JSON.stringify(updated),
  });

  treeProvider.refresh();
  vscode.window.showInformationMessage(`SRS: Note '${title}' updated.`);
}

// ---- Tag editor ----

async function editTag(
  cli: CliClient,
  repoPath: string,
  id: string,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const payload = await cli.runOk<TagPayload>(repoPath, ["tag", "get", id]);
  const tag = payload.tagDefinition;

  const slug = await vscode.window.showInputBox({
    title: "Edit Tag (1/2) — Slug",
    value: tag.slug,
    prompt: "Tag slug (kebab-case)",
    validateInput: (v) =>
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim())
        ? undefined
        : "Slug must be kebab-case (e.g. my-tag)",
  });
  if (slug === undefined) return;

  const label = await vscode.window.showInputBox({
    title: "Edit Tag (2/2) — Label",
    value: tag.label ?? "",
    prompt: "Display label (optional)",
  });
  if (label === undefined) return;

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

  const updated = {
    instanceId: tag.instanceId,
    slug: slug.trim(),
    label: label.trim() || undefined,
    createdAt: tag.createdAt,
  };

  await cli.runOk<unknown>(repoPath, ["tag", "update", id], {
    stdin: JSON.stringify(updated),
  });

  treeProvider.refresh();
  vscode.window.showInformationMessage(`SRS: Tag '${slug}' updated.`);
}

// ---- Record editor ----

async function editRecord(
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
  const typeFields = typePayload.type.fields.slice().sort((a, b) => a.order - b.order);

  // Build a fieldId → current value map
  const currentValues = new Map<string, string>(
    record.fieldValues.map((fv) => [
      fv.fieldId,
      typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value),
    ]),
  );

  const typeName = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const updatedValues: Array<{ fieldId: string; value: string }> = [];

  for (let i = 0; i < typeFields.length; i++) {
    const f = typeFields[i];
    const label = f.displayLabel ?? f.fieldId.slice(0, 8);
    const required = f.required ? " (required)" : "";
    const current = currentValues.get(f.fieldId) ?? "";

    const value = await vscode.window.showInputBox({
      title: `Edit Record (${i + 1}/${typeFields.length}) — ${label}`,
      value: current,
      prompt: `${label}${required}  [${typeName}]`,
      validateInput: f.required
        ? (v) => (v.trim() ? undefined : `${label} is required`)
        : undefined,
    });
    if (value === undefined) return; // cancelled

    if (value.trim() || f.required) {
      updatedValues.push({ fieldId: f.fieldId, value: value.trim() });
    }
  }

  // Concurrent-change guard: compare fieldValues length as a cheap proxy
  const refetch = await cli.runOk<RecordPayload>(repoPath, ["record", "get", id]);
  if (refetch.record.fieldValues.length !== record.fieldValues.length) {
    const proceed = await vscode.window.showWarningMessage(
      `SRS: Record was modified since you opened it. Overwrite?`,
      { modal: true },
      "Overwrite",
    );
    if (proceed !== "Overwrite") return;
  }

  const updated = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeName: record.typeName,
    typeNamespace: record.typeNamespace,
    typeVersion: record.typeVersion,
    createdAt: record.createdAt,
    fieldValues: updatedValues,
  };

  try {
    await cli.runOk<unknown>(repoPath, ["record", "update", id], {
      stdin: JSON.stringify(updated),
    });
    treeProvider.refresh();
    vscode.window.showInformationMessage(`SRS: Record updated.`);
  } catch (err) {
    if (err instanceof CliError) {
      // Surface CLI validation diagnostics
      vscode.window.showErrorMessage(
        `SRS: Record update failed:\n${err.diagnostics.join("\n")}`,
      );
    } else {
      throw err;
    }
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

// ---- Helpers ----

interface InstanceItem {
  label: string;
  description: string;
  id: string;
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
