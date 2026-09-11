// The Compositions view: the repository read as the documents it composes into,
// which is the view a reader wants first. The entity-kind trees stay beneath it
// as the raw-data views.
import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";
import { CliError } from "../cli/errors";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { EntityNode, ErrorNode } from "./SrsTreeDataProvider";
import type { CompositionListPayload, RepoPresentationListPayload } from "../cli/types";

export class CompositionsTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly cli: CliClient,
    private readonly repoProvider: RepositoryProvider,
  ) {
    this._disposables.push(repoProvider.onDidChangeActive(() => this.refresh()));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const repo = this.repoProvider.active;
    if (element || !repo) return [];

    try {
      const [list, presentations] = await Promise.all([
        this.cli.runOk<CompositionListPayload>(repo.rootPath, ["composition", "list"]),
        // RFC-015: which document a conformant viewer opens. Best-effort — an
        // older CLI or a repo without renderedPresentations just marks nothing.
        this.cli
          .runOk<RepoPresentationListPayload>(repo.rootPath, ["repo", "presentation", "list"])
          .catch(() => ({ presentations: [] })),
      ]);

      const defaultId = defaultPresentation(presentations.presentations);

      return list.compositions.map((c) => {
        const isDefault = c.id === defaultId;
        const node = new EntityNode(
          c.id,
          "composition",
          `${c.namespace}/${c.name}`,
          ["composition", "get", c.id],
          isDefault ? `v${c.version} · default` : `v${c.version}`,
        );
        node.tooltip = c.description ?? `composition: ${c.id}`;
        node.iconPath = new vscode.ThemeIcon(isDefault ? "star-full" : "book");
        return node;
      });
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      return [new ErrorNode(`Failed to load compositions: ${msg}`)];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}

/** RFC-015: the first presentation flagged isDefault, else the first declared. */
export function defaultPresentation(
  presentations: RepoPresentationListPayload["presentations"],
): string | undefined {
  return (presentations.find((p) => p.isDefault) ?? presentations[0])?.compositionId;
}
