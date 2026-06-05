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
exports.registerGuideEditorCommands = registerGuideEditorCommands;
const vscode = __importStar(require("vscode"));
const EntityEditorPanel_1 = require("../EntityEditorPanel");
const guideLoader_1 = require("./guideLoader");
const guideSaver_1 = require("./guideSaver");
const guideForm_1 = require("./guideForm");
function registerGuideEditorCommands(context, cli, repoProvider, treeProvider) {
    context.subscriptions.push(vscode.commands.registerCommand("srs.editGuide", () => cmdEditGuide(context, cli, repoProvider, treeProvider)));
}
async function cmdEditGuide(context, cli, repoProvider, treeProvider) {
    const repoPath = repoProvider.active?.rootPath;
    if (!repoPath) {
        vscode.window.showWarningMessage("SRS: No repository selected.");
        return;
    }
    // Load container list and filter to guide containers
    let containers;
    try {
        const payload = await cli.runOk(repoPath, ["container", "list"]);
        containers = payload.containers.filter((c) => c.containerType === "guide");
    }
    catch (err) {
        vscode.window.showErrorMessage(`SRS: Could not load containers — ${String(err)}`);
        return;
    }
    if (containers.length === 0) {
        vscode.window.showInformationMessage("SRS: No guide containers found in this repository.");
        return;
    }
    const picked = await vscode.window.showQuickPick(containers.map((c) => ({ label: c.title, description: c.containerId, id: c.containerId })), { placeHolder: "Select a guide to edit" });
    if (!picked)
        return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Loading guide: ${picked.label}` }, async () => {
        let guide;
        try {
            guide = await (0, guideLoader_1.loadGuide)(cli, repoPath, picked.id);
        }
        catch (err) {
            vscode.window.showErrorMessage(`SRS: Failed to load guide — ${String(err)}`);
            return;
        }
        const html = (0, guideForm_1.buildGuideForm)(guide);
        EntityEditorPanel_1.EntityEditorPanel.show(context, `guide:${picked.id}`, guide.title, html, async (data) => {
            await (0, guideSaver_1.saveGuide)(cli, repoPath, data);
            treeProvider.refresh();
            vscode.window.showInformationMessage(`SRS: Guide "${guide.title}" saved.`);
        });
    });
}
//# sourceMappingURL=guideEditorCommands.js.map