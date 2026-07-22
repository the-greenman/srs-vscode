import * as vscode from "vscode";
import * as path from "path";
import { ArchiveManager } from "./ArchiveManager";
import { RepositoryProvider } from "../repository/RepositoryProvider";

// Status-bar indicator for archive-backed repositories. Visible only when the
// active repository was opened from a `.srs` archive; shows a filled dot while
// the working copy has unsaved changes (diverged from the packed archive) and
// offers a one-click "Save to .srs".
export class ArchiveStatusBarItem implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly archiveManager: ArchiveManager,
    private readonly repoProvider: RepositoryProvider,
  ) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99,
    );
    this._item.command = "srs.saveArchive";
    this._disposables.push(this._item);

    this._disposables.push(
      archiveManager.onDidChangeDirty(() => this._update()),
      repoProvider.onDidChangeActive(() => this._update()),
    );

    this._update();
  }

  private _update(): void {
    const archivePath = this.repoProvider.active?.archivePath;
    if (!archivePath) {
      this._item.hide();
      return;
    }

    const name = path.basename(archivePath);
    if (this.archiveManager.isDirty) {
      this._item.text = `$(archive) ● ${name}`;
      this._item.tooltip = `SRS: ${name} has unsaved changes — click to save to .srs`;
    } else {
      this._item.text = `$(archive) ${name}`;
      this._item.tooltip = `SRS: ${name} (saved) — click to re-pack to .srs`;
    }
    this._item.show();
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}
