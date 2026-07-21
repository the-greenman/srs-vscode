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
exports.ArchiveManager = void 0;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
const workdir_1 = require("./workdir");
// Manages `.srs` (SRSzip) archives for the extension.
//
// Model is pack/unpack (ADR-033), not a live store: a `.srs` cannot be edited in
// place. openArchive() unpacks it into a managed working copy under the
// extension's global storage and makes that directory the active repository — so
// the entire rest of the extension (trees, editing, previews, diagnostics) works
// against it unchanged. saveActive() repacks the working copy back into the
// source `.srs`. A FileSystemWatcher on the working copy tracks whether it has
// diverged from the packed archive (dirty), so the UI can prompt to save.
class ArchiveManager {
    constructor(context, cli, repoProvider) {
        this.context = context;
        this.cli = cli;
        this.repoProvider = repoProvider;
        this._dirty = false;
        this._onDidChangeDirty = new vscode.EventEmitter();
        this.onDidChangeDirty = this._onDidChangeDirty.event;
        this._disposables = [this._onDidChangeDirty];
        // Stop watching / clear dirty once the user moves to a repo that isn't this
        // archive's working copy (e.g. via "SRS: Select Repository").
        this._disposables.push(repoProvider.onDidChangeActive((repo) => {
            if (this._current && repo?.rootPath !== this._current.workdir) {
                this._teardown();
            }
        }));
    }
    get isDirty() {
        return this._dirty;
    }
    get activeArchivePath() {
        return this._current?.archivePath;
    }
    // Unpack a `.srs` archive into a fresh working copy and activate it.
    async openArchive(archivePath) {
        const workdir = this._workdirFor(archivePath);
        // `archive unpack` requires a new/empty target — clear any stale working copy.
        const archivesRoot = vscode.Uri.joinPath(this.context.globalStorageUri, "archives");
        await vscode.workspace.fs.createDirectory(archivesRoot);
        await this._deleteIfExists(vscode.Uri.file(workdir));
        await this.cli.runRawOk([
            "archive",
            "unpack",
            archivePath,
            "--target",
            workdir,
        ]);
        const repo = await this.repoProvider.probe(workdir);
        if (!repo) {
            throw new CliClient_1.CliError(`Unpacked archive at ${workdir} did not load as a valid SRS repository.`, ["archive unpack produced an unloadable repository"], "archive unpack");
        }
        // Bind the working copy to its source archive before activating, so the
        // onDidChangeActive listener recognises this activation as our own.
        this._teardown();
        const watcher = this._startWatching(workdir);
        this._current = { archivePath, workdir, watcher };
        this._setDirty(false);
        this.repoProvider.setActive({ ...repo, archivePath });
    }
    // Repack the active archive-backed working copy into its source `.srs`.
    // Returns false (with a warning) if the active repo isn't archive-backed.
    async saveActive() {
        const repo = this.repoProvider.active;
        if (!repo?.archivePath) {
            vscode.window.showWarningMessage("SRS: The active repository is not opened from a .srs archive. Use 'SRS: Export Repository to .srs' instead.");
            return false;
        }
        await this.cli.runOk(repo.rootPath, [
            "archive",
            "pack",
            "--output",
            repo.archivePath,
        ]);
        this._setDirty(false);
        return true;
    }
    // Pack the active repository (any kind — directory, working copy, or .srsj) into
    // a `.srs` at a user-chosen path. Does not change the active repo or dirty state.
    async exportActive(targetPath) {
        const repo = this.repoProvider.active;
        if (!repo) {
            throw new CliClient_1.CliError("No active SRS repository to export.", ["no active repository"], "archive pack");
        }
        return this.cli.runOk(repo.rootPath, [
            "archive",
            "pack",
            "--output",
            targetPath,
        ]);
    }
    _workdirFor(archivePath) {
        return vscode.Uri.joinPath(this.context.globalStorageUri, "archives", (0, workdir_1.archiveWorkdirName)(archivePath)).fsPath;
    }
    _startWatching(workdir) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(workdir), "**/*"));
        const markDirty = () => this._setDirty(true);
        watcher.onDidChange(markDirty);
        watcher.onDidCreate(markDirty);
        watcher.onDidDelete(markDirty);
        return watcher;
    }
    _teardown() {
        this._current?.watcher.dispose();
        this._current = undefined;
        this._setDirty(false);
    }
    _setDirty(value) {
        if (this._dirty === value)
            return;
        this._dirty = value;
        this._onDidChangeDirty.fire();
    }
    async _deleteIfExists(uri) {
        try {
            await vscode.workspace.fs.delete(uri, {
                recursive: true,
                useTrash: false,
            });
        }
        catch {
            // Not present — nothing to remove.
        }
    }
    dispose() {
        this._current?.watcher.dispose();
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.ArchiveManager = ArchiveManager;
//# sourceMappingURL=ArchiveManager.js.map