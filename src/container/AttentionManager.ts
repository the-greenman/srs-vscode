import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";

const STORAGE_KEY = "srs.activeContainer";

export interface ActiveContainer {
  containerId: string;
  title: string;
}

export class AttentionManager implements vscode.Disposable {
  private _active: ActiveContainer | undefined;

  private readonly _onDidChange =
    new vscode.EventEmitter<ActiveContainer | undefined>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly cli: CliClient,
  ) {}

  get active(): ActiveContainer | undefined {
    return this._active;
  }

  // Load persisted container from workspaceState and verify it still exists.
  // Call once on activation after the active repository is known.
  async restore(repoPath: string): Promise<void> {
    const stored = this.workspaceState.get<ActiveContainer>(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      await this.cli.runOk<unknown>(repoPath, ["container", "get", stored.containerId]);
      this._active = stored;
      this._onDidChange.fire(this._active);
    } catch {
      // Container no longer exists — clear silently
      await this.workspaceState.update(STORAGE_KEY, undefined);
    }
  }

  async set(container: ActiveContainer, repoPath: string): Promise<void> {
    // Verify the container exists before storing
    await this.cli.runOk<unknown>(repoPath, [
      "container",
      "get",
      container.containerId,
    ]);
    this._active = container;
    await this.workspaceState.update(STORAGE_KEY, container);
    this._onDidChange.fire(this._active);
  }

  async clear(): Promise<void> {
    this._active = undefined;
    await this.workspaceState.update(STORAGE_KEY, undefined);
    this._onDidChange.fire(undefined);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
