import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { AttentionManager } from "../container/AttentionManager";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import type {
  TypeListPayload,
  ContainerListPayload,
  NoteListPayload,
  TagListPayload,
  RecordListPayload,
} from "../cli/types";

export function registerMutationCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.createNote", () =>
      cmdCreateNote(cli, repoProvider, attention, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createTag", () =>
      cmdCreateTag(cli, repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createRecord", () =>
      cmdCreateRecord(cli, repoProvider, attention, treeProvider),
    ),
    vscode.commands.registerCommand("srs.deleteEntity", (node: unknown) =>
      cmdDeleteEntity(cli, repoProvider, treeProvider, node),
    ),
  );
}

// ---- helpers ----

function requireActiveRepo(
  repoProvider: RepositoryProvider,
): { rootPath: string } | undefined {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first.",
    );
    return undefined;
  }
  return repo;
}

function containerId(attention: AttentionManager): string | undefined {
  return attention.active?.containerId;
}

// ---- Create Note ----

async function cmdCreateNote(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = requireActiveRepo(repoProvider);
  if (!repo) return;

  const title = await vscode.window.showInputBox({
    title: "SRS: Create Note",
    prompt: "Note title",
    placeHolder: "e.g. Architecture Decision: Use CLI bridge",
    validateInput: (v) => (v.trim() ? undefined : "Title is required"),
  });
  if (!title) return;

  const { randomUUID } = await import("crypto");
  const instanceId = randomUUID();
  const now = new Date().toISOString();

  const noteJson = JSON.stringify({
    instanceId,
    title: title.trim(),
    sections: [{ name: "body", content: "", label: "Body" }],
    tags: [],
    createdAt: now,
  });

  try {
    const cid = containerId(attention);
    await cli.runOk<unknown>(repo.rootPath, ["note", "create"], {
      stdin: noteJson,
      containerId: cid,
    });
    treeProvider.refresh();
    vscode.window.showInformationMessage(`SRS: Note '${title}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create note: ${msg}`);
  }
}

// ---- Create Tag ----

async function cmdCreateTag(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = requireActiveRepo(repoProvider);
  if (!repo) return;

  const slug = await vscode.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Tag slug (kebab-case identifier)",
    placeHolder: "e.g. needs-review",
    validateInput: (v) =>
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim())
        ? undefined
        : "Slug must be kebab-case (e.g. my-tag)",
  });
  if (!slug) return;

  const label = await vscode.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Display label (optional)",
    placeHolder: "e.g. Needs Review",
  });

  const { randomUUID } = await import("crypto");
  const instanceId = randomUUID();
  const now = new Date().toISOString();

  const tagJson = JSON.stringify({
    instanceId,
    slug: slug.trim(),
    label: label?.trim() || undefined,
    createdAt: now,
  });

  try {
    await cli.runOk<unknown>(repo.rootPath, ["tag", "create"], {
      stdin: tagJson,
    });
    treeProvider.refresh();
    vscode.window.showInformationMessage(`SRS: Tag '${slug}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create tag: ${msg}`);
  }
}

// ---- Create Record ----

async function cmdCreateRecord(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = requireActiveRepo(repoProvider);
  if (!repo) return;

  // Pick a type
  let types: TypeListPayload["types"];
  try {
    const payload = await cli.runOk<TypeListPayload>(repo.rootPath, [
      "type",
      "list",
    ]);
    types = payload.types;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to list types: ${msg}`);
    return;
  }

  if (types.length === 0) {
    vscode.window.showWarningMessage(
      "SRS: No types defined in the active repository.",
    );
    return;
  }

  const typeItems = types.map((t) => ({
    label: `${t.namespace}/${t.name}`,
    description: `v${t.version}`,
    detail: t.id,
    type: t,
  }));

  const picked = await vscode.window.showQuickPick(typeItems, {
    placeHolder: "Select a type for the new record",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;

  const typeName = `${picked.type.namespace}/${picked.type.name}`;

  // Build a minimal record with empty field values — user edits via JSON after creation
  try {
    const cid = containerId(attention);
    await cli.runOk<unknown>(
      repo.rootPath,
      ["record", "create", "--type", typeName, "--version", String(picked.type.version)],
      {
        stdin: JSON.stringify({ fieldValues: [] }),
        containerId: cid,
      },
    );
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `SRS: Record of type '${typeName}' created.`,
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create record: ${msg}`);
  }
}

// ---- Delete Entity ----

async function cmdDeleteEntity(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) {
    vscode.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to delete.",
    );
    return;
  }

  const repo = repoProvider.active;
  if (!repo) return;

  const confirmed = await vscode.window.showWarningMessage(
    `SRS: Delete ${node.entityKind} '${node.label}'?`,
    { modal: true },
    "Delete",
  );
  if (confirmed !== "Delete") return;

  // Map entity kind to delete subcommand args
  const deleteArgs = deleteArgsFor(node.entityKind, node.entityId);
  if (!deleteArgs) {
    vscode.window.showErrorMessage(
      `SRS: Delete not supported for '${node.entityKind}'.`,
    );
    return;
  }

  try {
    await cli.runOk<unknown>(repo.rootPath, deleteArgs);
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `SRS: ${node.entityKind} deleted.`,
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to delete entity: ${msg}`);
  }
}

function deleteArgsFor(kind: string, id: string): string[] | undefined {
  switch (kind) {
    case "note":      return ["note", "delete", "--id", id];
    case "tag":       return ["tag", "delete", "--id", id];
    case "record":    return ["record", "delete", "--id", id];
    case "relation":  return ["relation", "delete", "--id", id];
    case "container": return ["container", "delete", "--id", id];
    default:          return undefined;
  }
}

// ---- Add/Remove member from active container ----
// These are exposed as context-menu commands on EntityNode items.

export async function cmdAddToContainer(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) return;
  const repo = repoProvider.active;
  if (!repo) return;
  const cid = containerId(attention);
  if (!cid) {
    vscode.window.showWarningMessage(
      "SRS: No active container. Use 'SRS: Set Active Container' first.",
    );
    return;
  }

  try {
    await cli.runOk<unknown>(repo.rootPath, [
      "container",
      "members",
      "add",
      "--id",
      cid,
      "--instance-id",
      node.entityId,
    ]);
    treeProvider.refresh();
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to add to container: ${msg}`);
  }
}

export async function cmdRemoveFromContainer(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) return;
  const repo = repoProvider.active;
  if (!repo) return;
  const cid = containerId(attention);
  if (!cid) return;

  try {
    await cli.runOk<unknown>(repo.rootPath, [
      "container",
      "members",
      "remove",
      "--id",
      cid,
      "--instance-id",
      node.entityId,
    ]);
    treeProvider.refresh();
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(
      `SRS: Failed to remove from container: ${msg}`,
    );
  }
}
