"use strict";
// Minimal vscode API stub for running unit tests outside the extension host.
// Only covers the surface used by the files under test.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewColumn = exports.ProgressLocation = exports.EventEmitter = exports.commands = exports.window = exports.workspace = exports.TreeItem = exports.TreeItemCollapsibleState = void 0;
exports.getRegisteredCommand = getRegisteredCommand;
var TreeItemCollapsibleState;
(function (TreeItemCollapsibleState) {
    TreeItemCollapsibleState[TreeItemCollapsibleState["None"] = 0] = "None";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Collapsed"] = 1] = "Collapsed";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Expanded"] = 2] = "Expanded";
})(TreeItemCollapsibleState || (exports.TreeItemCollapsibleState = TreeItemCollapsibleState = {}));
class TreeItem {
    constructor(label, collapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}
exports.TreeItem = TreeItem;
// Stub for anything else the code imports from vscode that isn't needed in tests
exports.workspace = {
    getConfiguration: () => ({
        get: (_key, defaultValue) => defaultValue,
    }),
    workspaceFolders: [],
    // Used by openMarkdownPreview — return a doc-like object with a uri.
    openTextDocument: (_opts) => Promise.resolve({ uri: { toString: () => "untitled:preview" } }),
};
exports.window = {
    createOutputChannel: () => ({ appendLine: () => { } }),
    showErrorMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
    lastQuickPick: undefined,
    quickPickIndex: 0,
    showQuickPick(items, options) {
        exports.window.lastQuickPick = { items, options };
        return Promise.resolve(items[exports.window.quickPickIndex]);
    },
    lastWebviewPanel: undefined,
    createWebviewPanel(_viewType, _title, _showOptions, _options) {
        const capture = { html: "", postedMessages: [], disposed: false };
        exports.window.lastWebviewPanel = capture;
        return {
            title: _title,
            reveal: () => { },
            dispose: () => {
                capture.disposed = true;
            },
            onDidDispose: (_cb) => ({ dispose: () => { } }),
            webview: {
                get html() {
                    return capture.html;
                },
                set html(value) {
                    capture.html = value;
                },
                onDidReceiveMessage(handler) {
                    capture.messageHandler = handler;
                    return { dispose: () => { } };
                },
                postMessage(msg) {
                    capture.postedMessages.push(msg);
                    return Promise.resolve(true);
                },
            },
        };
    },
};
// Command registry so tests can invoke a registered command callback directly.
const _commandRegistry = {};
function getRegisteredCommand(id) {
    return _commandRegistry[id];
}
exports.commands = {
    executeCommand: () => Promise.resolve(undefined),
    registerCommand: (id, cb) => {
        _commandRegistry[id] = cb;
        return { dispose: () => { } };
    },
};
class EventEmitter {
    constructor() {
        this.event = (_listener) => ({ dispose: () => { } });
    }
    fire(_event) { }
    dispose() { }
}
exports.EventEmitter = EventEmitter;
var ProgressLocation;
(function (ProgressLocation) {
    ProgressLocation[ProgressLocation["Window"] = 10] = "Window";
})(ProgressLocation || (exports.ProgressLocation = ProgressLocation = {}));
var ViewColumn;
(function (ViewColumn) {
    ViewColumn[ViewColumn["Beside"] = -2] = "Beside";
    ViewColumn[ViewColumn["Active"] = -1] = "Active";
})(ViewColumn || (exports.ViewColumn = ViewColumn = {}));
//# sourceMappingURL=vscode-mock.js.map