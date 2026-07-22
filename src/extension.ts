import * as vscode from "vscode";
import { CliClient } from "./cli/CliClient";
import { RepositoryProvider } from "./repository/RepositoryProvider";
import { SrsTreeDataProvider } from "./tree/SrsTreeDataProvider";
import { AttentionManager } from "./container/AttentionManager";
import { ContainerStatusBarItem } from "./container/ContainerStatusBarItem";
import { SchemaProvider } from "./schema/SchemaProvider";
import { EntityDocumentProvider, ENTITY_SCHEME } from "./provider/EntityDocumentProvider";
import { DiagnosticsProvider } from "./diagnostics/DiagnosticsProvider";
import { registerRepositoryCommands } from "./commands/repositoryCommands";
import { registerPreviewCommands } from "./commands/previewCommands";
import { registerEditCommands } from "./commands/editCommands";
import { registerContainerCommands } from "./commands/containerCommands";
import { registerMutationCommands } from "./commands/mutationCommands";
import { registerGraphCommands } from "./commands/graphCommands";
import { NavigatorTreeDataProvider } from "./tree/NavigatorTreeDataProvider";
import { registerNavigatorCommands } from "./commands/navigatorCommands";
import { registerGuideEditorCommands } from "./webview/guides/guideEditorCommands";
import { ArchiveManager } from "./archive/ArchiveManager";
import { ArchiveStatusBarItem } from "./archive/ArchiveStatusBarItem";
import { registerArchiveCommands } from "./commands/archiveCommands";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("SRS");
  context.subscriptions.push(outputChannel);

  const cli = new CliClient(outputChannel);
  const repoProvider = new RepositoryProvider(cli);
  const attention = new AttentionManager(context.workspaceState, cli);
  const treeProvider = new SrsTreeDataProvider(cli, repoProvider, attention);
  const navigatorProvider = new NavigatorTreeDataProvider(cli, repoProvider);
  const statusBarItem = new ContainerStatusBarItem(attention);
  const schemaProvider = new SchemaProvider(context.extensionUri);
  const entityDocProvider = new EntityDocumentProvider(cli, repoProvider);
  const diagnosticsProvider = new DiagnosticsProvider(cli, repoProvider);
  const archiveManager = new ArchiveManager(context, cli, repoProvider);
  const archiveStatusBarItem = new ArchiveStatusBarItem(archiveManager, repoProvider);

  context.subscriptions.push(
    repoProvider,
    treeProvider,
    navigatorProvider,
    attention,
    statusBarItem,
    schemaProvider,
    entityDocProvider,
    diagnosticsProvider,
    archiveManager,
    archiveStatusBarItem,
    vscode.workspace.registerTextDocumentContentProvider(
      ENTITY_SCHEME,
      entityDocProvider,
    ),
  );

  const treeView = vscode.window.createTreeView("srsRepositoryTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const navigatorView = vscode.window.createTreeView("srsNavigatorTree", {
    treeDataProvider: navigatorProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(navigatorView);

  // Initialise context key for mode-sensitive toolbar buttons
  vscode.commands.executeCommand("setContext", "srs.navigatorMode", "relations");

  // Keep tree view title in sync with active repository name; clear stale diagnostics on change
  repoProvider.onDidChangeActive((repo) => {
    treeView.title = repo ? `SRS: ${repo.title}` : "SRS Repository";
    if (repo) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
      diagnosticsProvider.clear();
    }
  });

  // Validate on save when srs.validate.onSave is enabled
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const repo = repoProvider.active;
      if (!repo) return;
      const config = vscode.workspace.getConfiguration("srs");
      if (!config.get<boolean>("validate.onSave", true)) return;
      // Only trigger for files inside the active repository root
      if (!doc.uri.fsPath.startsWith(repo.rootPath)) return;
      diagnosticsProvider.validate();
    }),
  );

  registerRepositoryCommands(
    context,
    cli,
    repoProvider,
    treeProvider,
    outputChannel,
    entityDocProvider,
    diagnosticsProvider,
  );

  registerContainerCommands(context, cli, repoProvider, attention, treeProvider);

  registerMutationCommands(context, cli, repoProvider, attention, treeProvider);
  registerPreviewCommands(context, cli, repoProvider, attention);
  registerEditCommands(context, cli, repoProvider, treeProvider);
  registerGraphCommands(context, cli, repoProvider, entityDocProvider);
  registerNavigatorCommands(context, navigatorProvider);
  registerGuideEditorCommands(context, cli, repoProvider, treeProvider);
  registerArchiveCommands(context, cli, repoProvider, archiveManager);

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
