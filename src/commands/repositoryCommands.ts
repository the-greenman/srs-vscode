import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { SrsTreeDataProvider, EntityNode } from "../tree/SrsTreeDataProvider";
import { EntityDocumentProvider, entityUri } from "../provider/EntityDocumentProvider";
import { DiagnosticsProvider } from "../diagnostics/DiagnosticsProvider";
import type { RepoValidatePayload } from "../cli/types";

export function registerRepositoryCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
  outputChannel: vscode.OutputChannel,
  entityProvider: EntityDocumentProvider,
  diagnosticsProvider: DiagnosticsProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.selectRepository", () =>
      cmdSelectRepository(cli, repoProvider),
    ),
    vscode.commands.registerCommand("srs.refreshRepository", () =>
      cmdRefreshRepository(repoProvider, treeProvider),
    ),
    vscode.commands.registerCommand("srs.validateRepository", () =>
      cmdValidateRepository(cli, repoProvider, outputChannel, diagnosticsProvider),
    ),
    vscode.commands.registerCommand("srs.openRepositoryMap", () =>
      cmdOpenRepositoryMap(cli, repoProvider, outputChannel),
    ),
    vscode.commands.registerCommand("srs.openEntity", (node: unknown) =>
      cmdOpenEntity(repoProvider, entityProvider, node),
    ),
    vscode.commands.registerCommand("srs.openEntityDefault", (node: unknown) =>
      cmdOpenEntityDefault(repoProvider, entityProvider, node),
    ),
  );
}

async function cmdSelectRepository(
  cli: CliClient,
  repoProvider: RepositoryProvider,
): Promise<void> {
  const discovered = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "SRS: Scanning workspace for repositories…",
    },
    () => repoProvider.discoverAll(),
  );

  if (discovered.length === 0) {
    const action = "Open Settings";
    const choice = await vscode.window.showWarningMessage(
      "No SRS repositories found. Check that srs is installed and srs.cli.path is set correctly.",
      action,
    );
    if (choice === action) {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "srs.cli.path",
      );
    }
    return;
  }

  const items = discovered.map((r) => ({
    label: r.title,
    description: r.rootPath,
    detail: `${r.counts.notes} notes · ${r.counts.records} records · ${r.counts.totalInstances} total`,
    repo: r,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Select an SRS repository",
    matchOnDescription: true,
  });

  if (picked) {
    repoProvider.setActive(picked.repo);
  }
}

async function cmdRefreshRepository(
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  await repoProvider.refresh();
  treeProvider.refresh();
}

async function cmdValidateRepository(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  outputChannel: vscode.OutputChannel,
  diagnosticsProvider: DiagnosticsProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first.",
    );
    return;
  }

  outputChannel.show(true);
  outputChannel.appendLine(`\n── srs repo validate ── ${repo.rootPath}`);

  try {
    const envelope = await cli.run<RepoValidatePayload>(
      repo.rootPath,
      ["repo", "validate"],
    );

    if (envelope.ok) {
      const { summary, diagnostics } = envelope.payload;
      outputChannel.appendLine(
        `Checked: ${summary.checked}  Errors: ${summary.errors}  Warnings: ${summary.warnings}`,
      );
      if (diagnostics.length === 0) {
        outputChannel.appendLine("✓ No issues found.");
      } else {
        for (const d of diagnostics) {
          const sev = (d.severity ?? "Info").toUpperCase().padEnd(7);
          const loc = d.relative_path ? ` [${d.relative_path}]` : "";
          outputChannel.appendLine(`  ${sev}${loc}: ${d.message}`);
        }
      }
    } else {
      outputChannel.appendLine("Validation invocation failed:");
      for (const msg of envelope.diagnostics) {
        outputChannel.appendLine(`  ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    outputChannel.appendLine(`Error: ${msg}`);
    vscode.window.showErrorMessage(`SRS validation error: ${msg}`);
  }

  // Also populate the Problems panel
  await diagnosticsProvider.validate();
}

async function cmdOpenRepositoryMap(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first.",
    );
    return;
  }

  outputChannel.show(true);
  outputChannel.appendLine(`\n── srs repo map ── ${repo.rootPath}`);

  try {
    // Use run() (not runOk) so we see the full envelope including version
    const envelope = await cli.run<unknown>(repo.rootPath, ["repo", "map"], {
      pretty: true,
    });
    outputChannel.appendLine(JSON.stringify(envelope, null, 2));
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    outputChannel.appendLine(`Error: ${msg}`);
    vscode.window.showErrorMessage(`SRS: ${msg}`);
  }
}

// Kinds with a rich preview webview
const PREVIEW_KINDS = new Set(["note", "record", "container"]);
// Kinds with a form editor
const EDIT_KINDS = new Set(["note", "tag", "record"]);

async function cmdOpenEntityDefault(
  repoProvider: RepositoryProvider,
  entityProvider: EntityDocumentProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) return;
  if (PREVIEW_KINDS.has(node.entityKind)) {
    return vscode.commands.executeCommand("srs.previewEntity", node);
  }
  if (EDIT_KINDS.has(node.entityKind)) {
    return vscode.commands.executeCommand("srs.editEntity", node);
  }
  return cmdOpenEntity(repoProvider, entityProvider, node);
}

async function cmdOpenEntity(
  repoProvider: RepositoryProvider,
  entityProvider: EntityDocumentProvider,
  node: unknown,
): Promise<void> {
  if (!(node instanceof EntityNode)) {
    return;
  }

  const repo = repoProvider.active;
  if (!repo) {
    return;
  }

  try {
    const uri = entityUri(repo.repositoryId, node.entityKind, node.entityId);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.Active,
      preserveFocus: false,
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}
