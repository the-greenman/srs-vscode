import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import type { AttachmentListPayload, AttachmentAddPayload } from "../cli/types";

export function registerAttachmentCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.attachmentAdd", () =>
      cmdAttachmentAdd(cli, repoProvider),
    ),
    vscode.commands.registerCommand("srs.attachmentList", () =>
      cmdAttachmentList(cli, repoProvider),
    ),
    vscode.commands.registerCommand("srs.attachmentExport", () =>
      cmdAttachmentExport(cli, repoProvider),
    ),
  );
}

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

async function cmdAttachmentAdd(
  cli: CliClient,
  repoProvider: RepositoryProvider,
): Promise<void> {
  const repo = requireActiveRepo(repoProvider);
  if (!repo) return;

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Add Attachment",
  });
  if (!picked || picked.length === 0) return;
  const fsPath = picked[0].fsPath;

  const title = await vscode.window.showInputBox({
    title: "SRS: Add Attachment",
    prompt: "Title (optional — leave blank to derive from filename)",
    placeHolder: path.basename(fsPath),
  });
  if (title === undefined) return;

  const subdir = await vscode.window.showInputBox({
    title: "SRS: Add Attachment",
    prompt: "Subdirectory within source-documents/ (optional)",
  });
  if (subdir === undefined) return;

  const args = ["attachment", "add", fsPath];
  if (title.trim()) args.push("--title", title.trim());
  if (subdir.trim()) args.push("--subdir", subdir.trim());

  try {
    const payload = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "SRS: Adding attachment…" },
      () => cli.runOk<AttachmentAddPayload>(repo.rootPath, args),
    );
    vscode.window.showInformationMessage(
      `SRS: Attachment added (${payload.contentPath}).`,
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to add attachment: ${msg}`);
  }
}

async function cmdAttachmentList(
  cli: CliClient,
  repoProvider: RepositoryProvider,
): Promise<void> {
  const repo = requireActiveRepo(repoProvider);
  if (!repo) return;

  let payload: AttachmentListPayload;
  try {
    payload = await cli.runOk<AttachmentListPayload>(repo.rootPath, [
      "attachment",
      "list",
    ]);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to list attachments: ${msg}`);
    return;
  }

  if (payload.entries.length === 0) {
    vscode.window.showInformationMessage(
      "SRS: No attachments in this repository.",
    );
    return;
  }

  const items = payload.entries.map((e) => ({
    label: e.title ?? path.basename(e.path),
    description: e.path,
    detail: e.sizeBytes != null ? formatBytes(e.sizeBytes) : undefined,
  }));

  await vscode.window.showQuickPick(items, {
    placeHolder: `${payload.entries.length} attachment(s) in ${payload.sourceDocumentsPath}/`,
    matchOnDescription: true,
  });
}

async function cmdAttachmentExport(
  cli: CliClient,
  repoProvider: RepositoryProvider,
): Promise<void> {
  const repo = requireActiveRepo(repoProvider);
  if (!repo) return;

  let payload: AttachmentListPayload;
  try {
    payload = await cli.runOk<AttachmentListPayload>(repo.rootPath, [
      "attachment",
      "list",
    ]);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to list attachments: ${msg}`);
    return;
  }

  if (payload.entries.length === 0) {
    vscode.window.showInformationMessage("SRS: No attachments to export.");
    return;
  }

  const items = payload.entries.map((e) => ({
    label: e.title ?? path.basename(e.path),
    description: e.path,
    detail: e.sizeBytes != null ? formatBytes(e.sizeBytes) : undefined,
    entry: e,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an attachment to export",
    matchOnDescription: true,
  });
  if (!picked) return;

  const sourcePath = path.join(
    repo.rootPath,
    payload.sourceDocumentsPath,
    picked.entry.path,
  );
  const defaultName = path.basename(picked.entry.path);

  const target = await vscode.window.showSaveDialog({
    saveLabel: "Export Attachment",
    defaultUri: vscode.Uri.file(defaultName),
  });
  if (!target) return;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `SRS: Exporting ${defaultName}…`,
      },
      () => fs.copyFile(sourcePath, target.fsPath),
    );
    vscode.window.showInformationMessage(`SRS: Exported ${defaultName}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`SRS: Export failed: ${String(err)}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
