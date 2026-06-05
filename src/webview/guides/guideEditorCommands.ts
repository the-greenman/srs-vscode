import * as vscode from "vscode";
import { CliClient } from "../../cli/CliClient";
import { ContainerListPayload } from "../../cli/types";
import { RepositoryProvider } from "../../repository/RepositoryProvider";
import { SrsTreeDataProvider } from "../../tree/SrsTreeDataProvider";
import { EntityEditorPanel } from "../EntityEditorPanel";
import { loadGuide } from "./guideLoader";
import { saveGuide } from "./guideSaver";
import { buildGuideForm } from "./guideForm";
import { GuideDoc } from "./guideTypes";

export function registerGuideEditorCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.editGuide", () =>
      cmdEditGuide(context, cli, repoProvider, treeProvider),
    ),
  );
}

async function cmdEditGuide(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  treeProvider: SrsTreeDataProvider,
): Promise<void> {
  const repoPath = repoProvider.active?.rootPath;
  if (!repoPath) {
    vscode.window.showWarningMessage("SRS: No repository selected.");
    return;
  }

  // Load container list and filter to guide containers
  let containers: ContainerListPayload["containers"];
  try {
    const payload = await cli.runOk<ContainerListPayload>(repoPath, ["container", "list"]);
    containers = payload.containers.filter((c) => c.containerType === "guide");
  } catch (err) {
    vscode.window.showErrorMessage(`SRS: Could not load containers — ${String(err)}`);
    return;
  }

  if (containers.length === 0) {
    vscode.window.showInformationMessage("SRS: No guide containers found in this repository.");
    return;
  }

  const picked = await vscode.window.showQuickPick(
    containers.map((c) => ({ label: c.title, description: c.containerId, id: c.containerId })),
    { placeHolder: "Select a guide to edit" },
  );
  if (!picked) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Loading guide: ${picked.label}` },
    async () => {
      let guide: GuideDoc;
      try {
        guide = await loadGuide(cli, repoPath, picked.id);
      } catch (err) {
        vscode.window.showErrorMessage(`SRS: Failed to load guide — ${String(err)}`);
        return;
      }

      const html = buildGuideForm(guide);

      EntityEditorPanel.show(
        context,
        `guide:${picked.id}`,
        guide.title,
        html,
        async (data: unknown) => {
          await saveGuide(cli, repoPath, data as GuideDoc);
          treeProvider.refresh();
          vscode.window.showInformationMessage(`SRS: Guide "${guide.title}" saved.`);
        },
      );
    },
  );
}
