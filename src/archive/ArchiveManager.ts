import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import type { ArchivePackPayload, ArchiveUnpackPayload } from "../cli/types";
import { archiveWorkdirName } from "./workdir";

// Manages `.srs` (SRSzip) archives for the extension.
//
// Model is pack/unpack (ADR-033), not a live store: a `.srs` cannot be edited in
// place. openArchive() unpacks it into a managed working copy under the
// extension's global storage and makes that directory the active repository — so
// the entire rest of the extension (trees, editing, previews, diagnostics) works
// against it unchanged. saveActive() repacks the working copy back into the
// source `.srs`. A FileSystemWatcher on the working copy tracks whether it has
// diverged from the packed archive (dirty), so the UI can prompt to save.
export class ArchiveManager implements vscode.Disposable {
  private _current:
    | { archivePath: string; workdir: string; watcher: vscode.FileSystemWatcher }
    | undefined;
  private _dirty = false;

  private readonly _onDidChangeDirty = new vscode.EventEmitter<void>();
  readonly onDidChangeDirty = this._onDidChangeDirty.event;

  private readonly _disposables: vscode.Disposable[] = [this._onDidChangeDirty];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly cli: CliClient,
    private readonly repoProvider: RepositoryProvider,
  ) {
    // Stop watching / clear dirty once the user moves to a repo that isn't this
    // archive's working copy (e.g. via "SRS: Select Repository").
    this._disposables.push(
      repoProvider.onDidChangeActive((repo) => {
        if (this._current && repo?.rootPath !== this._current.workdir) {
          this._teardown();
        }
      }),
    );
  }

  get isDirty(): boolean {
    return this._dirty;
  }

  get activeArchivePath(): string | undefined {
    return this._current?.archivePath;
  }

  // Unpack a `.srs` archive into a fresh working copy and activate it.
  async openArchive(archivePath: string): Promise<void> {
    const workdir = this._workdirFor(archivePath);

    // `archive unpack` requires a new/empty target — clear any stale working copy.
    const archivesRoot = vscode.Uri.joinPath(
      this.context.globalStorageUri,
      "archives",
    );
    await vscode.workspace.fs.createDirectory(archivesRoot);
    await this._deleteIfExists(vscode.Uri.file(workdir));

    await this.cli.runRawOk<ArchiveUnpackPayload>([
      "archive",
      "unpack",
      archivePath,
      "--target",
      workdir,
    ]);

    const repo = await this.repoProvider.probe(workdir);
    if (!repo) {
      throw new CliError(
        `Unpacked archive at ${workdir} did not load as a valid SRS repository.`,
        ["archive unpack produced an unloadable repository"],
        "archive unpack",
      );
    }

    // Bind the working copy to its source archive before activating, so the
    // onDidChangeActive listener recognises this activation as our own.
    this._teardown();
    const watcher = this._startWatching(workdir);
    this._current = { archivePath, workdir, watcher };
    this._setDirty(false);

    this.repoProvider.setActive({ ...repo, archivePath });
  }

  // Repack the active archive-backed working copy into its source `.srs`.
  // Returns false (with a warning) if the active repo isn't archive-backed.
  async saveActive(): Promise<boolean> {
    const repo = this.repoProvider.active;
    if (!repo?.archivePath) {
      vscode.window.showWarningMessage(
        "SRS: The active repository is not opened from a .srs archive. Use 'SRS: Export Repository to .srs' instead.",
      );
      return false;
    }
    await this.cli.runOk<ArchivePackPayload>(repo.rootPath, [
      "archive",
      "pack",
      "--output",
      repo.archivePath,
    ]);
    this._setDirty(false);
    return true;
  }

  // Pack the active repository (any kind — directory, working copy, or .srsj) into
  // a `.srs` at a user-chosen path. Does not change the active repo or dirty state.
  async exportActive(targetPath: string): Promise<ArchivePackPayload> {
    const repo = this.repoProvider.active;
    if (!repo) {
      throw new CliError(
        "No active SRS repository to export.",
        ["no active repository"],
        "archive pack",
      );
    }
    return this.cli.runOk<ArchivePackPayload>(repo.rootPath, [
      "archive",
      "pack",
      "--output",
      targetPath,
    ]);
  }

  private _workdirFor(archivePath: string): string {
    return vscode.Uri.joinPath(
      this.context.globalStorageUri,
      "archives",
      archiveWorkdirName(archivePath),
    ).fsPath;
  }

  private _startWatching(workdir: string): vscode.FileSystemWatcher {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(workdir), "**/*"),
    );
    const markDirty = () => this._setDirty(true);
    watcher.onDidChange(markDirty);
    watcher.onDidCreate(markDirty);
    watcher.onDidDelete(markDirty);
    return watcher;
  }

  private _teardown(): void {
    this._current?.watcher.dispose();
    this._current = undefined;
    this._setDirty(false);
  }

  private _setDirty(value: boolean): void {
    if (this._dirty === value) return;
    this._dirty = value;
    this._onDidChangeDirty.fire();
  }

  private async _deleteIfExists(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri, {
        recursive: true,
        useTrash: false,
      });
    } catch {
      // Not present — nothing to remove.
    }
  }

  dispose(): void {
    this._current?.watcher.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
