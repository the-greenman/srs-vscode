import * as vscode from "vscode";
import { CliError } from "../cli/errors";

export class EntityEditorPanel implements vscode.Disposable {
  private static readonly _panels = new Map<string, EntityEditorPanel>();

  static show(
    context: vscode.ExtensionContext,
    id: string,
    title: string,
    html: string,
    onSave: (data: unknown) => Promise<void>,
  ): EntityEditorPanel {
    const existing = EntityEditorPanel._panels.get(id);
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.Active);
      existing._panel.title = title;
      existing._onSave = onSave;
      existing._update(html);
      return existing;
    }
    const panel = new EntityEditorPanel(context, id, title, html, onSave);
    EntityEditorPanel._panels.set(id, panel);
    return panel;
  }

  private readonly _panel: vscode.WebviewPanel;
  private _onSave: (data: unknown) => Promise<void>;

  private constructor(
    _context: vscode.ExtensionContext,
    private readonly _id: string,
    title: string,
    html: string,
    onSave: (data: unknown) => Promise<void>,
  ) {
    this._onSave = onSave;

    this._panel = vscode.window.createWebviewPanel(
      "srsEditor",
      title,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [],
      },
    );

    this._update(html);

    this._panel.webview.onDidReceiveMessage(async (msg: { type: string; data?: unknown }) => {
      if (msg.type === "cancel") {
        this.dispose();
        return;
      }

      if (msg.type === "save") {
        try {
          await this._onSave(msg.data);
          // Success — close the panel
          this.dispose();
        } catch (err) {
          const messages =
            err instanceof CliError
              ? err.diagnostics
              : [String(err)];
          this._panel.webview.postMessage({ type: "error", messages });
        }
      }
    });

    this._panel.onDidDispose(() => {
      EntityEditorPanel._panels.delete(this._id);
    });
  }

  private _update(html: string): void {
    this._panel.webview.html = html;
  }

  dispose(): void {
    this._panel.dispose();
  }
}
