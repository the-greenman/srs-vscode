import * as vscode from "vscode";
import { NavigatorTreeDataProvider } from "../tree/NavigatorTreeDataProvider";
import type { NavigatorMode } from "../tree/NavigatorTreeDataProvider";

export function registerNavigatorCommands(
  context: vscode.ExtensionContext,
  navigator: NavigatorTreeDataProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.navigatorRelations", () =>
      setMode(navigator, "relations"),
    ),
    vscode.commands.registerCommand("srs.navigatorDocumentViews", () =>
      setMode(navigator, "document-views"),
    ),
    vscode.commands.registerCommand("srs.navigatorContainers", () =>
      setMode(navigator, "containers"),
    ),
    vscode.commands.registerCommand("srs.navigatorRefresh", () =>
      navigator.refresh(),
    ),
  );
}

function setMode(navigator: NavigatorTreeDataProvider, mode: NavigatorMode): void {
  navigator.setMode(mode);
  // Update the context key so view/title button states can react
  vscode.commands.executeCommand("setContext", "srs.navigatorMode", mode);
}
