"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode5 = __toESM(require("vscode"));

// src/cli/CliClient.ts
var cp = __toESM(require("child_process"));
var vscode = __toESM(require("vscode"));

// src/cli/errors.ts
var CliError = class extends Error {
  constructor(message, diagnostics, command) {
    super(message);
    this.diagnostics = diagnostics;
    this.command = command;
    this.name = "CliError";
  }
};

// src/cli/envelope.ts
function parseEnvelope(stdout, commandHint) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new CliError("srs produced no output", ["Empty stdout"], commandHint);
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new CliError(
      `srs output is not valid JSON: ${trimmed.slice(0, 200)}`,
      ["Non-JSON stdout"],
      commandHint
    );
  }
  if (typeof parsed !== "object" || parsed === null || typeof parsed["ok"] !== "boolean") {
    throw new CliError(
      "srs envelope missing 'ok' field",
      ["Malformed envelope"],
      commandHint
    );
  }
  return parsed;
}
function buildArgv(repoPath, subcommandArgs, options) {
  const args = ["--repo", repoPath, "--format", "json"];
  if (options?.pretty) {
    args.push("--pretty");
  }
  if (options?.containerId) {
    args.push("--container", options.containerId);
  }
  args.push(...subcommandArgs);
  return args;
}

// src/cli/CliClient.ts
var CliClient = class {
  constructor(outputChannel) {
    this.outputChannel = outputChannel;
  }
  get binaryPath() {
    return vscode.workspace.getConfiguration("srs").get("cli.path", "srs");
  }
  get tracing() {
    return vscode.workspace.getConfiguration("srs").get("trace.cli", false);
  }
  // Run a CLI command and return the raw envelope (ok:true or ok:false).
  async run(repoPath, subcommandArgs, options) {
    const binary = this.binaryPath;
    const args = buildArgv(repoPath, subcommandArgs, options);
    const commandHint = subcommandArgs[0] ?? "unknown";
    if (this.tracing) {
      this.outputChannel.appendLine(`[srs] ${binary} ${args.join(" ")}`);
    }
    return new Promise((resolve, reject) => {
      let proc;
      try {
        proc = cp.spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
      } catch (err) {
        reject(
          new CliError(
            `Failed to spawn srs binary '${binary}'. Check srs.cli.path in settings.`,
            [`Spawn error: ${String(err)}`],
            commandHint
          )
        );
        return;
      }
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      if (options?.stdin) {
        proc.stdin.write(options.stdin);
      }
      proc.stdin.end();
      proc.on("error", (err) => {
        if (err.code === "ENOENT") {
          reject(
            new CliError(
              `srs binary not found at '${binary}'. Install srs and set srs.cli.path in settings.`,
              [`Binary not found: ${binary}`],
              commandHint
            )
          );
        } else {
          reject(
            new CliError(
              `srs process error: ${err.message}`,
              [err.message],
              commandHint
            )
          );
        }
      });
      proc.on("close", () => {
        if (this.tracing && stdout) {
          this.outputChannel.appendLine(`[srs stdout] ${stdout.slice(0, 2e3)}`);
        }
        if (stderr) {
          this.outputChannel.appendLine(`[srs stderr] ${stderr}`);
        }
        try {
          resolve(parseEnvelope(stdout, commandHint));
        } catch (err) {
          reject(err);
        }
      });
    });
  }
  // Run and assert ok:true; throw CliError on ok:false.
  async runOk(repoPath, subcommandArgs, options) {
    const envelope = await this.run(repoPath, subcommandArgs, options);
    if (!envelope.ok) {
      throw new CliError(
        `srs ${subcommandArgs.join(" ")} failed: ${envelope.diagnostics.join("; ")}`,
        envelope.diagnostics,
        subcommandArgs[0] ?? "unknown"
      );
    }
    return envelope.payload;
  }
};

// src/repository/RepositoryProvider.ts
var vscode2 = __toESM(require("vscode"));
var RepositoryProvider = class {
  constructor(cli) {
    this.cli = cli;
    this._onDidChangeActive = new vscode2.EventEmitter();
    this.onDidChangeActive = this._onDidChangeActive.event;
  }
  get active() {
    return this._active;
  }
  // Probe one path: returns DetectedRepository if srs repo map succeeds, undefined otherwise.
  // Swallows all errors — any directory that isn't a valid SRS repo returns undefined.
  async probe(rootPath) {
    try {
      const payload = await this.cli.runOk(rootPath, ["repo", "map"]);
      return {
        rootPath,
        title: payload.repoMap.repository.title,
        repositoryId: payload.repoMap.repository.repositoryId,
        counts: payload.repoMap.counts
      };
    } catch {
      return void 0;
    }
  }
  // Scan all workspace folders concurrently; return those where probe succeeds.
  async discoverAll() {
    const folders = vscode2.workspace.workspaceFolders ?? [];
    const results = await Promise.all(
      folders.map((f) => this.probe(f.uri.fsPath))
    );
    return results.filter((r) => r !== void 0);
  }
  // Set (or clear) the active repository and broadcast the change.
  setActive(repo) {
    this._active = repo;
    vscode2.commands.executeCommand(
      "setContext",
      "srs.repositoryActive",
      repo !== void 0
    );
    this._onDidChangeActive.fire(repo);
  }
  // Re-probe the current active path and refresh its counts.
  async refresh() {
    if (!this._active) {
      return;
    }
    const updated = await this.probe(this._active.rootPath);
    if (updated) {
      this.setActive(updated);
    }
  }
  dispose() {
    this._onDidChangeActive.dispose();
  }
};

// src/tree/SrsTreeDataProvider.ts
var vscode3 = __toESM(require("vscode"));
var GroupNode = class extends vscode3.TreeItem {
  constructor(kind, label, count) {
    super(
      count > 0 ? `${label} (${count})` : label,
      vscode3.TreeItemCollapsibleState.Collapsed
    );
    this.kind = kind;
    this.contextValue = "srsGroup";
    this.tooltip = `${label} \u2014 ${count} items`;
  }
};
var EntityNode = class extends vscode3.TreeItem {
  constructor(entityId, entityKind, label, getArgs) {
    super(label, vscode3.TreeItemCollapsibleState.None);
    this.entityId = entityId;
    this.entityKind = entityKind;
    this.getArgs = getArgs;
    this.contextValue = "srsEntity";
    this.tooltip = `${entityKind}: ${entityId}`;
    this.description = entityId.slice(0, 8);
    this.command = {
      command: "srs.openEntity",
      title: "Open Entity",
      arguments: [this]
    };
  }
};
var ENTITY_SPECS = {
  note: {
    listArgs: ["note", "list"],
    extractItems: (p) => p.notes.map((n) => ({
      id: n.instanceId,
      label: n.title
    })),
    getArgs: (id) => ["note", "get", id]
  },
  tag: {
    listArgs: ["tag", "list"],
    extractItems: (p) => p.tagDefinitions.map((t) => ({
      id: t.instanceId,
      label: t.label ?? t.slug
    })),
    getArgs: (id) => ["tag", "get", id]
  },
  record: {
    listArgs: ["record", "list"],
    extractItems: (p) => p.records.map((r) => ({
      id: r.instanceId,
      label: `${r.typeNamespace}/${r.typeName}`
    })),
    getArgs: (id) => ["record", "get", id]
  },
  relation: {
    listArgs: ["relation", "list"],
    extractItems: (p) => p.relations.map((r) => ({
      id: r.relationId,
      label: `${r.relationType}: ${r.sourceInstanceId.slice(0, 8)}\u2192${r.targetInstanceId.slice(0, 8)}`
    })),
    getArgs: (id) => ["relation", "get", id]
  },
  container: {
    listArgs: ["container", "list"],
    extractItems: (p) => p.containers.map((c) => ({
      id: c.containerId,
      label: c.title
    })),
    getArgs: (id) => ["container", "get", id]
  },
  field: {
    listArgs: ["field", "list"],
    extractItems: (p) => p.fields.map((f) => ({
      id: f.id,
      label: `${f.namespace}/${f.name}`
    })),
    getArgs: (id) => ["field", "get", id]
  },
  type: {
    listArgs: ["type", "list"],
    extractItems: (p) => p.types.map((t) => ({
      id: t.id,
      label: `${t.namespace}/${t.name}`
    })),
    getArgs: (id) => ["type", "get", id]
  },
  extension: {
    listArgs: ["extension", "list"],
    extractItems: (p) => p.extensions.map((e) => ({
      id: e.instanceId,
      label: e.extensionId ?? e.instanceId
    })),
    getArgs: (id) => ["extension", "get", id]
  },
  protocol: {
    listArgs: ["protocol", "list"],
    extractItems: (p) => p.protocols.map((pr) => ({
      id: pr.instanceId,
      label: pr.title ?? pr.instanceId
    })),
    getArgs: (id) => ["protocol", "get", id]
  },
  view: {
    listArgs: ["view", "list"],
    extractItems: (p) => p.views.map((v) => ({
      id: v.id,
      label: `${v.namespace}/${v.name}`
    })),
    getArgs: (id) => ["view", "get", id]
  },
  "document-view": {
    listArgs: ["document-view", "list"],
    extractItems: (p) => p.documentViews.map((d) => ({
      id: d.id,
      label: `${d.namespace}/${d.name}`
    })),
    getArgs: (id) => ["document-view", "get", id]
  },
  "relation-type": {
    listArgs: ["relation-type", "list"],
    extractItems: (p) => p.relationTypeDefinitions.map((rt) => ({
      id: rt.id,
      label: rt.label
    })),
    getArgs: (id) => ["relation-type", "get", id]
  }
};
var GROUP_ORDER = [
  ["note", "Notes"],
  ["record", "Records"],
  ["tag", "Tags"],
  ["container", "Containers"],
  ["relation", "Relations"],
  ["type", "Types"],
  ["field", "Fields"],
  ["extension", "Extensions"],
  ["protocol", "Protocols"],
  ["view", "Views"],
  ["document-view", "Document Views"],
  ["relation-type", "Relation Types"]
];
var SrsTreeDataProvider = class {
  constructor(cli, repoProvider) {
    this.cli = cli;
    this.repoProvider = repoProvider;
    this._onDidChangeTreeData = new vscode3.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._disposables = [];
    this._disposables.push(
      repoProvider.onDidChangeActive(() => this.refresh())
    );
  }
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    return element;
  }
  async getChildren(element) {
    const repo = this.repoProvider.active;
    if (!repo) {
      return [];
    }
    if (!element) {
      return GROUP_ORDER.map(([kind, label]) => {
        const count = this.countFromRepoMap(kind, repo.counts);
        return new GroupNode(kind, label, count);
      });
    }
    if (element instanceof GroupNode) {
      return this.loadGroupChildren(element.kind, repo.rootPath);
    }
    return [];
  }
  // Extract counts for kinds that repo map tracks; 0 for others (loaded lazily on expand)
  countFromRepoMap(kind, counts) {
    if (kind === "note")
      return counts.notes;
    if (kind === "record")
      return counts.records;
    return 0;
  }
  async loadGroupChildren(kind, repoPath) {
    const spec = ENTITY_SPECS[kind];
    try {
      const payload = await this.cli.runOk(repoPath, spec.listArgs);
      const items = spec.extractItems(payload);
      return items.map(
        (item) => new EntityNode(item.id, kind, item.label, spec.getArgs(item.id))
      );
    } catch {
      return [];
    }
  }
  dispose() {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
};

// src/commands/repositoryCommands.ts
var vscode4 = __toESM(require("vscode"));
function registerRepositoryCommands(context, cli, repoProvider, treeProvider, outputChannel) {
  context.subscriptions.push(
    vscode4.commands.registerCommand(
      "srs.selectRepository",
      () => cmdSelectRepository(cli, repoProvider)
    ),
    vscode4.commands.registerCommand(
      "srs.refreshRepository",
      () => cmdRefreshRepository(repoProvider, treeProvider)
    ),
    vscode4.commands.registerCommand(
      "srs.validateRepository",
      () => cmdValidateRepository(cli, repoProvider, outputChannel)
    ),
    vscode4.commands.registerCommand(
      "srs.openRepositoryMap",
      () => cmdOpenRepositoryMap(cli, repoProvider, outputChannel)
    ),
    vscode4.commands.registerCommand(
      "srs.openEntity",
      (node) => cmdOpenEntity(cli, repoProvider, node)
    )
  );
}
async function cmdSelectRepository(cli, repoProvider) {
  const discovered = await vscode4.window.withProgress(
    {
      location: vscode4.ProgressLocation.Window,
      title: "SRS: Scanning workspace for repositories\u2026"
    },
    () => repoProvider.discoverAll()
  );
  if (discovered.length === 0) {
    const action = "Open Settings";
    const choice = await vscode4.window.showWarningMessage(
      "No SRS repositories found. Check that srs is installed and srs.cli.path is set correctly.",
      action
    );
    if (choice === action) {
      vscode4.commands.executeCommand(
        "workbench.action.openSettings",
        "srs.cli.path"
      );
    }
    return;
  }
  const items = discovered.map((r) => ({
    label: r.title,
    description: r.rootPath,
    detail: `${r.counts.notes} notes \xB7 ${r.counts.records} records \xB7 ${r.counts.totalInstances} total`,
    repo: r
  }));
  const picked = await vscode4.window.showQuickPick(items, {
    placeHolder: "Select an SRS repository",
    matchOnDescription: true
  });
  if (picked) {
    repoProvider.setActive(picked.repo);
  }
}
async function cmdRefreshRepository(repoProvider, treeProvider) {
  await repoProvider.refresh();
  treeProvider.refresh();
}
async function cmdValidateRepository(cli, repoProvider, outputChannel) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode4.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  outputChannel.show(true);
  outputChannel.appendLine(`
\u2500\u2500 srs repo validate \u2500\u2500 ${repo.rootPath}`);
  try {
    const envelope = await cli.run(
      repo.rootPath,
      ["repo", "validate"]
    );
    if (envelope.ok) {
      const { summary, diagnostics } = envelope.payload;
      outputChannel.appendLine(
        `Checked: ${summary.checked}  Errors: ${summary.errors}  Warnings: ${summary.warnings}`
      );
      if (diagnostics.length === 0) {
        outputChannel.appendLine("\u2713 No issues found.");
      } else {
        for (const d of diagnostics) {
          const sev = (d.severity ?? "info").toUpperCase().padEnd(7);
          const loc = d.relativePath ? ` [${d.relativePath}]` : "";
          const id = d.instanceId ? ` (${d.instanceId})` : "";
          outputChannel.appendLine(`  ${sev}${loc}${id}: ${d.message}`);
        }
      }
    } else {
      outputChannel.appendLine("Validation invocation failed:");
      for (const msg of envelope.diagnostics) {
        outputChannel.appendLine(`  ${msg}`);
      }
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    outputChannel.appendLine(`Error: ${msg}`);
    vscode4.window.showErrorMessage(`SRS validation error: ${msg}`);
  }
}
async function cmdOpenRepositoryMap(cli, repoProvider, outputChannel) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode4.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  outputChannel.show(true);
  outputChannel.appendLine(`
\u2500\u2500 srs repo map \u2500\u2500 ${repo.rootPath}`);
  try {
    const envelope = await cli.run(repo.rootPath, ["repo", "map"], {
      pretty: true
    });
    outputChannel.appendLine(JSON.stringify(envelope, null, 2));
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    outputChannel.appendLine(`Error: ${msg}`);
    vscode4.window.showErrorMessage(`SRS: ${msg}`);
  }
}
async function cmdOpenEntity(cli, repoProvider, node) {
  if (!(node instanceof EntityNode)) {
    return;
  }
  const repo = repoProvider.active;
  if (!repo) {
    return;
  }
  try {
    const payload = await cli.runOk(repo.rootPath, node.getArgs, {
      pretty: true
    });
    const content = JSON.stringify(payload, null, 2);
    const doc = await vscode4.workspace.openTextDocument({
      content,
      language: "json"
    });
    await vscode4.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode4.ViewColumn.Beside
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode4.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}

// src/extension.ts
async function activate(context) {
  const outputChannel = vscode5.window.createOutputChannel("SRS");
  context.subscriptions.push(outputChannel);
  const cli = new CliClient(outputChannel);
  const repoProvider = new RepositoryProvider(cli);
  const treeProvider = new SrsTreeDataProvider(cli, repoProvider);
  context.subscriptions.push(repoProvider, treeProvider);
  const treeView = vscode5.window.createTreeView("srsRepositoryTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);
  repoProvider.onDidChangeActive((repo) => {
    treeView.title = repo ? `SRS: ${repo.title}` : "SRS Repository";
  });
  registerRepositoryCommands(
    context,
    cli,
    repoProvider,
    treeProvider,
    outputChannel
  );
  await autoDetectRepository(cli, repoProvider);
}
async function autoDetectRepository(cli, repoProvider) {
  const config = vscode5.workspace.getConfiguration("srs");
  const configuredPath = config.get("repository.path", null);
  if (configuredPath) {
    const repo = await repoProvider.probe(configuredPath);
    if (repo) {
      repoProvider.setActive(repo);
    } else {
      const action = "Open Settings";
      const choice = await vscode5.window.showWarningMessage(
        `SRS: Configured path '${configuredPath}' is not a valid SRS repository.`,
        action
      );
      if (choice === action) {
        vscode5.commands.executeCommand(
          "workbench.action.openSettings",
          "srs.repository.path"
        );
      }
    }
    return;
  }
  const discovered = await repoProvider.discoverAll();
  if (discovered.length === 1) {
    repoProvider.setActive(discovered[0]);
  } else if (discovered.length > 1) {
    vscode5.window.showInformationMessage(
      `SRS: Found ${discovered.length} repositories in workspace. Use 'SRS: Select Repository' to choose one.`
    );
  }
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
