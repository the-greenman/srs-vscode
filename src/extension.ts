import * as vscode from "vscode";
import { CliClient } from "./cli/CliClient";
import { RepositoryProvider } from "./repository/RepositoryProvider";
import { SrsTreeDataProvider } from "./tree/SrsTreeDataProvider";
import { AttentionManager } from "./container/AttentionManager";
import { ContainerStatusBarItem } from "./container/ContainerStatusBarItem";
import { SchemaProvider } from "./schema/SchemaProvider";
import { registerRepositoryCommands } from "./commands/repositoryCommands";
import { registerContainerCommands } from "./commands/containerCommands";
import { registerMutationCommands } from "./commands/mutationCommands";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("SRS");
  context.subscriptions.push(outputChannel);

  const cli = new CliClient(outputChannel);
  const repoProvider = new RepositoryProvider(cli);
  const attention = new AttentionManager(context.workspaceState, cli);
  const treeProvider = new SrsTreeDataProvider(cli, repoProvider, attention);
  const statusBarItem = new ContainerStatusBarItem(attention);
  const schemaProvider = new SchemaProvider(context.extensionUri);

  context.subscriptions.push(
    repoProvider,
    treeProvider,
    attention,
    statusBarItem,
    schemaProvider,
  );

  const treeView = vscode.window.createTreeView("srsRepositoryTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Keep tree view title in sync with active repository name
  repoProvider.onDidChangeActive((repo) => {
    treeView.title = repo ? `SRS: ${repo.title}` : "SRS Repository";
    if (repo) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  });

  registerRepositoryCommands(
    context,
    cli,
    repoProvider,
    treeProvider,
    outputChannel,
  );

  registerContainerCommands(context, cli, repoProvider, attention, treeProvider);

  registerMutationCommands(context, cli, repoProvider, attention, treeProvider);

  // Auto-detect on activation
  await autoDetectRepository(cli, repoProvider);

  // Restore persisted active container once the active repo is known
  const activeRepo = repoProvider.active;
  if (activeRepo) {
    await attention.restore(activeRepo.rootPath);
    statusBarItem.show();
  }
}

async function autoDetectRepository(
  cli: CliClient,
  repoProvider: RepositoryProvider,
): Promise<void> {
  const config = vscode.workspace.getConfiguration("srs");
  const configuredPath = config.get<string | null>("repository.path", null);

  if (configuredPath) {
    const repo = await repoProvider.probe(configuredPath);
    if (repo) {
      repoProvider.setActive(repo);
    } else {
      const action = "Open Settings";
      const choice = await vscode.window.showWarningMessage(
        `SRS: Configured path '${configuredPath}' is not a valid SRS repository.`,
        action,
      );
      if (choice === action) {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "srs.repository.path",
        );
      }
    }
    return;
  }

  const discovered = await repoProvider.discoverAll();

  if (discovered.length === 1) {
    repoProvider.setActive(discovered[0]);
  } else if (discovered.length > 1) {
    vscode.window.showInformationMessage(
      `SRS: Found ${discovered.length} repositories in workspace. Use 'SRS: Select Repository' to choose one.`,
    );
  }
  // If 0: remain inactive; user runs 'SRS: Select Repository' manually.
}

export function deactivate(): void {
  // Disposables registered in context.subscriptions are cleaned up automatically.
}
