import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { GraphPanel } from "../graph/GraphPanel";
import { EntityDocumentProvider, entityUri } from "../provider/EntityDocumentProvider";
import type { EntityKind } from "../cli/types";

export function registerGraphCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  entityProvider: EntityDocumentProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.showRelationGraph", () =>
      cmdShowRelationGraph(context, cli, repoProvider),
    ),
    vscode.commands.registerCommand(
      "srs.openEntityById",
      (id: string, kind: string, repoPath: string) =>
        cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider),
    ),
  );
}

async function cmdShowRelationGraph(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first.",
    );
    return;
  }

  try {
    await GraphPanel.show(context, cli, repo.rootPath, repo.title);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to open relation graph: ${msg}`);
  }
}

async function cmdOpenEntityById(
  id: string,
  kind: string,
  repoPath: string,
  repoProvider: RepositoryProvider,
  entityProvider: EntityDocumentProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) return;

  // repoPath from the graph panel must match the active repo; use its repositoryId for the URI
  const entityKind = kind as EntityKind;
  try {
    const uri = entityUri(repo.repositoryId, entityKind, id);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false,
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}
