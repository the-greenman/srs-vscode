import * as vscode from "vscode";
import * as path from "path";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { ArchiveManager } from "../archive/ArchiveManager";

export function registerArchiveCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  archiveManager: ArchiveManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.openArchive", () =>
      cmdOpenArchive(repoProvider, archiveManager),
    ),
    vscode.commands.registerCommand("srs.saveArchive", () =>
      cmdSaveArchive(archiveManager),
    ),
    vscode.commands.registerCommand("srs.exportArchive", () =>
      cmdExportArchive(repoProvider, archiveManager),
    ),
  );
}

async function cmdOpenArchive(
  repoProvider: RepositoryProvider,
  archiveManager: ArchiveManager,
): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Open SRS Archive",
    filters: {
      "SRS Archive": ["srs"],
      "SRS Bundle (legacy)": ["srsj"],
      "All Files": ["*"],
    },
  });
  if (!picked || picked.length === 0) return;

  const fsPath = picked[0].fsPath;
  const name = path.basename(fsPath);
  const isLegacyBundle = path.extname(fsPath).toLowerCase() === ".srsj";

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `SRS: Opening ${name}…` },
      async () => {
        if (isLegacyBundle) {
          // `.srsj` is a JSON bundle the CLI reads directly via --repo — no unpack,
          // and no archive binding (Save-to-.srs doesn't apply; Export does).
          const repo = await repoProvider.probe(fsPath);
          if (!repo) {
            throw new CliError(
              `${name} did not load as a valid SRS repository.`,
              ["repo map failed on the selected file"],
              "repo map",
            );
          }
          repoProvider.setActive(repo);
        } else {
          await archiveManager.openArchive(fsPath);
        }
      },
    );

    if (isLegacyBundle) {
      vscode.window.showInformationMessage(
        `SRS: Opened legacy bundle ${name}. Use 'SRS: Export Repository to .srs' to save it in the .srs format.`,
      );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to open ${name}: ${msg}`);
  }
}

async function cmdSaveArchive(archiveManager: ArchiveManager): Promise<void> {
  const name = archiveManager.activeArchivePath
    ? path.basename(archiveManager.activeArchivePath)
    : ".srs";
  try {
    const saved = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `SRS: Saving ${name}…` },
      () => archiveManager.saveActive(),
    );
    if (saved) {
      vscode.window.showInformationMessage(`SRS: Saved ${name}.`);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to save ${name}: ${msg}`);
  }
}

async function cmdExportArchive(
  repoProvider: RepositoryProvider,
  archiveManager: ArchiveManager,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Open or select a repository first.",
    );
    return;
  }

  const target = await vscode.window.showSaveDialog({
    saveLabel: "Export .srs",
    filters: { "SRS Archive": ["srs"] },
    defaultUri: defaultExportUri(repo.archivePath, repo.title),
  });
  if (!target) return;

  const name = path.basename(target.fsPath);
  try {
    const payload = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `SRS: Exporting ${name}…` },
      () => archiveManager.exportActive(target.fsPath),
    );
    vscode.window.showInformationMessage(
      `SRS: Exported ${name} (${formatBytes(payload.fileSizeBytes)}).`,
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to export ${name}: ${msg}`);
  }
}

function defaultExportUri(
  archivePath: string | undefined,
  title: string,
): vscode.Uri | undefined {
  // Prefer re-exporting to the current archive's location; otherwise suggest a
  // name derived from the repository title next to the first workspace folder.
  if (archivePath) return vscode.Uri.file(archivePath);
  const safe = title.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "repository";
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder
    ? vscode.Uri.joinPath(folder.uri, `${safe}.srs`)
    : vscode.Uri.file(`${safe}.srs`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
