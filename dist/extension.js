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
var vscode11 = __toESM(require("vscode"));

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
  constructor(cli, repoProvider, attention) {
    this.cli = cli;
    this.repoProvider = repoProvider;
    this.attention = attention;
    this._onDidChangeTreeData = new vscode3.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._disposables = [];
    this._disposables.push(
      repoProvider.onDidChangeActive(() => this.refresh())
    );
    if (attention) {
      this._disposables.push(attention.onDidChange(() => this.refresh()));
    }
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
    const containerId2 = this.attention?.active?.containerId;
    try {
      const payload = await this.cli.runOk(repoPath, spec.listArgs, {
        containerId: containerId2
      });
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

// src/container/AttentionManager.ts
var vscode4 = __toESM(require("vscode"));
var STORAGE_KEY = "srs.activeContainer";
var AttentionManager = class {
  constructor(workspaceState, cli) {
    this.workspaceState = workspaceState;
    this.cli = cli;
    this._onDidChange = new vscode4.EventEmitter();
    this.onDidChange = this._onDidChange.event;
  }
  get active() {
    return this._active;
  }
  // Load persisted container from workspaceState and verify it still exists.
  // Call once on activation after the active repository is known.
  async restore(repoPath) {
    const stored = this.workspaceState.get(STORAGE_KEY);
    if (!stored) {
      return;
    }
    try {
      await this.cli.runOk(repoPath, ["container", "get", stored.containerId]);
      this._active = stored;
      this._onDidChange.fire(this._active);
    } catch {
      await this.workspaceState.update(STORAGE_KEY, void 0);
    }
  }
  async set(container, repoPath) {
    await this.cli.runOk(repoPath, [
      "container",
      "get",
      container.containerId
    ]);
    this._active = container;
    await this.workspaceState.update(STORAGE_KEY, container);
    this._onDidChange.fire(this._active);
  }
  async clear() {
    this._active = void 0;
    await this.workspaceState.update(STORAGE_KEY, void 0);
    this._onDidChange.fire(void 0);
  }
  dispose() {
    this._onDidChange.dispose();
  }
};

// src/container/ContainerStatusBarItem.ts
var vscode5 = __toESM(require("vscode"));
var ContainerStatusBarItem = class {
  constructor(attention) {
    this.attention = attention;
    this._disposables = [];
    this._item = vscode5.window.createStatusBarItem(
      vscode5.StatusBarAlignment.Left,
      100
    );
    this._item.command = "srs.setActiveContainer";
    this._item.tooltip = "SRS: Click to set active container";
    this._disposables.push(this._item);
    this._disposables.push(
      attention.onDidChange(() => this._update())
    );
    this._update();
  }
  show() {
    this._item.show();
  }
  hide() {
    this._item.hide();
  }
  _update() {
    const active = this.attention.active;
    if (active) {
      this._item.text = `$(package) ${active.title}`;
      this._item.tooltip = `SRS Container: ${active.title}
Click to change`;
    } else {
      this._item.text = `$(package) No container`;
      this._item.tooltip = "SRS: No active container. Click to set one.";
    }
  }
  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
};

// src/schema/SchemaProvider.ts
var vscode6 = __toESM(require("vscode"));
var SCHEMA_ASSOCIATIONS = [
  { glob: "**/manifest.json", schema: "schemas/2.0/manifest.json" },
  { glob: "**/records/*.json", schema: "schemas/2.0/record.json" },
  { glob: "**/records/*.srsj", schema: "schemas/2.0/record.json" },
  { glob: "**/notes/*.json", schema: "schemas/2.0/note.json" },
  { glob: "**/notes/*.srsj", schema: "schemas/2.0/note.json" },
  { glob: "**/typed-records/*.json", schema: "schemas/2.0/typed-record.json" },
  { glob: "**/package/fields/*.json", schema: "schemas/2.0/field.json" },
  { glob: "**/package/types/*.json", schema: "schemas/2.0/type.json" },
  { glob: "**/package/views/*.json", schema: "schemas/2.0/view.json" },
  { glob: "**/package/document-views/*.json", schema: "schemas/2.0/document-view.json" },
  { glob: "**/package/package.json", schema: "schemas/2.0/package-manifest.json" },
  { glob: "**/relations/relations.json", schema: "schemas/2.0/relations-collection.json" },
  { glob: "**/containers/*.json", schema: "schemas/2.0/container.json" },
  { glob: "**/*.meta.json", schema: "schemas/2.0/source-document-meta.json" }
];
var SchemaProvider = class {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this._disposables = [];
    this._register();
  }
  _register() {
    const jsonConfig = vscode6.workspace.getConfiguration("json");
    const existing = jsonConfig.get("schemas") ?? [];
    const toAdd = SCHEMA_ASSOCIATIONS.filter(
      (assoc) => !existing.some((e) => e.fileMatch.includes(assoc.glob))
    ).map((assoc) => ({
      fileMatch: [assoc.glob],
      url: vscode6.Uri.joinPath(this.extensionUri, assoc.schema).toString()
    }));
    if (toAdd.length === 0)
      return;
    jsonConfig.update(
      "schemas",
      [...existing, ...toAdd],
      vscode6.ConfigurationTarget.Workspace
    );
  }
  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
};

// src/provider/EntityDocumentProvider.ts
var vscode7 = __toESM(require("vscode"));
var ENTITY_SCHEME = "srs-entity";
function entityUri(repositoryId, kind, entityId) {
  return vscode7.Uri.from({
    scheme: ENTITY_SCHEME,
    authority: repositoryId,
    path: `/${kind}/${entityId}`
  });
}
function parseEntityUri(uri) {
  const parts = uri.path.replace(/^\//, "").split("/");
  return {
    repositoryId: uri.authority,
    kind: parts[0] ?? "",
    entityId: parts[1] ?? ""
  };
}
var EntityDocumentProvider = class {
  constructor(cli, repoProvider) {
    this.cli = cli;
    this.repoProvider = repoProvider;
    this._onDidChange = new vscode7.EventEmitter();
    this.onDidChangeEmitter = this._onDidChange;
    this.onDidChange = this._onDidChange.event;
  }
  async provideTextDocumentContent(uri) {
    const { kind, entityId } = parseEntityUri(uri);
    const repo = this.repoProvider.active;
    if (!repo) {
      return JSON.stringify({ error: "No active SRS repository" }, null, 2);
    }
    const getArgs = getArgsFor(kind, entityId);
    if (!getArgs) {
      return JSON.stringify({ error: `Unknown entity kind: ${kind}` }, null, 2);
    }
    try {
      const payload = await this.cli.runOk(repo.rootPath, getArgs, {
        pretty: true
      });
      return JSON.stringify(payload, null, 2);
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      return JSON.stringify({ error: msg }, null, 2);
    }
  }
  // Call this to force a refresh of an already-open entity document.
  refresh(uri) {
    this._onDidChange.fire(uri);
  }
  dispose() {
    this._onDidChange.dispose();
  }
};
function getArgsFor(kind, entityId) {
  switch (kind) {
    case "note":
      return ["note", "get", "--id", entityId];
    case "tag":
      return ["tag", "get", "--id", entityId];
    case "record":
      return ["record", "get", "--id", entityId];
    case "relation":
      return ["relation", "get", "--id", entityId];
    case "container":
      return ["container", "get", "--id", entityId];
    case "field":
      return ["field", "get", "--id", entityId];
    case "type":
      return ["type", "get", "--id", entityId];
    case "extension":
      return ["extension", "get", "--id", entityId];
    case "protocol":
      return ["protocol", "get", "--id", entityId];
    case "view":
      return ["view", "get", "--id", entityId];
    case "document-view":
      return ["document-view", "get", "--id", entityId];
    case "relation-type":
      return ["relation-type", "get", "--id", entityId];
    default:
      return void 0;
  }
}

// src/commands/repositoryCommands.ts
var vscode8 = __toESM(require("vscode"));
function registerRepositoryCommands(context, cli, repoProvider, treeProvider, outputChannel, entityProvider) {
  context.subscriptions.push(
    vscode8.commands.registerCommand(
      "srs.selectRepository",
      () => cmdSelectRepository(cli, repoProvider)
    ),
    vscode8.commands.registerCommand(
      "srs.refreshRepository",
      () => cmdRefreshRepository(repoProvider, treeProvider)
    ),
    vscode8.commands.registerCommand(
      "srs.validateRepository",
      () => cmdValidateRepository(cli, repoProvider, outputChannel)
    ),
    vscode8.commands.registerCommand(
      "srs.openRepositoryMap",
      () => cmdOpenRepositoryMap(cli, repoProvider, outputChannel)
    ),
    vscode8.commands.registerCommand(
      "srs.openEntity",
      (node) => cmdOpenEntity(repoProvider, entityProvider, node)
    )
  );
}
async function cmdSelectRepository(cli, repoProvider) {
  const discovered = await vscode8.window.withProgress(
    {
      location: vscode8.ProgressLocation.Window,
      title: "SRS: Scanning workspace for repositories\u2026"
    },
    () => repoProvider.discoverAll()
  );
  if (discovered.length === 0) {
    const action = "Open Settings";
    const choice = await vscode8.window.showWarningMessage(
      "No SRS repositories found. Check that srs is installed and srs.cli.path is set correctly.",
      action
    );
    if (choice === action) {
      vscode8.commands.executeCommand(
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
  const picked = await vscode8.window.showQuickPick(items, {
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
    vscode8.window.showWarningMessage(
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
    vscode8.window.showErrorMessage(`SRS validation error: ${msg}`);
  }
}
async function cmdOpenRepositoryMap(cli, repoProvider, outputChannel) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode8.window.showWarningMessage(
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
    vscode8.window.showErrorMessage(`SRS: ${msg}`);
  }
}
async function cmdOpenEntity(repoProvider, entityProvider, node) {
  if (!(node instanceof EntityNode)) {
    return;
  }
  const repo = repoProvider.active;
  if (!repo) {
    return;
  }
  try {
    const uri = entityUri(repo.repositoryId, node.entityKind, node.entityId);
    const doc = await vscode8.workspace.openTextDocument(uri);
    await vscode8.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode8.ViewColumn.Beside,
      preserveFocus: false
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode8.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}

// src/commands/containerCommands.ts
var vscode9 = __toESM(require("vscode"));
function registerContainerCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode9.commands.registerCommand(
      "srs.setActiveContainer",
      () => cmdSetActiveContainer(cli, repoProvider, attention)
    ),
    vscode9.commands.registerCommand(
      "srs.clearActiveContainer",
      () => cmdClearActiveContainer(attention, treeProvider)
    ),
    vscode9.commands.registerCommand(
      "srs.createContainer",
      () => cmdCreateContainer(cli, repoProvider, attention, treeProvider)
    )
  );
}
async function cmdSetActiveContainer(cli, repoProvider, attention) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode9.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  let containers;
  try {
    const payload = await cli.runOk(repo.rootPath, [
      "container",
      "list"
    ]);
    containers = payload.containers;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode9.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
    return;
  }
  if (containers.length === 0) {
    const action = "Create Container";
    const choice = await vscode9.window.showInformationMessage(
      "SRS: No containers found in the active repository.",
      action
    );
    if (choice === action) {
      vscode9.commands.executeCommand("srs.createContainer");
    }
    return;
  }
  const items = containers.map((c) => ({
    label: c.title,
    description: c.containerType,
    detail: c.containerId,
    container: c
  }));
  const CLEAR_ITEM = {
    label: "$(circle-slash) Clear active container",
    description: "",
    detail: "",
    container: null
  };
  const picked = await vscode9.window.showQuickPick(
    [CLEAR_ITEM, ...items],
    { placeHolder: "Select a container to set as active" }
  );
  if (!picked) {
    return;
  }
  if (picked.container === null) {
    await attention.clear();
    return;
  }
  try {
    await attention.set(
      { containerId: picked.container.containerId, title: picked.container.title },
      repo.rootPath
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode9.window.showErrorMessage(`SRS: Failed to set active container: ${msg}`);
  }
}
async function cmdClearActiveContainer(attention, treeProvider) {
  await attention.clear();
  treeProvider.refresh();
}
async function cmdCreateContainer(cli, repoProvider, attention, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode9.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  const title = await vscode9.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container title",
    placeHolder: "e.g. Sprint 42",
    validateInput: (v) => v.trim() ? void 0 : "Title is required"
  });
  if (!title) {
    return;
  }
  const containerType = await vscode9.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container type (optional)",
    placeHolder: "e.g. sprint, milestone, epic"
  });
  const { randomUUID } = await import("crypto");
  const containerId2 = randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const containerJson = JSON.stringify({
    containerId: containerId2,
    title: title.trim(),
    containerType: containerType?.trim() || void 0,
    memberInstanceIds: [],
    rootInstanceIds: [],
    createdAt: now
  });
  try {
    await cli.runOk(repo.rootPath, ["container", "create"], {
      stdin: containerJson
    });
    treeProvider.refresh();
    const setActive = "Set as Active";
    const choice = await vscode9.window.showInformationMessage(
      `SRS: Container '${title}' created.`,
      setActive
    );
    if (choice === setActive) {
      await attention.set({ containerId: containerId2, title: title.trim() }, repo.rootPath);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode9.window.showErrorMessage(`SRS: Failed to create container: ${msg}`);
  }
}

// src/commands/mutationCommands.ts
var vscode10 = __toESM(require("vscode"));
function registerMutationCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode10.commands.registerCommand(
      "srs.createNote",
      () => cmdCreateNote(cli, repoProvider, attention, treeProvider)
    ),
    vscode10.commands.registerCommand(
      "srs.createTag",
      () => cmdCreateTag(cli, repoProvider, treeProvider)
    ),
    vscode10.commands.registerCommand(
      "srs.createRecord",
      () => cmdCreateRecord(cli, repoProvider, attention, treeProvider)
    ),
    vscode10.commands.registerCommand(
      "srs.deleteEntity",
      (node) => cmdDeleteEntity(cli, repoProvider, treeProvider, node)
    )
  );
}
function requireActiveRepo(repoProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode10.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return void 0;
  }
  return repo;
}
function containerId(attention) {
  return attention.active?.containerId;
}
async function cmdCreateNote(cli, repoProvider, attention, treeProvider) {
  const repo = requireActiveRepo(repoProvider);
  if (!repo)
    return;
  const title = await vscode10.window.showInputBox({
    title: "SRS: Create Note",
    prompt: "Note title",
    placeHolder: "e.g. Architecture Decision: Use CLI bridge",
    validateInput: (v) => v.trim() ? void 0 : "Title is required"
  });
  if (!title)
    return;
  const { randomUUID } = await import("crypto");
  const instanceId = randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const noteJson = JSON.stringify({
    instanceId,
    title: title.trim(),
    sections: [{ name: "body", content: "", label: "Body" }],
    tags: [],
    createdAt: now
  });
  try {
    const cid = containerId(attention);
    await cli.runOk(repo.rootPath, ["note", "create"], {
      stdin: noteJson,
      containerId: cid
    });
    treeProvider.refresh();
    vscode10.window.showInformationMessage(`SRS: Note '${title}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode10.window.showErrorMessage(`SRS: Failed to create note: ${msg}`);
  }
}
async function cmdCreateTag(cli, repoProvider, treeProvider) {
  const repo = requireActiveRepo(repoProvider);
  if (!repo)
    return;
  const slug = await vscode10.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Tag slug (kebab-case identifier)",
    placeHolder: "e.g. needs-review",
    validateInput: (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim()) ? void 0 : "Slug must be kebab-case (e.g. my-tag)"
  });
  if (!slug)
    return;
  const label = await vscode10.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Display label (optional)",
    placeHolder: "e.g. Needs Review"
  });
  const { randomUUID } = await import("crypto");
  const instanceId = randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const tagJson = JSON.stringify({
    instanceId,
    slug: slug.trim(),
    label: label?.trim() || void 0,
    createdAt: now
  });
  try {
    await cli.runOk(repo.rootPath, ["tag", "create"], {
      stdin: tagJson
    });
    treeProvider.refresh();
    vscode10.window.showInformationMessage(`SRS: Tag '${slug}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode10.window.showErrorMessage(`SRS: Failed to create tag: ${msg}`);
  }
}
async function cmdCreateRecord(cli, repoProvider, attention, treeProvider) {
  const repo = requireActiveRepo(repoProvider);
  if (!repo)
    return;
  let types;
  try {
    const payload = await cli.runOk(repo.rootPath, [
      "type",
      "list"
    ]);
    types = payload.types;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode10.window.showErrorMessage(`SRS: Failed to list types: ${msg}`);
    return;
  }
  if (types.length === 0) {
    vscode10.window.showWarningMessage(
      "SRS: No types defined in the active repository."
    );
    return;
  }
  const typeItems = types.map((t) => ({
    label: `${t.namespace}/${t.name}`,
    description: `v${t.version}`,
    detail: t.id,
    type: t
  }));
  const picked = await vscode10.window.showQuickPick(typeItems, {
    placeHolder: "Select a type for the new record",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!picked)
    return;
  const typeName = `${picked.type.namespace}/${picked.type.name}`;
  try {
    const cid = containerId(attention);
    await cli.runOk(
      repo.rootPath,
      ["record", "create", "--type", typeName, "--version", String(picked.type.version)],
      {
        stdin: JSON.stringify({ fieldValues: [] }),
        containerId: cid
      }
    );
    treeProvider.refresh();
    vscode10.window.showInformationMessage(
      `SRS: Record of type '${typeName}' created.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode10.window.showErrorMessage(`SRS: Failed to create record: ${msg}`);
  }
}
async function cmdDeleteEntity(cli, repoProvider, treeProvider, node) {
  if (!(node instanceof EntityNode)) {
    vscode10.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to delete."
    );
    return;
  }
  const repo = repoProvider.active;
  if (!repo)
    return;
  const confirmed = await vscode10.window.showWarningMessage(
    `SRS: Delete ${node.entityKind} '${node.label}'?`,
    { modal: true },
    "Delete"
  );
  if (confirmed !== "Delete")
    return;
  const deleteArgs = deleteArgsFor(node.entityKind, node.entityId);
  if (!deleteArgs) {
    vscode10.window.showErrorMessage(
      `SRS: Delete not supported for '${node.entityKind}'.`
    );
    return;
  }
  try {
    await cli.runOk(repo.rootPath, deleteArgs);
    treeProvider.refresh();
    vscode10.window.showInformationMessage(
      `SRS: ${node.entityKind} deleted.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode10.window.showErrorMessage(`SRS: Failed to delete entity: ${msg}`);
  }
}
function deleteArgsFor(kind, id) {
  switch (kind) {
    case "note":
      return ["note", "delete", "--id", id];
    case "tag":
      return ["tag", "delete", "--id", id];
    case "record":
      return ["record", "delete", "--id", id];
    case "relation":
      return ["relation", "delete", "--id", id];
    case "container":
      return ["container", "delete", "--id", id];
    default:
      return void 0;
  }
}

// src/extension.ts
async function activate(context) {
  const outputChannel = vscode11.window.createOutputChannel("SRS");
  context.subscriptions.push(outputChannel);
  const cli = new CliClient(outputChannel);
  const repoProvider = new RepositoryProvider(cli);
  const attention = new AttentionManager(context.workspaceState, cli);
  const treeProvider = new SrsTreeDataProvider(cli, repoProvider, attention);
  const statusBarItem = new ContainerStatusBarItem(attention);
  const schemaProvider = new SchemaProvider(context.extensionUri);
  const entityDocProvider = new EntityDocumentProvider(cli, repoProvider);
  context.subscriptions.push(
    repoProvider,
    treeProvider,
    attention,
    statusBarItem,
    schemaProvider,
    entityDocProvider,
    vscode11.workspace.registerTextDocumentContentProvider(
      ENTITY_SCHEME,
      entityDocProvider
    )
  );
  const treeView = vscode11.window.createTreeView("srsRepositoryTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);
  repoProvider.onDidChangeActive((repo) => {
    treeView.title = repo ? `SRS: ${repo.title}` : "SRS Repository";
    if (repo) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  });
  registerRepositoryCommands(
    context,
    cli,
    repoProvider,
    treeProvider,
    outputChannel,
    entityDocProvider
  );
  registerContainerCommands(context, cli, repoProvider, attention, treeProvider);
  registerMutationCommands(context, cli, repoProvider, attention, treeProvider);
  await autoDetectRepository(cli, repoProvider);
  const activeRepo = repoProvider.active;
  if (activeRepo) {
    await attention.restore(activeRepo.rootPath);
    statusBarItem.show();
  }
}
async function autoDetectRepository(cli, repoProvider) {
  const config = vscode11.workspace.getConfiguration("srs");
  const configuredPath = config.get("repository.path", null);
  if (configuredPath) {
    const repo = await repoProvider.probe(configuredPath);
    if (repo) {
      repoProvider.setActive(repo);
    } else {
      const action = "Open Settings";
      const choice = await vscode11.window.showWarningMessage(
        `SRS: Configured path '${configuredPath}' is not a valid SRS repository.`,
        action
      );
      if (choice === action) {
        vscode11.commands.executeCommand(
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
    vscode11.window.showInformationMessage(
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
