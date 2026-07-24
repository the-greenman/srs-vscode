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
  // Used by openMarkdownPreview — return a doc-like object with a uri.
  openTextDocument: (_opts: unknown) =>
    Promise.resolve({ uri: { toString: () => "untitled:preview" } }),
};

// Test-controllable QuickPick: record the last invocation and return the item at
// `quickPickIndex` (default 0). Tests read `window.lastQuickPick` to assert item shape.
interface QuickPickCapture {
  items: Array<Record<string, unknown>>;
  options: unknown;
}

// Test-controllable WebviewPanel: captures the rendered html and the message
// handler so tests can simulate a 'save'/'cancel' message from the webview.
interface WebviewPanelCapture {
  html: string;
  postedMessages: unknown[];
  messageHandler?: (msg: { type: string; data?: unknown }) => unknown;
  disposed: boolean;
}

export const window = {
  createOutputChannel: () => ({ appendLine: () => {} }),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve(undefined),
  lastQuickPick: undefined as QuickPickCapture | undefined,
  quickPickIndex: 0,
  showQuickPick(items: Array<Record<string, unknown>>, options?: unknown) {
    window.lastQuickPick = { items, options };
    return Promise.resolve(items[window.quickPickIndex]);
  },
  lastWebviewPanel: undefined as WebviewPanelCapture | undefined,
  createWebviewPanel(
    _viewType: string,
    _title: string,
    _showOptions: unknown,
    _options: unknown,
  ) {
    const capture: WebviewPanelCapture = { html: "", postedMessages: [], disposed: false };
    window.lastWebviewPanel = capture;
    return {
      title: _title,
      reveal: () => {},
      dispose: () => {
        capture.disposed = true;
      },
      onDidDispose: (_cb: () => void) => ({ dispose: () => {} }),
      webview: {
        get html() {
          return capture.html;
        },
        set html(value: string) {
          capture.html = value;
        },
        onDidReceiveMessage(handler: (msg: { type: string; data?: unknown }) => unknown) {
          capture.messageHandler = handler;
          return { dispose: () => {} };
        },
        postMessage(msg: unknown) {
          capture.postedMessages.push(msg);
          return Promise.resolve(true);
        },
      },
    };
  },
};

// Command registry so tests can invoke a registered command callback directly.
const _commandRegistry: Record<string, (...args: unknown[]) => unknown> = {};
export function getRegisteredCommand(
  id: string,
): ((...args: unknown[]) => unknown) | undefined {
  return _commandRegistry[id];
}

export const commands = {
  executeCommand: () => Promise.resolve(undefined),
  registerCommand: (id: string, cb: (...args: unknown[]) => unknown) => {
    _commandRegistry[id] = cb;
    return { dispose: () => {} };
  },
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
  Active = -1,
}
