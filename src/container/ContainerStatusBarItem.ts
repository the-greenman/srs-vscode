import * as vscode from "vscode";
import { AttentionManager } from "./AttentionManager";

export class ContainerStatusBarItem implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly attention: AttentionManager) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this._item.command = "srs.setActiveContainer";
    this._item.tooltip = "SRS: Click to set active container";
    this._disposables.push(this._item);

    this._disposables.push(
      attention.onDidChange(() => this._update()),
    );

    this._update();
  }

  show(): void {
    this._item.show();
  }

  hide(): void {
    this._item.hide();
  }

  private _update(): void {
    const active = this.attention.active;
    if (active) {
      this._item.text = `$(package) ${active.title}`;
      this._item.tooltip = `SRS Container: ${active.title}\nClick to change`;
    } else {
      this._item.text = `$(package) No container`;
      this._item.tooltip = "SRS: No active container. Click to set one.";
    }
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}
