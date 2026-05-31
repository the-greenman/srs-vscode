"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerContainerCommands = registerContainerCommands;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
function registerContainerCommands(context, cli, repoProvider, attention, treeProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.setActiveContainer", () => cmdSetActiveContainer(cli, repoProvider, attention)), vscode.commands.registerCommand("srs.clearActiveContainer", () => cmdClearActiveContainer(attention, treeProvider)), vscode.commands.registerCommand("srs.createContainer", () => cmdCreateContainer(cli, repoProvider, attention, treeProvider)));
}
async function cmdSetActiveContainer(cli, repoProvider, attention) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
        return;
    }
    let containers;
    try {
        const payload = await cli.runOk(repo.rootPath, [
            "container",
            "list",
        ]);
        containers = payload.containers;
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
        return;
    }
    if (containers.length === 0) {
        const action = "Create Container";
        const choice = await vscode.window.showInformationMessage("SRS: No containers found in the active repository.", action);
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
        container: null,
    };
    const picked = await vscode.window.showQuickPick([CLEAR_ITEM, ...items], { placeHolder: "Select a container to set as active" });
    if (!picked) {
        return;
    }
    if (picked.container === null) {
        await attention.clear();
        return;
    }
    try {
        await attention.set({ containerId: picked.container.containerId, title: picked.container.title }, repo.rootPath);
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to set active container: ${msg}`);
    }
}
async function cmdClearActiveContainer(attention, treeProvider) {
    await attention.clear();
    treeProvider.refresh();
}
async function cmdCreateContainer(cli, repoProvider, attention, treeProvider) {
    const repo = repoProvider.active;
    if (!repo) {
        vscode.window.showWarningMessage("SRS: No active repository. Run 'SRS: Select Repository' first.");
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
    const { randomUUID } = await Promise.resolve().then(() => __importStar(require("crypto")));
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
        await cli.runOk(repo.rootPath, ["container", "create"], {
            stdin: containerJson,
        });
        treeProvider.refresh();
        const setActive = "Set as Active";
        const choice = await vscode.window.showInformationMessage(`SRS: Container '${title}' created.`, setActive);
        if (choice === setActive) {
            await attention.set({ containerId, title: title.trim() }, repo.rootPath);
        }
    }
    catch (err) {
        const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: Failed to create container: ${msg}`);
    }
}
//# sourceMappingURL=containerCommands.js.map