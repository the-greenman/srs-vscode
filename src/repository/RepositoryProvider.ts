import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";
import type { RepoMapPayload } from "../cli/types";

export interface DetectedRepository {
  rootPath: string;
  title: string;
  repositoryId: string;
  counts: RepoMapPayload["repoMap"]["counts"];
}

export class RepositoryProvider implements vscode.Disposable {
  private _active: DetectedRepository | undefined;

  private readonly _onDidChangeActive =
    new vscode.EventEmitter<DetectedRepository | undefined>();
  readonly onDidChangeActive = this._onDidChangeActive.event;

  constructor(private readonly cli: CliClient) {}

  get active(): DetectedRepository | undefined {
    return this._active;
  }

  // Probe one path: returns DetectedRepository if srs repo map succeeds, undefined otherwise.
  // Swallows all errors — any directory that isn't a valid SRS repo returns undefined.
  async probe(rootPath: string): Promise<DetectedRepository | undefined> {
    try {
      const payload = await this.cli.runOk<RepoMapPayload>(rootPath, ["repo", "map"]);
      return {
        rootPath,
        title: payload.repoMap.repository.title ?? payload.repoMap.repository.repositoryId,
        repositoryId: payload.repoMap.repository.repositoryId,
        counts: payload.repoMap.counts,
      };
    } catch {
      return undefined;
    }
  }

  // Scan all workspace folders concurrently; return those where probe succeeds.
  async discoverAll(): Promise<DetectedRepository[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const results = await Promise.all(
      folders.map((f) => this.probe(f.uri.fsPath)),
    );
    return results.filter((r): r is DetectedRepository => r !== undefined);
  }

  // Set (or clear) the active repository and broadcast the change.
  setActive(repo: DetectedRepository | undefined): void {
    this._active = repo;
    vscode.commands.executeCommand(
      "setContext",
      "srs.repositoryActive",
      repo !== undefined,
    );
    this._onDidChangeActive.fire(repo);
  }

  // Re-probe the current active path and refresh its counts.
  async refresh(): Promise<void> {
    if (!this._active) {
      return;
    }
    const updated = await this.probe(this._active.rootPath);
    if (updated) {
      this.setActive(updated);
    }
  }

  dispose(): void {
    this._onDidChangeActive.dispose();
  }
}
