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
var vscode14 = __toESM(require("vscode"));

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
      return ["note", "get", entityId];
    case "tag":
      return ["tag", "get", entityId];
    case "record":
      return ["record", "get", entityId];
    case "relation":
      return ["relation", "get", entityId];
    case "container":
      return ["container", "get", entityId];
    case "field":
      return ["field", "get", entityId];
    case "type":
      return ["type", "get", entityId];
    case "extension":
      return ["extension", "get", entityId];
    case "protocol":
      return ["protocol", "get", entityId];
    case "view":
      return ["view", "get", entityId];
    case "document-view":
      return ["document-view", "get", entityId];
    case "relation-type":
      return ["relation-type", "get", entityId];
    default:
      return void 0;
  }
}

// src/diagnostics/DiagnosticsProvider.ts
var vscode8 = __toESM(require("vscode"));
var path = __toESM(require("path"));
var REPO_DIAGNOSTIC_SOURCE = "SRS";
var DiagnosticsProvider = class {
  constructor(cli, repoProvider) {
    this.cli = cli;
    this.repoProvider = repoProvider;
    this._disposables = [];
    this._collection = vscode8.languages.createDiagnosticCollection("srs");
    this._disposables.push(this._collection);
  }
  // Run validation and populate the DiagnosticCollection.
  // Called explicitly (e.g. after save) or by commands.
  async validate() {
    const repo = this.repoProvider.active;
    if (!repo) {
      return;
    }
    this._collection.clear();
    const envelope = await this.cli.run(
      repo.rootPath,
      ["repo", "validate"]
    );
    if (!envelope.ok) {
      const uri = vscode8.Uri.file(path.join(repo.rootPath, "manifest.json"));
      this._collection.set(uri, [
        new vscode8.Diagnostic(
          new vscode8.Range(0, 0, 0, 0),
          envelope.diagnostics.join("; "),
          vscode8.DiagnosticSeverity.Error
        )
      ]);
      return;
    }
    const { diagnostics } = envelope.payload;
    if (diagnostics.length === 0) {
      return;
    }
    const byUri = /* @__PURE__ */ new Map();
    for (const d of diagnostics) {
      const uri = d.relative_path ? vscode8.Uri.file(path.join(repo.rootPath, d.relative_path)).toString() : vscode8.Uri.file(path.join(repo.rootPath, "manifest.json")).toString();
      const severity = severityFor(d.severity);
      const diag = new vscode8.Diagnostic(
        new vscode8.Range(0, 0, 0, 0),
        d.message,
        severity
      );
      diag.source = REPO_DIAGNOSTIC_SOURCE;
      if (!byUri.has(uri)) {
        byUri.set(uri, []);
      }
      byUri.get(uri).push(diag);
    }
    for (const [uriStr, diags] of byUri) {
      this._collection.set(vscode8.Uri.parse(uriStr), diags);
    }
  }
  // Clear all diagnostics (e.g. when active repo changes)
  clear() {
    this._collection.clear();
  }
  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
};
function severityFor(s) {
  switch (s) {
    case "Error":
      return vscode8.DiagnosticSeverity.Error;
    case "Warning":
      return vscode8.DiagnosticSeverity.Warning;
    default:
      return vscode8.DiagnosticSeverity.Information;
  }
}

// src/commands/repositoryCommands.ts
var vscode9 = __toESM(require("vscode"));
function registerRepositoryCommands(context, cli, repoProvider, treeProvider, outputChannel, entityProvider, diagnosticsProvider) {
  context.subscriptions.push(
    vscode9.commands.registerCommand(
      "srs.selectRepository",
      () => cmdSelectRepository(cli, repoProvider)
    ),
    vscode9.commands.registerCommand(
      "srs.refreshRepository",
      () => cmdRefreshRepository(repoProvider, treeProvider)
    ),
    vscode9.commands.registerCommand(
      "srs.validateRepository",
      () => cmdValidateRepository(cli, repoProvider, outputChannel, diagnosticsProvider)
    ),
    vscode9.commands.registerCommand(
      "srs.openRepositoryMap",
      () => cmdOpenRepositoryMap(cli, repoProvider, outputChannel)
    ),
    vscode9.commands.registerCommand(
      "srs.openEntity",
      (node) => cmdOpenEntity(repoProvider, entityProvider, node)
    )
  );
}
async function cmdSelectRepository(cli, repoProvider) {
  const discovered = await vscode9.window.withProgress(
    {
      location: vscode9.ProgressLocation.Window,
      title: "SRS: Scanning workspace for repositories\u2026"
    },
    () => repoProvider.discoverAll()
  );
  if (discovered.length === 0) {
    const action = "Open Settings";
    const choice = await vscode9.window.showWarningMessage(
      "No SRS repositories found. Check that srs is installed and srs.cli.path is set correctly.",
      action
    );
    if (choice === action) {
      vscode9.commands.executeCommand(
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
  const picked = await vscode9.window.showQuickPick(items, {
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
async function cmdValidateRepository(cli, repoProvider, outputChannel, diagnosticsProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode9.window.showWarningMessage(
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
          const sev = (d.severity ?? "Info").toUpperCase().padEnd(7);
          const loc = d.relative_path ? ` [${d.relative_path}]` : "";
          outputChannel.appendLine(`  ${sev}${loc}: ${d.message}`);
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
    vscode9.window.showErrorMessage(`SRS validation error: ${msg}`);
  }
  await diagnosticsProvider.validate();
}
async function cmdOpenRepositoryMap(cli, repoProvider, outputChannel) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode9.window.showWarningMessage(
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
    vscode9.window.showErrorMessage(`SRS: ${msg}`);
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
    const doc = await vscode9.workspace.openTextDocument(uri);
    await vscode9.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode9.ViewColumn.Active,
      preserveFocus: false
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode9.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}

// src/commands/previewCommands.ts
var vscode11 = __toESM(require("vscode"));

// src/preview/PreviewPanel.ts
var vscode10 = __toESM(require("vscode"));
var PreviewPanel = class _PreviewPanel {
  constructor(context, _id, title, html) {
    this._id = _id;
    this._panel = vscode10.window.createWebviewPanel(
      "srsPreview",
      title,
      { viewColumn: vscode10.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: false,
        localResourceRoots: []
      }
    );
    this._update(html);
    this._panel.onDidDispose(() => {
      _PreviewPanel._panels.delete(this._id);
    });
  }
  static {
    this._panels = /* @__PURE__ */ new Map();
  }
  static show(context, id, title, html) {
    const existing = _PreviewPanel._panels.get(id);
    if (existing) {
      existing._panel.reveal(vscode10.ViewColumn.Active);
      existing._panel.title = title;
      existing._update(html);
      return existing;
    }
    const panel = new _PreviewPanel(context, id, title, html);
    _PreviewPanel._panels.set(id, panel);
    return panel;
  }
  _update(html) {
    this._panel.webview.html = html;
  }
  dispose() {
    this._panel.dispose();
  }
};
var CSS = `
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
           color: var(--vscode-foreground); background: var(--vscode-editor-background);
           padding: 1.5em 2em; max-width: 900px; line-height: 1.6; }
    h1 { font-size: 1.4em; margin-bottom: 0.25em; }
    h2 { font-size: 1.15em; margin-top: 1.5em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.2em; }
    h3 { font-size: 1em; margin-top: 1em; color: var(--vscode-descriptionForeground); }
    .meta { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 1.5em; }
    .tag { display: inline-block; background: var(--vscode-badge-background);
           color: var(--vscode-badge-foreground); border-radius: 3px;
           padding: 0 6px; font-size: 0.8em; margin: 0 2px; }
    .field-row { display: flex; gap: 1em; margin: 0.4em 0; }
    .field-label { width: 160px; flex-shrink: 0; font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .field-value { flex: 1; word-break: break-word; }
    .section { margin-top: 1.2em; }
    .section-name { font-size: 0.8em; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin-bottom: 0.3em; }
    .member-row { padding: 0.2em 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 0.8em; border-radius: 4px;
          overflow-x: auto; font-size: 0.9em; white-space: pre-wrap; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .rendered-markdown h1 { font-size: 1.6em; }
    .rendered-markdown h2 { font-size: 1.3em; }
    .rendered-markdown h3 { font-size: 1.1em; }
    .rendered-markdown code { background: var(--vscode-textCodeBlock-background); padding: 0 4px; border-radius: 3px; }
  </style>
`;
function wrapHtml(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${CSS}<title>${esc(title)}</title></head><body>${body}</body></html>`;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function markdownToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inPre = false;
  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inPre) {
        out.push("</pre>");
        inPre = false;
      } else {
        out.push("<pre>");
        inPre = true;
      }
      continue;
    }
    if (inPre) {
      out.push(esc(raw));
      continue;
    }
    let line = raw;
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineMarkdown(h[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }
    if (line.trim() === "") {
      out.push("<br>");
      continue;
    }
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  return out.join("\n");
}
function inlineMarkdown(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, "<code>$1</code>");
}

// src/commands/previewCommands.ts
function registerPreviewCommands(context, cli, repoProvider) {
  context.subscriptions.push(
    vscode11.commands.registerCommand(
      "srs.previewEntity",
      (node) => cmdPreviewEntity(context, cli, repoProvider, node)
    ),
    vscode11.commands.registerCommand(
      "srs.previewRender",
      (node) => cmdPreviewRender(context, cli, repoProvider, node)
    )
  );
}
async function cmdPreviewEntity(context, cli, repoProvider, node) {
  if (!(node instanceof EntityNode))
    return;
  const repo = repoProvider.active;
  if (!repo)
    return;
  try {
    switch (node.entityKind) {
      case "note":
        return await previewNote(context, cli, repo.rootPath, node.entityId);
      case "record":
        return await previewRecord(context, cli, repo.rootPath, node.entityId);
      case "container":
        return await previewContainer(context, cli, repo.rootPath, node.entityId);
      default:
        vscode11.window.showInformationMessage(
          `SRS: No preview available for '${node.entityKind}'. Use Open Entity for raw JSON.`
        );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode11.window.showErrorMessage(`SRS: Preview failed: ${msg}`);
  }
}
async function cmdPreviewRender(context, cli, repoProvider, node) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode11.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  let viewId;
  let viewLabel;
  if (node instanceof EntityNode && node.entityKind === "document-view") {
    viewId = node.entityId;
    viewLabel = String(node.label);
  } else {
    let views;
    try {
      const payload = await cli.runOk(repo.rootPath, [
        "document-view",
        "list"
      ]);
      views = payload.documentViews;
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      vscode11.window.showErrorMessage(`SRS: Failed to list document views: ${msg}`);
      return;
    }
    if (views.length === 0) {
      vscode11.window.showWarningMessage("SRS: No document views defined in this repository.");
      return;
    }
    const picked = await vscode11.window.showQuickPick(
      views.map((v) => ({ label: `${v.namespace}/${v.name}`, description: v.id, view: v })),
      { placeHolder: "Select a document view to render" }
    );
    if (!picked)
      return;
    viewId = picked.view.id;
    viewLabel = picked.label;
  }
  try {
    const payload = await cli.runOk(repo.rootPath, [
      "render",
      "document-view",
      "--view",
      viewId
    ]);
    const html = wrapHtml(
      viewLabel ?? viewId,
      `<h1>${esc(viewLabel ?? viewId)}</h1>
       <div class="rendered-markdown">${markdownToHtml(payload.rendered)}</div>`
    );
    PreviewPanel.show(context, `render:${viewId}`, viewLabel ?? viewId, html);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode11.window.showErrorMessage(`SRS: Render failed: ${msg}`);
  }
}
async function previewNote(context, cli, repoPath, id) {
  const payload = await cli.runOk(repoPath, ["note", "get", id]);
  const { note } = payload;
  const tags = (note.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ");
  const meta = [
    note.createdAt ? `Created: ${esc(note.createdAt.slice(0, 10))}` : "",
    tags
  ].filter(Boolean).join(" &nbsp;\xB7&nbsp; ");
  const sections = (note.sections ?? []).map((s) => `
    <div class="section">
      <div class="section-name">${esc(s.label ?? s.name)}</div>
      <div>${markdownToHtml(s.content)}</div>
    </div>`).join("");
  const html = wrapHtml(note.title, `
    <h1>${esc(note.title)}</h1>
    <div class="meta">${meta}</div>
    ${sections || '<p class="empty">No sections.</p>'}
  `);
  PreviewPanel.show(context, `note:${id}`, note.title, html);
}
async function previewRecord(context, cli, repoPath, id) {
  const payload = await cli.runOk(repoPath, ["record", "get", id]);
  const { record } = payload;
  let labelMap = /* @__PURE__ */ new Map();
  try {
    const typePayload = await cli.runOk(repoPath, ["type", "get", record.typeId]);
    for (const f of typePayload.type.fields) {
      labelMap.set(f.fieldId, f.displayLabel ?? f.fieldId.slice(0, 8));
    }
  } catch {
  }
  const title = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const rows = record.fieldValues.map((fv) => {
    const label = labelMap.get(fv.fieldId) ?? fv.fieldId.slice(0, 8);
    const value = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
    return `<div class="field-row">
        <div class="field-label">${esc(label)}</div>
        <div class="field-value">${esc(value)}</div>
      </div>`;
  }).join("");
  const meta = record.createdAt ? `Created: ${esc(record.createdAt.slice(0, 10))}` : "";
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(record.instanceId.slice(0, 8))}\u2026 &nbsp;\xB7&nbsp; ${meta}</div>
    <h2>Fields</h2>
    ${rows || '<p class="empty">No field values.</p>'}
  `);
  PreviewPanel.show(context, `record:${id}`, title, html);
}
async function previewContainer(context, cli, repoPath, id) {
  const listPayload = await cli.runOk(repoPath, ["container", "list"]);
  const container = listPayload.containers.find((c) => c.containerId === id);
  const title = container?.title ?? id.slice(0, 8);
  let members = [];
  try {
    const membersPayload = await cli.runOk(repoPath, [
      "container",
      "members",
      "list",
      id
    ]);
    members = membersPayload.members;
  } catch {
  }
  const rows = members.map((m) => `<div class="member-row">${esc(m.title ?? m.instanceId)}</div>`).join("");
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${container?.containerType ? `Type: ${esc(container.containerType)} &nbsp;\xB7&nbsp; ` : ""}${members.length} members</div>
    <h2>Members</h2>
    ${rows || '<p class="empty">No members.</p>'}
  `);
  PreviewPanel.show(context, `container:${id}`, title, html);
}

// src/commands/containerCommands.ts
var vscode12 = __toESM(require("vscode"));
function registerContainerCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode12.commands.registerCommand(
      "srs.setActiveContainer",
      () => cmdSetActiveContainer(cli, repoProvider, attention)
    ),
    vscode12.commands.registerCommand(
      "srs.clearActiveContainer",
      () => cmdClearActiveContainer(attention, treeProvider)
    ),
    vscode12.commands.registerCommand(
      "srs.createContainer",
      () => cmdCreateContainer(cli, repoProvider, attention, treeProvider)
    )
  );
}
async function cmdSetActiveContainer(cli, repoProvider, attention) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode12.window.showWarningMessage(
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
    vscode12.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
    return;
  }
  if (containers.length === 0) {
    const action = "Create Container";
    const choice = await vscode12.window.showInformationMessage(
      "SRS: No containers found in the active repository.",
      action
    );
    if (choice === action) {
      vscode12.commands.executeCommand("srs.createContainer");
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
  const picked = await vscode12.window.showQuickPick(
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
    vscode12.window.showErrorMessage(`SRS: Failed to set active container: ${msg}`);
  }
}
async function cmdClearActiveContainer(attention, treeProvider) {
  await attention.clear();
  treeProvider.refresh();
}
async function cmdCreateContainer(cli, repoProvider, attention, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode12.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  const title = await vscode12.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container title",
    placeHolder: "e.g. Sprint 42",
    validateInput: (v) => v.trim() ? void 0 : "Title is required"
  });
  if (!title) {
    return;
  }
  const containerType = await vscode12.window.showInputBox({
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
    const choice = await vscode12.window.showInformationMessage(
      `SRS: Container '${title}' created.`,
      setActive
    );
    if (choice === setActive) {
      await attention.set({ containerId: containerId2, title: title.trim() }, repo.rootPath);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode12.window.showErrorMessage(`SRS: Failed to create container: ${msg}`);
  }
}

// src/commands/mutationCommands.ts
var vscode13 = __toESM(require("vscode"));
function registerMutationCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode13.commands.registerCommand(
      "srs.createNote",
      () => cmdCreateNote(cli, repoProvider, attention, treeProvider)
    ),
    vscode13.commands.registerCommand(
      "srs.createTag",
      () => cmdCreateTag(cli, repoProvider, treeProvider)
    ),
    vscode13.commands.registerCommand(
      "srs.createRecord",
      () => cmdCreateRecord(cli, repoProvider, attention, treeProvider)
    ),
    vscode13.commands.registerCommand(
      "srs.deleteEntity",
      (node) => cmdDeleteEntity(cli, repoProvider, treeProvider, node)
    )
  );
}
function requireActiveRepo(repoProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode13.window.showWarningMessage(
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
  const title = await vscode13.window.showInputBox({
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
    vscode13.window.showInformationMessage(`SRS: Note '${title}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode13.window.showErrorMessage(`SRS: Failed to create note: ${msg}`);
  }
}
async function cmdCreateTag(cli, repoProvider, treeProvider) {
  const repo = requireActiveRepo(repoProvider);
  if (!repo)
    return;
  const slug = await vscode13.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Tag slug (kebab-case identifier)",
    placeHolder: "e.g. needs-review",
    validateInput: (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim()) ? void 0 : "Slug must be kebab-case (e.g. my-tag)"
  });
  if (!slug)
    return;
  const label = await vscode13.window.showInputBox({
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
    vscode13.window.showInformationMessage(`SRS: Tag '${slug}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode13.window.showErrorMessage(`SRS: Failed to create tag: ${msg}`);
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
    vscode13.window.showErrorMessage(`SRS: Failed to list types: ${msg}`);
    return;
  }
  if (types.length === 0) {
    vscode13.window.showWarningMessage(
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
  const picked = await vscode13.window.showQuickPick(typeItems, {
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
    vscode13.window.showInformationMessage(
      `SRS: Record of type '${typeName}' created.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode13.window.showErrorMessage(`SRS: Failed to create record: ${msg}`);
  }
}
async function cmdDeleteEntity(cli, repoProvider, treeProvider, node) {
  if (!(node instanceof EntityNode)) {
    vscode13.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to delete."
    );
    return;
  }
  const repo = repoProvider.active;
  if (!repo)
    return;
  const confirmed = await vscode13.window.showWarningMessage(
    `SRS: Delete ${node.entityKind} '${node.label}'?`,
    { modal: true },
    "Delete"
  );
  if (confirmed !== "Delete")
    return;
  const deleteArgs = deleteArgsFor(node.entityKind, node.entityId);
  if (!deleteArgs) {
    vscode13.window.showErrorMessage(
      `SRS: Delete not supported for '${node.entityKind}'.`
    );
    return;
  }
  try {
    await cli.runOk(repo.rootPath, deleteArgs);
    treeProvider.refresh();
    vscode13.window.showInformationMessage(
      `SRS: ${node.entityKind} deleted.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode13.window.showErrorMessage(`SRS: Failed to delete entity: ${msg}`);
  }
}
function deleteArgsFor(kind, id) {
  switch (kind) {
    case "note":
      return ["note", "delete", id];
    case "tag":
      return ["tag", "delete", id];
    case "record":
      return ["record", "delete", id];
    case "relation":
      return ["relation", "delete", id];
    case "container":
      return ["container", "delete", id];
    default:
      return void 0;
  }
}

// src/extension.ts
async function activate(context) {
  const outputChannel = vscode14.window.createOutputChannel("SRS");
  context.subscriptions.push(outputChannel);
  const cli = new CliClient(outputChannel);
  const repoProvider = new RepositoryProvider(cli);
  const attention = new AttentionManager(context.workspaceState, cli);
  const treeProvider = new SrsTreeDataProvider(cli, repoProvider, attention);
  const statusBarItem = new ContainerStatusBarItem(attention);
  const schemaProvider = new SchemaProvider(context.extensionUri);
  const entityDocProvider = new EntityDocumentProvider(cli, repoProvider);
  const diagnosticsProvider = new DiagnosticsProvider(cli, repoProvider);
  context.subscriptions.push(
    repoProvider,
    treeProvider,
    attention,
    statusBarItem,
    schemaProvider,
    entityDocProvider,
    diagnosticsProvider,
    vscode14.workspace.registerTextDocumentContentProvider(
      ENTITY_SCHEME,
      entityDocProvider
    )
  );
  const treeView = vscode14.window.createTreeView("srsRepositoryTree", {
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
      diagnosticsProvider.clear();
    }
  });
  context.subscriptions.push(
    vscode14.workspace.onDidSaveTextDocument((doc) => {
      const repo = repoProvider.active;
      if (!repo)
        return;
      const config = vscode14.workspace.getConfiguration("srs");
      if (!config.get("validate.onSave", true))
        return;
      if (!doc.uri.fsPath.startsWith(repo.rootPath))
        return;
      diagnosticsProvider.validate();
    })
  );
  registerRepositoryCommands(
    context,
    cli,
    repoProvider,
    treeProvider,
    outputChannel,
    entityDocProvider,
    diagnosticsProvider
  );
  registerContainerCommands(context, cli, repoProvider, attention, treeProvider);
  registerMutationCommands(context, cli, repoProvider, attention, treeProvider);
  registerPreviewCommands(context, cli, repoProvider);
  await autoDetectRepository(cli, repoProvider);
  const activeRepo = repoProvider.active;
  if (activeRepo) {
    await attention.restore(activeRepo.rootPath);
    statusBarItem.show();
  }
}
async function autoDetectRepository(cli, repoProvider) {
  const config = vscode14.workspace.getConfiguration("srs");
  const configuredPath = config.get("repository.path", null);
  if (configuredPath) {
    const repo = await repoProvider.probe(configuredPath);
    if (repo) {
      repoProvider.setActive(repo);
    } else {
      const action = "Open Settings";
      const choice = await vscode14.window.showWarningMessage(
        `SRS: Configured path '${configuredPath}' is not a valid SRS repository.`,
        action
      );
      if (choice === action) {
        vscode14.commands.executeCommand(
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
    vscode14.window.showInformationMessage(
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
