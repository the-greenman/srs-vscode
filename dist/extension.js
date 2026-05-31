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
var vscode20 = __toESM(require("vscode"));

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
      label: `${r.relationType}: ${r.sourceId.slice(0, 8)}\u2192${r.targetId.slice(0, 8)}`
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
  constructor(context, _id, title, html, options) {
    this._id = _id;
    this._panel = vscode10.window.createWebviewPanel(
      "srsPreview",
      title,
      { viewColumn: vscode10.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: options?.enableScripts ?? false,
        localResourceRoots: []
      }
    );
    this._update(html);
    if (options?.onMessage) {
      this._setMessageHandler(options.onMessage);
    }
    this._panel.onDidDispose(() => {
      this._messageDisposable?.dispose();
      _PreviewPanel._panels.delete(this._id);
    });
  }
  static {
    this._panels = /* @__PURE__ */ new Map();
  }
  static show(context, id, title, html, options) {
    const existing = _PreviewPanel._panels.get(id);
    if (existing) {
      existing._panel.reveal(vscode10.ViewColumn.Active);
      existing._panel.title = title;
      existing._update(html);
      if (options?.onMessage) {
        existing._setMessageHandler(options.onMessage);
      }
      return existing;
    }
    const panel = new _PreviewPanel(context, id, title, html, options);
    _PreviewPanel._panels.set(id, panel);
    return panel;
  }
  _setMessageHandler(handler) {
    this._messageDisposable?.dispose();
    this._messageDisposable = this._panel.webview.onDidReceiveMessage(handler);
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
    .repeatable-values { margin: 0; padding-left: 1.2em; }
    .repeatable-values li { margin: 0.1em 0; }
    .section { margin-top: 1.2em; }
    .section-name { font-size: 0.8em; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin-bottom: 0.3em; }
    .member-row { padding: 0.2em 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 0.8em; border-radius: 4px;
          overflow-x: auto; font-size: 0.9em; white-space: pre-wrap; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .relation-row { display: flex; align-items: baseline; gap: 0.6em; padding: 0.3em 0;
                    border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    .rel-arrow { color: var(--vscode-descriptionForeground); font-weight: 600; flex-shrink: 0; }
    .rel-type { color: var(--vscode-badge-foreground); background: var(--vscode-badge-background);
                border-radius: 3px; padding: 0 5px; font-size: 0.8em; flex-shrink: 0; }
    .rel-link { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
    .rel-link:hover { text-decoration: underline; }
  </style>
`;
function wrapHtml(title, body, options) {
  const csp = options?.enableScripts ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">` : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${csp}${CSS}<title>${esc(title)}</title></head><body>${body}</body></html>`;
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    await openMarkdownPreview(payload.rendered, viewLabel ?? viewId);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode11.window.showErrorMessage(`SRS: Render failed: ${msg}`);
  }
}
async function previewNote(_context, cli, repoPath, id) {
  const payload = await cli.runOk(repoPath, ["note", "get", id]);
  const { note } = payload;
  const tagLine = (note.tags ?? []).map((t) => `\`${t}\``).join(" ");
  const metaLine = [
    note.createdAt ? `*${note.createdAt.slice(0, 10)}*` : "",
    tagLine
  ].filter(Boolean).join("  \xB7  ");
  const sectionsMd = (note.sections ?? []).map((s) => `## ${s.label ?? s.name}

${s.content}`).join("\n\n---\n\n");
  const md = [`# ${note.title}`, metaLine, sectionsMd || "*No sections.*"].filter(Boolean).join("\n\n");
  await openMarkdownPreview(md, note.title);
}
async function previewRecord(context, cli, repoPath, id) {
  const payload = await cli.runOk(repoPath, ["record", "get", id]);
  const { record } = payload;
  let labelMap = /* @__PURE__ */ new Map();
  let repeatableSet = /* @__PURE__ */ new Set();
  let relatedItems = [];
  const [typeResult, relResult, noteResult, recordListResult] = await Promise.allSettled([
    cli.runOk(repoPath, ["type", "get", record.typeId]),
    cli.runOk(repoPath, ["relation", "list"]),
    cli.runOk(repoPath, ["note", "list"]),
    cli.runOk(repoPath, ["record", "list"])
  ]);
  if (typeResult.status === "fulfilled") {
    for (const f of typeResult.value.type.fields) {
      labelMap.set(f.fieldId, f.displayLabel ?? f.fieldId.slice(0, 8));
      if (f.repeatable)
        repeatableSet.add(f.fieldId);
    }
  }
  if (relResult.status === "fulfilled") {
    const peerLabelMap = /* @__PURE__ */ new Map();
    if (noteResult.status === "fulfilled") {
      for (const n of noteResult.value.notes) {
        peerLabelMap.set(n.instanceId, { label: n.title, kind: "note" });
      }
    }
    if (recordListResult.status === "fulfilled") {
      for (const r of recordListResult.value.records) {
        peerLabelMap.set(r.instanceId, { label: r.typeName, kind: "record" });
      }
    }
    for (const rel of relResult.value.relations) {
      if (rel.sourceId === id) {
        const peer = peerLabelMap.get(rel.targetId);
        relatedItems.push({
          relationId: rel.relationId,
          relationType: rel.relationType,
          direction: "outgoing",
          peerId: rel.targetId,
          peerLabel: peer?.label ?? rel.targetId.slice(0, 8),
          peerKind: peer?.kind ?? "note"
        });
      } else if (rel.targetId === id) {
        const peer = peerLabelMap.get(rel.sourceId);
        relatedItems.push({
          relationId: rel.relationId,
          relationType: rel.relationType,
          direction: "incoming",
          peerId: rel.sourceId,
          peerLabel: peer?.label ?? rel.sourceId.slice(0, 8),
          peerKind: peer?.kind ?? "note"
        });
      }
    }
  }
  const title = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const rows = record.fieldValues.map((fv) => {
    const label = labelMap.get(fv.fieldId) ?? fv.fieldId.slice(0, 8);
    let valueHtml;
    if (repeatableSet.has(fv.fieldId) && fv.entries && fv.entries.length > 0) {
      const items = fv.entries.map((e) => {
        const v = typeof e.value === "string" ? e.value : JSON.stringify(e.value);
        return `<li>${esc(v)}</li>`;
      }).join("");
      valueHtml = `<ul class="repeatable-values">${items}</ul>`;
    } else {
      const v = typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value);
      valueHtml = esc(v);
    }
    return `<div class="field-row">
        <div class="field-label">${esc(label)}</div>
        <div class="field-value">${valueHtml}</div>
      </div>`;
  }).join("");
  const meta = record.createdAt ? `Created: ${esc(record.createdAt.slice(0, 10))}` : "";
  const relationsHtml = relatedItems.length === 0 ? '<p class="empty">No relations.</p>' : relatedItems.map((r) => {
    const arrow = r.direction === "outgoing" ? "\u2192" : "\u2190";
    const dirLabel = r.direction === "outgoing" ? "to" : "from";
    return `<div class="relation-row">
          <span class="rel-arrow">${arrow}</span>
          <span class="rel-type">${esc(r.relationType)}</span>
          <a class="rel-link" href="#" data-id="${esc(r.peerId)}" data-kind="${esc(r.peerKind)}" title="${esc(r.peerId)}">${esc(r.peerLabel)}</a>
        </div>`;
  }).join("");
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(record.instanceId.slice(0, 8))}\u2026 &nbsp;\xB7&nbsp; ${meta}</div>
    <h2>Fields</h2>
    ${rows || '<p class="empty">No field values.</p>'}
    <h2>Relations</h2>
    ${relationsHtml}
    <script>
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('.rel-link').forEach(function(el) {
        el.addEventListener('click', function(ev) {
          ev.preventDefault();
          vscode.postMessage({ type: 'openEntity', id: el.dataset.id, kind: el.dataset.kind });
        });
      });
    </script>
  `, { enableScripts: true });
  PreviewPanel.show(context, `record:${id}`, title, html, {
    enableScripts: true,
    onMessage: (msg) => {
      const m = msg;
      if (m.type === "openEntity" && m.id && m.kind) {
        vscode11.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
      }
    }
  });
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
async function openMarkdownPreview(markdown, _title) {
  const doc = await vscode11.workspace.openTextDocument({
    content: markdown,
    language: "markdown"
  });
  await vscode11.window.showTextDocument(doc, {
    viewColumn: vscode11.ViewColumn.Active,
    preview: true,
    preserveFocus: false
  });
  await vscode11.commands.executeCommand("markdown.showPreview", doc.uri);
}

// src/commands/editCommands.ts
var vscode13 = __toESM(require("vscode"));

// src/webview/EntityEditorPanel.ts
var vscode12 = __toESM(require("vscode"));
var EntityEditorPanel = class _EntityEditorPanel {
  constructor(_context, _id, title, html, onSave) {
    this._id = _id;
    this._onSave = onSave;
    this._panel = vscode12.window.createWebviewPanel(
      "srsEditor",
      title,
      { viewColumn: vscode12.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: []
      }
    );
    this._update(html);
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "cancel") {
        this.dispose();
        return;
      }
      if (msg.type === "save") {
        try {
          await this._onSave(msg.data);
          this.dispose();
        } catch (err) {
          const messages = err instanceof CliError ? err.diagnostics : [String(err)];
          this._panel.webview.postMessage({ type: "error", messages });
        }
      }
    });
    this._panel.onDidDispose(() => {
      _EntityEditorPanel._panels.delete(this._id);
    });
  }
  static {
    this._panels = /* @__PURE__ */ new Map();
  }
  static show(context, id, title, html, onSave) {
    const existing = _EntityEditorPanel._panels.get(id);
    if (existing) {
      existing._panel.reveal(vscode12.ViewColumn.Active);
      existing._panel.title = title;
      existing._onSave = onSave;
      existing._update(html);
      return existing;
    }
    const panel = new _EntityEditorPanel(context, id, title, html, onSave);
    _EntityEditorPanel._panels.set(id, panel);
    return panel;
  }
  _update(html) {
    this._panel.webview.html = html;
  }
  dispose() {
    this._panel.dispose();
  }
};

// src/webview/forms.ts
function esc2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) {
  return esc2(s);
}
function escText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
var FORM_CSS = `
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 1.5em 2em;
      max-width: 800px;
    }
    h1 { font-size: 1.2em; margin-bottom: 1.2em; }
    .field { margin-bottom: 1.2em; }
    label {
      display: block;
      font-size: 0.85em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 0.3em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    label .required-mark { color: var(--vscode-errorForeground); margin-left: 2px; }
    input[type="text"], textarea {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
    }
    input[type="text"]:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    textarea { line-height: 1.5; }
    .section-group {
      border-left: 2px solid var(--vscode-panel-border);
      padding-left: 1em;
      margin-bottom: 1.5em;
    }
    .section-group .field:last-child { margin-bottom: 0; }
    .section-header {
      display: flex;
      gap: 0.5em;
      margin-bottom: 0.4em;
      align-items: center;
    }
    .section-name-input {
      flex: 1;
      font-weight: 600;
    }
    .section-label-input { flex: 1; }
    .btn-remove-section {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
      flex-shrink: 0;
    }
    .btn-remove-section:hover { opacity: 0.7; }
    .repeat-list { display: flex; flex-direction: column; gap: 0.4em; margin-bottom: 0.4em; }
    .repeat-entry { display: flex; gap: 0.5em; align-items: flex-start; }
    .repeat-entry .repeat-value { flex: 1; }
    .btn-remove-entry {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .btn-remove-entry:hover { opacity: 0.7; }
    .btn-add-entry {
      padding: 3px 10px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .btn-add-entry:hover { border-color: var(--vscode-focusBorder); }
    .hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 0.2em; }
    .button-row { display: flex; gap: 0.75em; margin-top: 1.5em; }
    button {
      padding: 5px 16px;
      border: none;
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      cursor: pointer;
    }
    button[type="submit"] {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button[type="submit"]:hover { background: var(--vscode-button-hoverBackground); }
    button[type="button"] {
      background: var(--vscode-button-secondaryBackground, var(--vscode-panel-border));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
    #error-banner {
      display: none;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 0.6em 1em;
      margin-bottom: 1em;
      border-radius: 2px;
      font-size: 0.9em;
    }
    #error-banner.visible { display: block; }
  </style>
`;
var FORM_JS = `
  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('editor-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const data = collectFormData();
      vscode.postMessage({ type: 'save', data });
    });

    document.getElementById('btn-cancel').addEventListener('click', function() {
      vscode.postMessage({ type: 'cancel' });
    });

    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (msg.type === 'error') {
        const banner = document.getElementById('error-banner');
        banner.textContent = msg.messages.join('\\n');
        banner.classList.add('visible');
      }
    });
  </script>
`;
var CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">`;
function formWrapHtml(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${CSP}
  ${FORM_CSS}
  <title>${esc2(title)}</title>
</head>
<body>
  <h1>${esc2(title)}</h1>
  <div id="error-banner"></div>
  <form id="editor-form" novalidate>
    ${body}
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" id="btn-cancel">Cancel</button>
    </div>
  </form>
  ${FORM_JS}
</body>
</html>`;
}
function buildNoteForm(note) {
  const sections = note.sections ?? [];
  const tagsValue = (note.tags ?? []).join(", ");
  const sectionHtml = sections.map((s) => `
    <div class="section-group" data-section>
      <div class="field">
        <div class="section-header">
          <input type="text" class="section-name-input" placeholder="Section name (e.g. body)" value="${escAttr(s.name)}" required>
          <input type="text" class="section-label-input" placeholder="Label (optional)" value="${escAttr(s.label ?? "")}">
          <button type="button" class="btn-remove-section" title="Remove section">\u2715</button>
        </div>
        <textarea class="section-content-input" rows="6">${escText(s.content)}</textarea>
      </div>
    </div>`).join("");
  const collectJs = `
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const title = form.querySelector('[name="title"]').value;
      const tagsRaw = form.querySelector('[name="tags"]').value;
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      const sections = [];
      form.querySelectorAll('[data-section]').forEach(function(group) {
        const name = group.querySelector('.section-name-input').value.trim();
        const labelRaw = group.querySelector('.section-label-input').value.trim();
        const content = group.querySelector('.section-content-input').value;
        if (name) {
          sections.push({ name, label: labelRaw || undefined, content });
        }
      });
      return { instanceId, title, tags, sections, createdAt };
    }

    function addSection() {
      const container = document.getElementById('sections-container');
      const group = document.createElement('div');
      group.className = 'section-group';
      group.setAttribute('data-section', '');
      group.innerHTML =
        '<div class="field">' +
          '<div class="section-header">' +
            '<input type="text" class="section-name-input" placeholder="Section name (e.g. body)" required>' +
            '<input type="text" class="section-label-input" placeholder="Label (optional)">' +
            '<button type="button" class="btn-remove-section" title="Remove section">\\u2715</button>' +
          '</div>' +
          '<textarea class="section-content-input" rows="6"></textarea>' +
        '</div>';
      container.appendChild(group);
      group.querySelector('.section-name-input').focus();
      wireRemoveButton(group.querySelector('.btn-remove-section'));
    }

    function wireRemoveButton(btn) {
      btn.addEventListener('click', function() {
        btn.closest('[data-section]').remove();
      });
    }

    document.querySelectorAll('.btn-remove-section').forEach(wireRemoveButton);
    document.getElementById('btn-add-section').addEventListener('click', addSection);
  </script>`;
  return `
    <div class="field">
      <label>Title <span class="required-mark">*</span></label>
      <input type="text" name="title" value="${escAttr(note.title)}" required autofocus>
    </div>
    <div class="field">
      <label>Tags</label>
      <input type="text" name="tags" value="${escAttr(tagsValue)}">
      <div class="hint">Comma-separated slugs, e.g. purpose, origin</div>
    </div>
    <div id="sections-container">
      ${sectionHtml}
    </div>
    <div class="field">
      <button type="button" id="btn-add-section">+ Add Section</button>
    </div>
    <input type="hidden" name="instanceId" value="${escAttr(note.instanceId)}">
    <input type="hidden" name="createdAt" value="${escAttr(note.createdAt ?? "")}">
    ${collectJs}`;
}
function buildTagForm(tag) {
  const collectJs = `
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const slug = form.querySelector('[name="slug"]').value.trim();
      const labelRaw = form.querySelector('[name="label"]').value.trim();
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      return { instanceId, slug, label: labelRaw || undefined, createdAt };
    }
  </script>`;
  return `
    <div class="field">
      <label>Slug <span class="required-mark">*</span></label>
      <input type="text" name="slug" value="${escAttr(tag.slug)}" required
             pattern="[a-z0-9]+(-[a-z0-9]+)*" autofocus>
      <div class="hint">Kebab-case, e.g. needs-review</div>
    </div>
    <div class="field">
      <label>Display Label</label>
      <input type="text" name="label" value="${escAttr(tag.label ?? "")}">
    </div>
    <input type="hidden" name="instanceId" value="${escAttr(tag.instanceId)}">
    <input type="hidden" name="createdAt" value="${escAttr(tag.createdAt ?? "")}">
    ${collectJs}`;
}
function buildRecordForm(record, fields) {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const currentScalar = /* @__PURE__ */ new Map();
  const currentEntries = /* @__PURE__ */ new Map();
  for (const fv of record.fieldValues) {
    if (fv.entries && fv.entries.length > 0) {
      currentEntries.set(
        fv.fieldId,
        fv.entries.map((e) => typeof e.value === "string" ? e.value : JSON.stringify(e.value))
      );
    } else {
      currentScalar.set(
        fv.fieldId,
        typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value)
      );
    }
  }
  const fieldHtml = sorted.map((f, i) => {
    const label = f.displayLabel ?? f.fieldId.slice(0, 8);
    const requiredMark = f.required ? ` <span class="required-mark">*</span>` : "";
    const minHint = f.minItems != null ? ` min ${f.minItems}` : "";
    const maxHint = f.maxItems != null ? ` max ${f.maxItems}` : "";
    const repeatHint = minHint || maxHint ? `<div class="hint">Repeatable${minHint}${maxHint}</div>` : "";
    if (f.repeatable) {
      const entries = currentEntries.get(f.fieldId) ?? (currentScalar.has(f.fieldId) ? [currentScalar.get(f.fieldId)] : [""]);
      const entryInputs = entries.map((v) => `
        <div class="repeat-entry" data-repeat-entry>
          <textarea class="repeat-value" rows="2">${escText(v)}</textarea>
          <button type="button" class="btn-remove-entry" title="Remove">\u2715</button>
        </div>`).join("");
      return `
    <div class="field" data-field-index="${i}" data-repeatable>
      <label>${esc2(label)}${requiredMark}</label>
      <div class="repeat-list" id="repeat-list-${i}">${entryInputs}</div>
      <button type="button" class="btn-add-entry" data-target="repeat-list-${i}">+ Add value</button>
      ${repeatHint}
      <input type="hidden" name="field_id_${i}" value="${escAttr(f.fieldId)}">
    </div>`;
    } else {
      const value = currentScalar.get(f.fieldId) ?? "";
      const required = f.required ? ` required` : "";
      return `
    <div class="field" data-field-index="${i}">
      <label>${esc2(label)}${requiredMark}</label>
      <textarea name="field_value_${i}" rows="2"${required}>${escText(value)}</textarea>
      <input type="hidden" name="field_id_${i}" value="${escAttr(f.fieldId)}">
    </div>`;
    }
  }).join("");
  const fieldCount = sorted.length;
  const repeatableIndices = sorted.map((f, i) => f.repeatable ? i : -1).filter((i) => i >= 0);
  const collectJs = `
  <script>
    var repeatableIndices = ${JSON.stringify(repeatableIndices)};

    function collectFormData() {
      var form = document.getElementById('editor-form');
      var instanceId = form.querySelector('[name="instanceId"]').value;
      var typeId = form.querySelector('[name="typeId"]').value;
      var typeName = form.querySelector('[name="typeName"]').value;
      var typeNamespace = form.querySelector('[name="typeNamespace"]').value;
      var typeVersion = parseInt(form.querySelector('[name="typeVersion"]').value, 10);
      var createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      var fieldCount = parseInt(form.querySelector('[name="fieldCount"]').value, 10);
      var fieldValues = [];
      for (var i = 0; i < fieldCount; i++) {
        var fieldId = form.querySelector('[name="field_id_' + i + '"]').value;
        if (repeatableIndices.indexOf(i) >= 0) {
          var list = form.querySelector('#repeat-list-' + i);
          var entries = [];
          list.querySelectorAll('[data-repeat-entry] .repeat-value').forEach(function(ta) {
            var v = ta.value.trim();
            if (v) entries.push({ value: v });
          });
          // Always include repeatable fields (even if empty, for min-items validation)
          fieldValues.push({ fieldId: fieldId, value: '', entries: entries });
        } else {
          var value = form.querySelector('[name="field_value_' + i + '"]').value;
          if (value.trim()) {
            fieldValues.push({ fieldId: fieldId, value: value.trim() });
          }
        }
      }
      return { instanceId: instanceId, typeId: typeId, typeName: typeName,
               typeNamespace: typeNamespace, typeVersion: typeVersion,
               createdAt: createdAt, fieldValues: fieldValues };
    }

    function wireRemoveEntry(btn) {
      btn.addEventListener('click', function() {
        btn.closest('[data-repeat-entry]').remove();
      });
    }

    function addEntry(listId) {
      var list = document.getElementById(listId);
      var entry = document.createElement('div');
      entry.className = 'repeat-entry';
      entry.setAttribute('data-repeat-entry', '');
      entry.innerHTML = '<textarea class="repeat-value" rows="2"></textarea>' +
        '<button type="button" class="btn-remove-entry" title="Remove">\\u2715</button>';
      list.appendChild(entry);
      entry.querySelector('.repeat-value').focus();
      wireRemoveEntry(entry.querySelector('.btn-remove-entry'));
    }

    document.querySelectorAll('.btn-remove-entry').forEach(wireRemoveEntry);
    document.querySelectorAll('.btn-add-entry').forEach(function(btn) {
      btn.addEventListener('click', function() { addEntry(btn.getAttribute('data-target')); });
    });
  </script>`;
  return `
    ${fieldHtml}
    <input type="hidden" name="instanceId" value="${escAttr(record.instanceId)}">
    <input type="hidden" name="typeId" value="${escAttr(record.typeId)}">
    <input type="hidden" name="typeName" value="${escAttr(record.typeName)}">
    <input type="hidden" name="typeNamespace" value="${escAttr(record.typeNamespace)}">
    <input type="hidden" name="typeVersion" value="${escAttr(String(record.typeVersion))}">
    <input type="hidden" name="createdAt" value="${escAttr(record.createdAt ?? "")}">
    <input type="hidden" name="fieldCount" value="${fieldCount}">
    ${collectJs}`;
}

// src/commands/editCommands.ts
function registerEditCommands(context, cli, repoProvider, treeProvider) {
  context.subscriptions.push(
    vscode13.commands.registerCommand(
      "srs.editEntity",
      (node) => cmdEditEntity(context, cli, repoProvider, treeProvider, node)
    ),
    vscode13.commands.registerCommand(
      "srs.createRelation",
      () => cmdCreateRelation(cli, repoProvider, treeProvider)
    )
  );
}
async function cmdEditEntity(context, cli, repoProvider, treeProvider, node) {
  if (!(node instanceof EntityNode)) {
    vscode13.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to edit."
    );
    return;
  }
  const repo = repoProvider.active;
  if (!repo)
    return;
  try {
    switch (node.entityKind) {
      case "note":
        await editNote(context, cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "tag":
        await editTag(context, cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "record":
        await editRecord(context, cli, repo.rootPath, node.entityId, treeProvider);
        break;
      default:
        vscode13.window.showInformationMessage(
          `SRS: No form editor for '${node.entityKind}'. Open the entity JSON to edit directly.`
        );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode13.window.showErrorMessage(`SRS: Edit failed: ${msg}`);
  }
}
async function editNote(context, cli, repoPath, id, treeProvider) {
  const payload = await cli.runOk(repoPath, ["note", "get", id]);
  const note = payload.note;
  const noteData = {
    instanceId: note.instanceId,
    title: note.title,
    tags: note.tags,
    createdAt: note.createdAt,
    sections: note.sections
  };
  const html = formWrapHtml(note.title, buildNoteForm(noteData));
  EntityEditorPanel.show(context, `note:${id}`, note.title, html, async (data) => {
    const d = data;
    const refetch = await cli.runOk(repoPath, ["note", "get", id]);
    if (refetch.note.title !== note.title) {
      const proceed = await vscode13.window.showWarningMessage(
        `SRS: Note was modified since you opened it (title changed to "${refetch.note.title}"). Overwrite?`,
        { modal: true },
        "Overwrite"
      );
      if (proceed !== "Overwrite")
        return;
    }
    await cli.runOk(repoPath, ["note", "update", id], {
      stdin: JSON.stringify(d)
    });
    treeProvider.refresh();
  });
}
async function editTag(context, cli, repoPath, id, treeProvider) {
  const payload = await cli.runOk(repoPath, ["tag", "get", id]);
  const tag = payload.tagDefinition;
  const tagData = {
    instanceId: tag.instanceId,
    slug: tag.slug,
    label: tag.label,
    createdAt: tag.createdAt
  };
  const html = formWrapHtml(`Edit Tag: ${tag.slug}`, buildTagForm(tagData));
  EntityEditorPanel.show(context, `tag:${id}`, `Edit Tag: ${tag.slug}`, html, async (data) => {
    const d = data;
    const refetch = await cli.runOk(repoPath, ["tag", "get", id]);
    if (refetch.tagDefinition.slug !== tag.slug) {
      const proceed = await vscode13.window.showWarningMessage(
        `SRS: Tag was modified since you opened it. Overwrite?`,
        { modal: true },
        "Overwrite"
      );
      if (proceed !== "Overwrite")
        return;
    }
    await cli.runOk(repoPath, ["tag", "update", id], {
      stdin: JSON.stringify(d)
    });
    treeProvider.refresh();
  });
}
async function editRecord(context, cli, repoPath, id, treeProvider) {
  const payload = await cli.runOk(repoPath, ["record", "get", id]);
  const record = payload.record;
  const typePayload = await cli.runOk(repoPath, [
    "type",
    "get",
    record.typeId
  ]);
  const typeFields = typePayload.type.fields;
  const recordData = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeName: record.typeName,
    typeNamespace: record.typeNamespace,
    typeVersion: record.typeVersion,
    createdAt: record.createdAt,
    fieldValues: record.fieldValues
  };
  const fieldData = typeFields.map((f) => ({
    fieldId: f.fieldId,
    displayLabel: f.displayLabel,
    order: f.order,
    required: f.required,
    repeatable: f.repeatable,
    minItems: f.minItems,
    maxItems: f.maxItems
  }));
  const panelTitle = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const html = formWrapHtml(panelTitle, buildRecordForm(recordData, fieldData));
  EntityEditorPanel.show(context, `record:${id}`, panelTitle, html, async (data) => {
    const d = data;
    const refetch = await cli.runOk(repoPath, ["record", "get", id]);
    if (refetch.record.fieldValues.length !== record.fieldValues.length) {
      const proceed = await vscode13.window.showWarningMessage(
        `SRS: Record was modified since you opened it. Overwrite?`,
        { modal: true },
        "Overwrite"
      );
      if (proceed !== "Overwrite")
        return;
    }
    await cli.runOk(repoPath, ["record", "update", id], {
      stdin: JSON.stringify(d)
    });
    treeProvider.refresh();
  });
}
async function cmdCreateRelation(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode13.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  let relationTypes = [];
  try {
    const payload = await cli.runOk(repo.rootPath, [
      "relation-type",
      "list"
    ]);
    relationTypes = payload.relationTypeDefinitions;
  } catch {
  }
  const CANONICAL_TYPES = [
    "contains",
    "depends-on",
    "supersedes",
    "refines",
    "derived-from",
    "evidences",
    "precedes"
  ];
  const typeItems = relationTypes.length > 0 ? relationTypes.map((rt) => ({
    label: rt.label,
    description: rt.relationType,
    value: rt.relationType
  })) : CANONICAL_TYPES.map((t) => ({ label: t, description: "", value: t }));
  const pickedType = await vscode13.window.showQuickPick(typeItems, {
    placeHolder: "Select relation type"
  });
  if (!pickedType)
    return;
  const instanceItems = await buildInstanceItems(cli, repo.rootPath);
  if (instanceItems.length === 0) {
    vscode13.window.showWarningMessage(
      "SRS: No instances found to relate. Create some notes or records first."
    );
    return;
  }
  const source = await vscode13.window.showQuickPick(instanceItems, {
    placeHolder: "Select source instance",
    matchOnDescription: true
  });
  if (!source)
    return;
  const target = await vscode13.window.showQuickPick(
    instanceItems.filter((i) => i.id !== source.id),
    { placeHolder: "Select target instance", matchOnDescription: true }
  );
  if (!target)
    return;
  const { randomUUID } = await import("crypto");
  const relationJson = JSON.stringify({
    relationId: randomUUID(),
    relationType: pickedType.value,
    sourceInstanceId: source.id,
    targetInstanceId: target.id,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    await cli.runOk(repo.rootPath, ["relation", "create"], {
      stdin: relationJson
    });
    treeProvider.refresh();
    vscode13.window.showInformationMessage(
      `SRS: Relation '${pickedType.value}' created.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode13.window.showErrorMessage(`SRS: Failed to create relation: ${msg}`);
  }
}
async function buildInstanceItems(cli, repoPath) {
  const items = [];
  try {
    const notes = await cli.runOk(repoPath, ["note", "list"]);
    for (const n of notes.notes) {
      items.push({ label: n.title, description: `note \xB7 ${n.instanceId.slice(0, 8)}`, id: n.instanceId });
    }
  } catch {
  }
  try {
    const records = await cli.runOk(repoPath, ["record", "list"]);
    for (const r of records.records) {
      items.push({
        label: `${r.typeNamespace}/${r.typeName}`,
        description: `record \xB7 ${r.instanceId.slice(0, 8)}`,
        id: r.instanceId
      });
    }
  } catch {
  }
  return items;
}

// src/commands/containerCommands.ts
var vscode14 = __toESM(require("vscode"));
function registerContainerCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode14.commands.registerCommand(
      "srs.setActiveContainer",
      () => cmdSetActiveContainer(cli, repoProvider, attention)
    ),
    vscode14.commands.registerCommand(
      "srs.clearActiveContainer",
      () => cmdClearActiveContainer(attention, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.createContainer",
      () => cmdCreateContainer(cli, repoProvider, attention, treeProvider)
    )
  );
}
async function cmdSetActiveContainer(cli, repoProvider, attention) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage(
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
    vscode14.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
    return;
  }
  if (containers.length === 0) {
    const action = "Create Container";
    const choice = await vscode14.window.showInformationMessage(
      "SRS: No containers found in the active repository.",
      action
    );
    if (choice === action) {
      vscode14.commands.executeCommand("srs.createContainer");
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
  const picked = await vscode14.window.showQuickPick(
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
    vscode14.window.showErrorMessage(`SRS: Failed to set active container: ${msg}`);
  }
}
async function cmdClearActiveContainer(attention, treeProvider) {
  await attention.clear();
  treeProvider.refresh();
}
async function cmdCreateContainer(cli, repoProvider, attention, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  const title = await vscode14.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container title",
    placeHolder: "e.g. Sprint 42",
    validateInput: (v) => v.trim() ? void 0 : "Title is required"
  });
  if (!title) {
    return;
  }
  const containerType = await vscode14.window.showInputBox({
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
    const choice = await vscode14.window.showInformationMessage(
      `SRS: Container '${title}' created.`,
      setActive
    );
    if (choice === setActive) {
      await attention.set({ containerId: containerId2, title: title.trim() }, repo.rootPath);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to create container: ${msg}`);
  }
}

// src/commands/mutationCommands.ts
var vscode15 = __toESM(require("vscode"));
function registerMutationCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode15.commands.registerCommand(
      "srs.createNote",
      () => cmdCreateNote(cli, repoProvider, attention, treeProvider)
    ),
    vscode15.commands.registerCommand(
      "srs.createTag",
      () => cmdCreateTag(cli, repoProvider, treeProvider)
    ),
    vscode15.commands.registerCommand(
      "srs.createRecord",
      () => cmdCreateRecord(cli, repoProvider, attention, treeProvider)
    ),
    vscode15.commands.registerCommand(
      "srs.deleteEntity",
      (node) => cmdDeleteEntity(cli, repoProvider, treeProvider, node)
    )
  );
}
function requireActiveRepo(repoProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode15.window.showWarningMessage(
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
  const title = await vscode15.window.showInputBox({
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
    vscode15.window.showInformationMessage(`SRS: Note '${title}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode15.window.showErrorMessage(`SRS: Failed to create note: ${msg}`);
  }
}
async function cmdCreateTag(cli, repoProvider, treeProvider) {
  const repo = requireActiveRepo(repoProvider);
  if (!repo)
    return;
  const slug = await vscode15.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Tag slug (kebab-case identifier)",
    placeHolder: "e.g. needs-review",
    validateInput: (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim()) ? void 0 : "Slug must be kebab-case (e.g. my-tag)"
  });
  if (!slug)
    return;
  const label = await vscode15.window.showInputBox({
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
    vscode15.window.showInformationMessage(`SRS: Tag '${slug}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode15.window.showErrorMessage(`SRS: Failed to create tag: ${msg}`);
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
    vscode15.window.showErrorMessage(`SRS: Failed to list types: ${msg}`);
    return;
  }
  if (types.length === 0) {
    vscode15.window.showWarningMessage(
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
  const picked = await vscode15.window.showQuickPick(typeItems, {
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
    vscode15.window.showInformationMessage(
      `SRS: Record of type '${typeName}' created.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode15.window.showErrorMessage(`SRS: Failed to create record: ${msg}`);
  }
}
async function cmdDeleteEntity(cli, repoProvider, treeProvider, node) {
  if (!(node instanceof EntityNode)) {
    vscode15.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to delete."
    );
    return;
  }
  const repo = repoProvider.active;
  if (!repo)
    return;
  const confirmed = await vscode15.window.showWarningMessage(
    `SRS: Delete ${node.entityKind} '${node.label}'?`,
    { modal: true },
    "Delete"
  );
  if (confirmed !== "Delete")
    return;
  const deleteArgs = deleteArgsFor(node.entityKind, node.entityId);
  if (!deleteArgs) {
    vscode15.window.showErrorMessage(
      `SRS: Delete not supported for '${node.entityKind}'.`
    );
    return;
  }
  try {
    await cli.runOk(repo.rootPath, deleteArgs);
    treeProvider.refresh();
    vscode15.window.showInformationMessage(
      `SRS: ${node.entityKind} deleted.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode15.window.showErrorMessage(`SRS: Failed to delete entity: ${msg}`);
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

// src/commands/graphCommands.ts
var vscode17 = __toESM(require("vscode"));

// src/graph/GraphPanel.ts
var vscode16 = __toESM(require("vscode"));
var GraphPanel = class _GraphPanel {
  constructor(_context, _key, title, _repoPath) {
    this._context = _context;
    this._key = _key;
    this._repoPath = _repoPath;
    this._panel = vscode16.window.createWebviewPanel(
      "srsGraph",
      `Relations: ${title}`,
      { viewColumn: vscode16.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [],
        retainContextWhenHidden: true
      }
    );
    this._panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "openEntity" && typeof msg.id === "string") {
        vscode16.commands.executeCommand("srs.openEntityById", msg.id, msg.kind ?? "note", this._repoPath);
      }
    });
    this._panel.onDidDispose(() => {
      _GraphPanel._panels.delete(this._key);
    });
  }
  static {
    this._panels = /* @__PURE__ */ new Map();
  }
  static async show(context, cli, repoPath, repoTitle) {
    const key = `graph:${repoPath}`;
    const existing = _GraphPanel._panels.get(key);
    if (existing) {
      existing._panel.reveal(vscode16.ViewColumn.Active);
      await existing._load(cli, repoPath);
      return;
    }
    const instance = new _GraphPanel(context, key, repoTitle, repoPath);
    _GraphPanel._panels.set(key, instance);
    await instance._load(cli, repoPath);
  }
  async _load(cli, repoPath) {
    this._panel.webview.html = loadingHtml();
    try {
      const [relPayload, notePayload, recordPayload] = await Promise.all([
        cli.runOk(repoPath, ["relation", "list"]),
        cli.runOk(repoPath, ["note", "list"]).catch(() => ({ notes: [] })),
        cli.runOk(repoPath, ["record", "list"]).catch(() => ({ records: [] }))
      ]);
      const labelMap = /* @__PURE__ */ new Map();
      const kindMap = /* @__PURE__ */ new Map();
      for (const n of notePayload.notes) {
        labelMap.set(n.instanceId, n.title);
        kindMap.set(n.instanceId, "note");
      }
      for (const r of recordPayload.records) {
        labelMap.set(r.instanceId, r.typeName);
        kindMap.set(r.instanceId, "record");
      }
      const nodeIds = /* @__PURE__ */ new Set();
      const edges = [];
      for (const r of relPayload.relations) {
        nodeIds.add(r.sourceId);
        nodeIds.add(r.targetId);
        edges.push({
          id: r.relationId,
          source: r.sourceId,
          target: r.targetId,
          label: r.relationType
        });
      }
      const nodes = Array.from(nodeIds).map((id) => ({
        id,
        label: labelMap.get(id) ?? id.slice(0, 8),
        kind: kindMap.get(id) ?? "note"
      }));
      this._panel.webview.html = graphHtml(nodes, edges);
    } catch (err) {
      this._panel.webview.html = errorHtml(String(err));
    }
  }
  dispose() {
    this._panel.dispose();
  }
};
function loadingHtml() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
  font-family:var(--vscode-font-family);color:var(--vscode-foreground);
  background:var(--vscode-editor-background)}</style>
  </head><body><p>Loading relation graph\u2026</p></body></html>`;
}
function errorHtml(msg) {
  const safe = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);
  background:var(--vscode-editor-background);padding:2em}</style>
  </head><body><h2>Failed to load graph</h2><pre>${safe}</pre></body></html>`;
}
function graphHtml(nodes, edges) {
  const nodesJson = JSON.stringify(nodes);
  const edgesJson = JSON.stringify(edges);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0; overflow: hidden;
    background: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    user-select: none;
  }
  #toolbar {
    position: absolute; top: 8px; left: 8px; z-index: 10;
    display: flex; gap: 6px; align-items: center;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; padding: 3px 10px; cursor: pointer; border-radius: 3px;
    font-size: 0.85em;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #info {
    font-size: 0.8em; color: var(--vscode-descriptionForeground); padding: 2px 6px;
  }
  #empty {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: var(--vscode-descriptionForeground); font-style: italic;
    display: none;
  }
  svg { display: block; width: 100vw; height: 100vh; }
  .edge { stroke: var(--vscode-editorWidget-border, #555); stroke-width: 1.5; fill: none; }
  .edge-label {
    font-size: 10px; fill: var(--vscode-descriptionForeground);
    pointer-events: none; text-anchor: middle;
  }
  .node circle {
    fill: var(--vscode-badge-background, #0078d4);
    stroke: var(--vscode-focusBorder, #007acc);
    stroke-width: 1.5; cursor: pointer;
  }
  .node circle:hover { fill: var(--vscode-button-hoverBackground, #005a9e); }
  .node.pinned circle { stroke: var(--vscode-charts-yellow, #f9b700); stroke-width: 2.5; }
  .node text {
    font-size: 11px; fill: var(--vscode-foreground);
    pointer-events: none; dominant-baseline: middle; text-anchor: middle;
  }
  .arrow { fill: var(--vscode-editorWidget-border, #555); }
</style>
</head>
<body>
<div id="toolbar">
  <button id="btnReset">Reset layout</button>
  <span id="info"></span>
</div>
<div id="empty">No relations in this repository.</div>
<svg id="svg">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="14" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" class="arrow"/>
    </marker>
  </defs>
  <g id="root">
    <g id="edgeGroup"></g>
    <g id="nodeGroup"></g>
  </g>
</svg>
<script>
(function() {
  const NODES = ${nodesJson};
  const EDGES = ${edgesJson};

  const vscode = acquireVsCodeApi();

  const svg = document.getElementById('svg');
  const root = document.getElementById('root');
  const edgeGroup = document.getElementById('edgeGroup');
  const nodeGroup = document.getElementById('nodeGroup');
  const info = document.getElementById('info');

  if (NODES.length === 0) {
    document.getElementById('empty').style.display = 'block';
    return;
  }

  info.textContent = NODES.length + ' nodes \xB7 ' + EDGES.length + ' edges';

  // ---- Layout state ----
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;

  // Initialise node positions in a circle
  const pos = new Map(); // id -> {x, y, vx, vy, pinned}
  NODES.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / NODES.length;
    const r = Math.min(W(), H()) * 0.32;
    pos.set(n.id, {
      x: W() / 2 + r * Math.cos(angle),
      y: H() / 2 + r * Math.sin(angle),
      vx: 0, vy: 0,
      pinned: false,
    });
  });

  // Build adjacency for edge bundles
  const edgePairs = new Map(); // "a|b" -> count (for multi-edge offset)

  // ---- DOM elements ----
  const edgeEls = EDGES.map((e, i) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('marker-end', 'url(#arrow)');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'edge-label');
    text.textContent = e.label;
    edgeGroup.appendChild(path);
    edgeGroup.appendChild(text);
    return { path, text, edge: e };
  });

  const nodeEls = NODES.map((n) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'node');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '20');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const label = n.label.length > 12 ? n.label.slice(0, 11) + '\u2026' : n.label;
    text.textContent = label;
    g.appendChild(circle);
    g.appendChild(text);
    nodeGroup.appendChild(g);

    // Drag
    let dragging = false;
    let dragOx = 0, dragOy = 0;
    circle.addEventListener('mousedown', (ev) => {
      ev.stopPropagation();
      dragging = true;
      const p = pos.get(n.id);
      const svgPt = svgPoint(ev);
      dragOx = svgPt.x - p.x;
      dragOy = svgPt.y - p.y;
      p.pinned = true;
      p.vx = 0; p.vy = 0;
      g.classList.add('pinned');
    });
    circle.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      const p = pos.get(n.id);
      p.pinned = false;
      g.classList.remove('pinned');
    });
    circle.addEventListener('click', (ev) => {
      if (!dragging) {
        vscode.postMessage({ type: 'openEntity', id: n.id, kind: n.kind });
      }
    });

    svg.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      const p = pos.get(n.id);
      const svgPt = svgPoint(ev);
      p.x = svgPt.x - dragOx;
      p.y = svgPt.y - dragOy;
      p.vx = 0; p.vy = 0;
    });
    svg.addEventListener('mouseup', () => { dragging = false; });

    // Tooltip
    g.setAttribute('title', n.id);

    return { g, circle, text, node: n };
  });

  // SVG pan/zoom
  let panX = 0, panY = 0, scale = 1;
  let panning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;

  svg.addEventListener('mousedown', (ev) => {
    if (ev.target === svg || ev.target === root) {
      panning = true;
      panStartX = ev.clientX;
      panStartY = ev.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
    }
  });
  svg.addEventListener('mousemove', (ev) => {
    if (!panning) return;
    panX = panStartPanX + (ev.clientX - panStartX);
    panY = panStartPanY + (ev.clientY - panStartY);
    applyTransform();
  });
  svg.addEventListener('mouseup', () => { panning = false; });
  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.1, Math.min(5, scale * delta));
    applyTransform();
  }, { passive: false });

  function applyTransform() {
    root.setAttribute('transform', \`translate(\${panX},\${panY}) scale(\${scale})\`);
  }

  document.getElementById('btnReset').addEventListener('click', () => {
    panX = 0; panY = 0; scale = 1;
    applyTransform();
    NODES.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / NODES.length;
      const r = Math.min(W(), H()) * 0.32;
      const p = pos.get(n.id);
      p.x = W() / 2 + r * Math.cos(angle);
      p.y = H() / 2 + r * Math.sin(angle);
      p.vx = 0; p.vy = 0;
      p.pinned = false;
    });
    nodeEls.forEach(({g}) => g.classList.remove('pinned'));
  });

  // ---- Force simulation ----
  const REPULSION = 4000;
  const SPRING_LEN = 140;
  const SPRING_K = 0.04;
  const DAMPING = 0.85;
  const CENTER_K = 0.008;

  function tick() {
    const nodes = NODES.map(n => pos.get(n.id));

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy + 1;
        const dist = Math.sqrt(dist2);
        const force = REPULSION / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
        if (!b.pinned) { b.vx += fx; b.vy += fy; }
      }
    }

    // Spring (edges)
    for (const e of EDGES) {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const stretch = dist - SPRING_LEN;
      const force = SPRING_K * stretch;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) { a.vx += fx; a.vy += fy; }
      if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
    }

    // Weak center pull
    const cx = W() / 2, cy = H() / 2;
    for (const p of nodes) {
      if (!p.pinned) {
        p.vx += (cx - p.x) * CENTER_K;
        p.vy += (cy - p.y) * CENTER_K;
      }
    }

    // Integrate
    for (const p of nodes) {
      if (p.pinned) continue;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }

    // Update DOM
    nodeEls.forEach(({ g, text, node }) => {
      const p = pos.get(node.id);
      g.setAttribute('transform', \`translate(\${p.x},\${p.y})\`);
    });

    edgeEls.forEach(({ path, text, edge }) => {
      const a = pos.get(edge.source), b = pos.get(edge.target);
      if (!a || !b) return;
      // Self-loop
      if (edge.source === edge.target) {
        const lx = a.x + 30, ly = a.y - 30;
        path.setAttribute('d', \`M \${a.x} \${a.y} C \${lx} \${a.y}, \${lx} \${ly}, \${a.x} \${a.y}\`);
        text.setAttribute('x', String(lx));
        text.setAttribute('y', String(ly - 6));
        return;
      }
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Shorten to node radius
      const r = 22;
      const sx = a.x + (dx / dist) * r, sy = a.y + (dy / dist) * r;
      const ex = b.x - (dx / dist) * r, ey = b.y - (dy / dist) * r;
      path.setAttribute('d', \`M \${sx} \${sy} L \${ex} \${ey}\`);
      text.setAttribute('x', String((sx + ex) / 2));
      text.setAttribute('y', String((sy + ey) / 2 - 5));
    });

    requestAnimationFrame(tick);
  }

  tick();

  // ---- Helpers ----
  function svgPoint(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = root.getScreenCTM();
    return pt.matrixTransform(ctm ? ctm.inverse() : undefined);
  }
})();
</script>
</body>
</html>`;
}

// src/commands/graphCommands.ts
function registerGraphCommands(context, cli, repoProvider, entityProvider) {
  context.subscriptions.push(
    vscode17.commands.registerCommand(
      "srs.showRelationGraph",
      () => cmdShowRelationGraph(context, cli, repoProvider)
    ),
    vscode17.commands.registerCommand(
      "srs.openEntityById",
      (id, kind, repoPath) => cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider)
    )
  );
}
async function cmdShowRelationGraph(context, cli, repoProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode17.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  try {
    await GraphPanel.show(context, cli, repo.rootPath, repo.title);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode17.window.showErrorMessage(`SRS: Failed to open relation graph: ${msg}`);
  }
}
async function cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider) {
  const repo = repoProvider.active;
  if (!repo)
    return;
  const entityKind = kind;
  try {
    const uri = entityUri(repo.repositoryId, entityKind, id);
    const doc = await vscode17.workspace.openTextDocument(uri);
    await vscode17.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode17.ViewColumn.Beside,
      preserveFocus: false
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode17.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}

// src/tree/NavigatorTreeDataProvider.ts
var vscode18 = __toESM(require("vscode"));
var EmptyNode = class extends vscode18.TreeItem {
  constructor(message) {
    super(message, vscode18.TreeItemCollapsibleState.None);
    this.contextValue = "srsNavEmpty";
  }
};
var RelationTypeGroupNode = class extends vscode18.TreeItem {
  constructor(relationType, peerIds, direction) {
    const arrow = direction === "outgoing" ? "\u2192" : "\u2190";
    super(
      `${arrow} ${relationType} (${peerIds.length})`,
      vscode18.TreeItemCollapsibleState.Collapsed
    );
    this.relationType = relationType;
    this.peerIds = peerIds;
    this.direction = direction;
    this.contextValue = "srsNavRelGroup";
    this.tooltip = `${direction} ${relationType} relations`;
  }
};
var RelationRootNode = class extends EntityNode {
  constructor(entityId, entityKind, label, getArgs) {
    super(entityId, entityKind, label, getArgs);
    this.collapsibleState = vscode18.TreeItemCollapsibleState.Collapsed;
  }
};
var DocViewNode = class extends vscode18.TreeItem {
  constructor(viewId, label, sections) {
    super(label, vscode18.TreeItemCollapsibleState.Collapsed);
    this.viewId = viewId;
    this.sections = sections;
    this.contextValue = "srsNavDocView";
    this.tooltip = viewId;
  }
};
var DocViewSectionNode = class extends vscode18.TreeItem {
  constructor(sectionId, label, semanticObjectType) {
    super(
      label,
      semanticObjectType ? vscode18.TreeItemCollapsibleState.Collapsed : vscode18.TreeItemCollapsibleState.None
    );
    this.sectionId = sectionId;
    this.semanticObjectType = semanticObjectType;
    this.contextValue = "srsNavSection";
    this.tooltip = semanticObjectType ? `Type: ${semanticObjectType}` : sectionId;
  }
};
var ContainerRootNode = class extends vscode18.TreeItem {
  constructor(containerId2, label, containerType) {
    super(label, vscode18.TreeItemCollapsibleState.Collapsed);
    this.containerId = containerId2;
    this.containerType = containerType;
    this.contextValue = "srsNavContainer";
    this.description = containerType;
    this.tooltip = containerId2;
  }
};
var NavigatorTreeDataProvider = class {
  constructor(cli, repoProvider) {
    this.cli = cli;
    this.repoProvider = repoProvider;
    this._onDidChangeTreeData = new vscode18.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._mode = "relations";
    this._disposables = [];
    this._disposables.push(
      repoProvider.onDidChangeActive(() => this.refresh())
    );
  }
  get mode() {
    return this._mode;
  }
  setMode(mode) {
    this._mode = mode;
    this.refresh();
  }
  refresh() {
    this._relations = void 0;
    this._labelMap = void 0;
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    return element;
  }
  async getChildren(element) {
    const repo = this.repoProvider.active;
    if (!repo)
      return [new EmptyNode("No active SRS repository")];
    if (!element) {
      return this._getRoots(repo.rootPath);
    }
    if (element instanceof RelationRootNode) {
      return this._getRelationGroups(element.entityId, repo.rootPath);
    }
    if (element instanceof RelationTypeGroupNode) {
      return element.peerIds.map(
        (p) => new EntityNode(
          p.id,
          p.kind,
          p.label,
          [p.kind === "record" ? "record" : "note", "get", p.id]
        )
      );
    }
    if (element instanceof DocViewNode) {
      return element.sections.map(
        (s) => new DocViewSectionNode(s.sectionId, s.title, s.semanticObjectType)
      );
    }
    if (element instanceof DocViewSectionNode) {
      return this._getSectionRecords(element.semanticObjectType, repo.rootPath);
    }
    if (element instanceof ContainerRootNode) {
      return this._getContainerMembers(element.containerId, repo.rootPath);
    }
    return [];
  }
  // ---- Root loaders ----
  async _getRoots(repoPath) {
    switch (this._mode) {
      case "relations":
        return this._getRelationRoots(repoPath);
      case "document-views":
        return this._getDocViewRoots(repoPath);
      case "containers":
        return this._getContainerRoots(repoPath);
    }
  }
  async _getRelationRoots(repoPath) {
    const [relations, labelMap] = await this._ensureRelationData(repoPath);
    if (relations.length === 0)
      return [new EmptyNode("No relations in this repository")];
    const rootIds = new Set(relations.map((r) => r.sourceId));
    return Array.from(rootIds).map((id) => {
      const info = labelMap.get(id);
      return new RelationRootNode(
        id,
        info?.kind ?? "record",
        info?.label ?? id.slice(0, 8),
        [(info?.kind ?? "record") === "note" ? "note" : "record", "get", id]
      );
    });
  }
  async _getDocViewRoots(repoPath) {
    try {
      const payload = await this.cli.runOk(repoPath, ["document-view", "list"]);
      if (payload.documentViews.length === 0)
        return [new EmptyNode("No document views in this repository")];
      const nodes = await Promise.all(
        payload.documentViews.map(async (dv) => {
          const sections = await this._fetchDocViewSections(dv.id, repoPath);
          return new DocViewNode(dv.id, `${dv.namespace}/${dv.name}`, sections);
        })
      );
      return nodes;
    } catch {
      return [new EmptyNode("Failed to load document views")];
    }
  }
  async _fetchDocViewSections(viewId, repoPath) {
    try {
      const payload = await this.cli.runOk(repoPath, ["document-view", "get", viewId]);
      return payload.documentView.sections.map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        semanticObjectType: s.source?.semanticObjectType
      }));
    } catch {
      return [];
    }
  }
  async _getContainerRoots(repoPath) {
    try {
      const payload = await this.cli.runOk(repoPath, ["container", "list"]);
      if (payload.containers.length === 0)
        return [new EmptyNode("No containers in this repository")];
      return payload.containers.map(
        (c) => new ContainerRootNode(c.containerId, c.title, c.containerType)
      );
    } catch {
      return [new EmptyNode("Failed to load containers")];
    }
  }
  // ---- Child loaders ----
  async _getRelationGroups(entityId, repoPath) {
    const [relations, labelMap] = await this._ensureRelationData(repoPath);
    const outgoing = /* @__PURE__ */ new Map();
    const incoming = /* @__PURE__ */ new Map();
    for (const r of relations) {
      if (r.sourceId === entityId) {
        const info = labelMap.get(r.targetId);
        const entry = { id: r.targetId, kind: info?.kind ?? "record", label: info?.label ?? r.targetId.slice(0, 8) };
        const list = outgoing.get(r.relationType) ?? [];
        list.push(entry);
        outgoing.set(r.relationType, list);
      }
      if (r.targetId === entityId) {
        const info = labelMap.get(r.sourceId);
        const entry = { id: r.sourceId, kind: info?.kind ?? "record", label: info?.label ?? r.sourceId.slice(0, 8) };
        const list = incoming.get(r.relationType) ?? [];
        list.push(entry);
        incoming.set(r.relationType, list);
      }
    }
    const nodes = [];
    for (const [type, peers] of outgoing) {
      nodes.push(new RelationTypeGroupNode(type, peers, "outgoing"));
    }
    for (const [type, peers] of incoming) {
      nodes.push(new RelationTypeGroupNode(type, peers, "incoming"));
    }
    if (nodes.length === 0)
      return [new EmptyNode("No relations")];
    return nodes;
  }
  async _getSectionRecords(semanticObjectType, repoPath) {
    if (!semanticObjectType)
      return [new EmptyNode("No type binding for this section")];
    try {
      const payload = await this.cli.runOk(repoPath, [
        "record",
        "list",
        "--type",
        semanticObjectType
      ]);
      if (payload.records.length === 0)
        return [new EmptyNode("No records")];
      return payload.records.map(
        (r) => new EntityNode(
          r.instanceId,
          "record",
          r.typeName,
          ["record", "get", r.instanceId]
        )
      );
    } catch {
      return [new EmptyNode(`Failed to load records for ${semanticObjectType}`)];
    }
  }
  async _getContainerMembers(containerId2, repoPath) {
    try {
      const payload = await this.cli.runOk(
        repoPath,
        ["container", "members", "list", containerId2]
      );
      if (payload.memberInstanceIds.length === 0)
        return [new EmptyNode("No members")];
      const labelMap = await this._ensureLabelMap(repoPath);
      return payload.memberInstanceIds.map((id) => {
        const info = labelMap.get(id);
        return new EntityNode(
          id,
          info?.kind ?? "record",
          info?.label ?? id.slice(0, 8),
          [(info?.kind ?? "record") === "note" ? "note" : "record", "get", id]
        );
      });
    } catch {
      return [new EmptyNode("Failed to load members")];
    }
  }
  // ---- Shared data helpers ----
  async _ensureRelationData(repoPath) {
    if (!this._relations) {
      const payload = await this.cli.runOk(repoPath, ["relation", "list"]);
      this._relations = payload.relations;
    }
    const labelMap = await this._ensureLabelMap(repoPath);
    return [this._relations, labelMap];
  }
  async _ensureLabelMap(repoPath) {
    if (this._labelMap)
      return this._labelMap;
    const map = /* @__PURE__ */ new Map();
    const [noteResult, recordResult] = await Promise.allSettled([
      this.cli.runOk(repoPath, ["note", "list"]),
      this.cli.runOk(repoPath, ["record", "list"])
    ]);
    if (noteResult.status === "fulfilled") {
      for (const n of noteResult.value.notes) {
        map.set(n.instanceId, { label: n.title, kind: "note" });
      }
    }
    if (recordResult.status === "fulfilled") {
      for (const r of recordResult.value.records) {
        map.set(r.instanceId, { label: r.typeName, kind: "record" });
      }
    }
    this._labelMap = map;
    return map;
  }
  dispose() {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
};

// src/commands/navigatorCommands.ts
var vscode19 = __toESM(require("vscode"));
function registerNavigatorCommands(context, navigator) {
  context.subscriptions.push(
    vscode19.commands.registerCommand(
      "srs.navigatorRelations",
      () => setMode(navigator, "relations")
    ),
    vscode19.commands.registerCommand(
      "srs.navigatorDocumentViews",
      () => setMode(navigator, "document-views")
    ),
    vscode19.commands.registerCommand(
      "srs.navigatorContainers",
      () => setMode(navigator, "containers")
    ),
    vscode19.commands.registerCommand(
      "srs.navigatorRefresh",
      () => navigator.refresh()
    )
  );
}
function setMode(navigator, mode) {
  navigator.setMode(mode);
  vscode19.commands.executeCommand("setContext", "srs.navigatorMode", mode);
}

// src/extension.ts
async function activate(context) {
  const outputChannel = vscode20.window.createOutputChannel("SRS");
  context.subscriptions.push(outputChannel);
  const cli = new CliClient(outputChannel);
  const repoProvider = new RepositoryProvider(cli);
  const attention = new AttentionManager(context.workspaceState, cli);
  const treeProvider = new SrsTreeDataProvider(cli, repoProvider, attention);
  const navigatorProvider = new NavigatorTreeDataProvider(cli, repoProvider);
  const statusBarItem = new ContainerStatusBarItem(attention);
  const schemaProvider = new SchemaProvider(context.extensionUri);
  const entityDocProvider = new EntityDocumentProvider(cli, repoProvider);
  const diagnosticsProvider = new DiagnosticsProvider(cli, repoProvider);
  context.subscriptions.push(
    repoProvider,
    treeProvider,
    navigatorProvider,
    attention,
    statusBarItem,
    schemaProvider,
    entityDocProvider,
    diagnosticsProvider,
    vscode20.workspace.registerTextDocumentContentProvider(
      ENTITY_SCHEME,
      entityDocProvider
    )
  );
  const treeView = vscode20.window.createTreeView("srsRepositoryTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);
  const navigatorView = vscode20.window.createTreeView("srsNavigatorTree", {
    treeDataProvider: navigatorProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(navigatorView);
  vscode20.commands.executeCommand("setContext", "srs.navigatorMode", "relations");
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
    vscode20.workspace.onDidSaveTextDocument((doc) => {
      const repo = repoProvider.active;
      if (!repo)
        return;
      const config = vscode20.workspace.getConfiguration("srs");
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
  registerEditCommands(context, cli, repoProvider, treeProvider);
  registerGraphCommands(context, cli, repoProvider, entityDocProvider);
  registerNavigatorCommands(context, navigatorProvider);
  await autoDetectRepository(cli, repoProvider);
  const activeRepo = repoProvider.active;
  if (activeRepo) {
    await attention.restore(activeRepo.rootPath);
    statusBarItem.show();
  }
}
async function autoDetectRepository(cli, repoProvider) {
  const config = vscode20.workspace.getConfiguration("srs");
  const configuredPath = config.get("repository.path", null);
  if (configuredPath) {
    const repo = await repoProvider.probe(configuredPath);
    if (repo) {
      repoProvider.setActive(repo);
    } else {
      const action = "Open Settings";
      const choice = await vscode20.window.showWarningMessage(
        `SRS: Configured path '${configuredPath}' is not a valid SRS repository.`,
        action
      );
      if (choice === action) {
        vscode20.commands.executeCommand(
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
    vscode20.window.showInformationMessage(
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
