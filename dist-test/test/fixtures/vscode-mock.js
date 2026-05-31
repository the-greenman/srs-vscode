"use strict";
// Minimal vscode API stub for running unit tests outside the extension host.
// Only covers the surface used by the files under test.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewColumn = exports.ProgressLocation = exports.EventEmitter = exports.commands = exports.window = exports.workspace = exports.TreeItem = exports.TreeItemCollapsibleState = void 0;
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
};
exports.window = {
    createOutputChannel: () => ({ appendLine: () => { } }),
    showErrorMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
};
exports.commands = {
    executeCommand: () => Promise.resolve(undefined),
    registerCommand: () => ({ dispose: () => { } }),
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
})(ViewColumn || (exports.ViewColumn = ViewColumn = {}));
//# sourceMappingURL=vscode-mock.js.map