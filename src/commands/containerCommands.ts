import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { AttentionManager, ActiveContainer } from "../container/AttentionManager";
import { SrsTreeDataProvider } from "../tree/SrsTreeDataProvider";
import type { ContainerListPayload } from "../cli/types";

export function registerContainerCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.setActiveContainer", () =>
      cmdSetActiveContainer(cli, repoProvider, attention),
    ),
    vscode.commands.registerCommand("srs.clearActiveContainer", () =>
      cmdClearActiveContainer(attention, treeProvider),
    ),
    vscode.commands.registerCommand("srs.createContainer", () =>
      cmdCreateContainer(cli, repoProvider, attention, treeProvider),
    ),
  );
}

async function cmdSetActiveContainer(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first.",
    );
    return;
  }

  let containers: ContainerListPayload["containers"];
  try {
    const payload = await cli.runOk<ContainerListPayload>(repo.rootPath, [
      "container",
      "list",
    ]);
    containers = payload.containers;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
    return;
  }

  if (containers.length === 0) {
    const action = "Create Container";
    const choice = await vscode.window.showInformationMessage(
      "SRS: No containers found in the active repository.",
      action,
    );
    if (choice === action) {
      vscode.commands.executeCommand("srs.createContainer");
    }
    return;
  }

  const items = containers.map((c) => ({
    label: c.title,
    description: c.containerType,
    detail: c.containerId,
    container: c,
  }));

  // Prepend a "clear" option
  const CLEAR_ITEM = {
    label: "$(circle-slash) Clear active container",
    description: "",
    detail: "",
    container: null as null,
  };

  const picked = await vscode.window.showQuickPick(
    [CLEAR_ITEM, ...items],
    { placeHolder: "Select a container to set as active" },
  );

  if (!picked) {
    return;
  }

  if (picked.container === null) {
    await attention.clear();
    return;
  }

  try {
    await attention.set(
      { containerId: picked.container.containerId, title: picked.container.title },
      repo.rootPath,
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to set active container: ${msg}`);
  }
}

async function cmdClearActiveContainer(
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  await attention.clear();
  treeProvider.refresh();
}

async function cmdCreateContainer(
  cli: CliClient,
  repoProvider: RepositoryProvider,
  attention: AttentionManager,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo) {
    vscode.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first.",
    );
    return;
  }

  const title = await vscode.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container title",
    placeHolder: "e.g. Sprint 42",
    validateInput: (v) => (v.trim() ? undefined : "Title is required"),
  });
  if (!title) {
    return;
  }

  const containerType = await vscode.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container type (optional)",
    placeHolder: "e.g. sprint, milestone, epic",
  });

  const { randomUUID } = await import("crypto");
  const containerId = randomUUID();
  const now = new Date().toISOString();

  const containerJson = JSON.stringify({
    containerId,
    title: title.trim(),
    containerType: containerType?.trim() || undefined,
    memberInstanceIds: [],
    rootInstanceIds: [],
    createdAt: now,
  });

  try {
    await cli.runOk<unknown>(repo.rootPath, ["container", "create"], {
      stdin: containerJson,
    });
    treeProvider.refresh();

    const setActive = "Set as Active";
    const choice = await vscode.window.showInformationMessage(
      `SRS: Container '${title}' created.`,
      setActive,
    );
    if (choice === setActive) {
      await attention.set({ containerId, title: title.trim() }, repo.rootPath);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Failed to create container: ${msg}`);
  }
}
