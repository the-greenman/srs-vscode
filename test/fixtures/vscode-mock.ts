// Minimal vscode API stub for running unit tests outside the extension host.
// Only covers the surface used by the files under test.

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  collapsibleState?: TreeItemCollapsibleState;

  constructor(
    label: string,
    collapsibleState?: TreeItemCollapsibleState,
  ) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

// Stub for anything else the code imports from vscode that isn't needed in tests
export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultValue: unknown) => defaultValue,
  }),
  workspaceFolders: [],
};

export const window = {
  createOutputChannel: () => ({ appendLine: () => {} }),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
};

export const commands = {
  executeCommand: () => Promise.resolve(undefined),
  registerCommand: () => ({ dispose: () => {} }),
};

export class EventEmitter<T> {
  event = (_listener: (e: T) => unknown) => ({ dispose: () => {} });
  fire(_event: T): void {}
  dispose(): void {}
}

export enum ProgressLocation {
  Window = 10,
}

export enum ViewColumn {
  Beside = -2,
}
