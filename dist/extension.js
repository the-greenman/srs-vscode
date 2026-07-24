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
var vscode24 = __toESM(require("vscode"));

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
function buildRawArgv(subcommandArgs, options) {
  const args = ["--format", "json"];
  if (options?.pretty) {
    args.push("--pretty");
  }
  args.push(...subcommandArgs);
  return args;
}

// src/cli/CliClient.ts
var CliClient = class _CliClient {
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
    return this._exec(
      buildArgv(repoPath, subcommandArgs, options),
      subcommandArgs[0] ?? "unknown",
      options
    );
  }
  // Run a command WITHOUT injecting --repo (buildRawArgv). For commands that take
  // file paths as arguments rather than a loaded repo — e.g. `archive unpack`.
  async runRaw(subcommandArgs, options) {
    return this._exec(
      buildRawArgv(subcommandArgs, options),
      subcommandArgs[0] ?? "unknown",
      options
    );
  }
  // Spawn the srs binary with a fully-built argv and parse the JSON envelope.
  async _exec(args, commandHint, options) {
    const binary = this.binaryPath;
    if (this.tracing) {
      this.outputChannel.appendLine(`[srs] ${binary} ${args.join(" ")}`);
    }
    return new Promise((resolve2, reject) => {
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
          resolve2(parseEnvelope(stdout, commandHint));
        } catch (err) {
          reject(err);
        }
      });
    });
  }
  // Run and assert ok:true; throw CliError on ok:false.
  async runOk(repoPath, subcommandArgs, options) {
    return _CliClient._assertOk(
      await this.run(repoPath, subcommandArgs, options),
      subcommandArgs
    );
  }
  // runRaw + assert ok:true; throw CliError on ok:false.
  async runRawOk(subcommandArgs, options) {
    return _CliClient._assertOk(
      await this.runRaw(subcommandArgs, options),
      subcommandArgs
    );
  }
  static _assertOk(envelope, subcommandArgs) {
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
        title: payload.repoMap.repository.title ?? payload.repoMap.repository.repositoryId ?? rootPath,
        repositoryId: payload.repoMap.repository.repositoryId ?? rootPath,
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
    vscode2.commands.executeCommand(
      "setContext",
      "srs.activeRepoIsArchive",
      repo?.archivePath !== void 0
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
      this.setActive({ ...updated, archivePath: this._active.archivePath });
    }
  }
  dispose() {
    this._onDidChangeActive.dispose();
  }
};

// src/tree/SrsTreeDataProvider.ts
var vscode3 = __toESM(require("vscode"));
function entityKindToContext(kind) {
  return kind.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}
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
    this.contextValue = `srsEntity.${entityKindToContext(entityKind)}`;
    this.tooltip = `${entityKind}: ${entityId}`;
    this.description = entityId.slice(0, 8);
    this.command = {
      command: "srs.openEntityDefault",
      title: "Open",
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
    extractItems: (p) => p.terms.map((t) => ({
      id: t.id,
      label: t.label ?? t.key
    })),
    getArgs: (id) => ["tag", "get", id]
  },
  record: {
    listArgs: ["record", "list"],
    extractItems: (p) => p.records.map((r) => ({
      id: r.instanceId,
      label: r.displayLabel
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
      label: `${pr.namespace}/${pr.name} v${pr.version}`
    })),
    getArgs: (id) => ["protocol", "get", id]
  },
  blueprint: {
    listArgs: ["blueprint", "list"],
    extractItems: (p) => p.blueprints.map((b) => ({
      id: b.blueprintId,
      label: `${b.namespace}/${b.name} v${b.version}`
    })),
    getArgs: (id) => ["blueprint", "get", id]
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
  theme: {
    listArgs: ["theme", "list"],
    extractItems: (p) => p.themes.map((t) => ({
      id: t.id,
      label: `${t.namespace}/${t.name}`
    })),
    getArgs: (id) => ["theme", "get", id]
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
  ["blueprint", "Blueprints"],
  ["view", "Views"],
  ["document-view", "Document Views"],
  ["theme", "Themes"],
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
  // Instance files are always `.json`. `**` after the folder matches tier-nested
  // layouts too (e.g. an unpacked archive's records/tier-2/*.json). `.srsj`/`.srs`
  // are whole-repo bundle extensions, never per-instance files — do not glob them.
  { glob: "**/records/**/*.json", schema: "schemas/2.0/record.json" },
  { glob: "**/notes/**/*.json", schema: "schemas/2.0/note.json" },
  { glob: "**/typed-records/**/*.json", schema: "schemas/2.0/typed-record.json" },
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
      const uri = d.path ? vscode8.Uri.file(path.join(repo.rootPath, d.path)).toString() : vscode8.Uri.file(path.join(repo.rootPath, "manifest.json")).toString();
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
    case "error":
      return vscode8.DiagnosticSeverity.Error;
    case "warning":
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
    ),
    vscode9.commands.registerCommand(
      "srs.openEntityDefault",
      (node) => cmdOpenEntityDefault(repoProvider, entityProvider, node)
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
          const sev = (d.severity ?? "info").toUpperCase().padEnd(7);
          const loc = d.path ? ` [${d.path}]` : "";
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
var PREVIEW_KINDS = /* @__PURE__ */ new Set(["note", "record", "container"]);
var EDIT_KINDS = /* @__PURE__ */ new Set(["note", "tag", "record"]);
async function cmdOpenEntityDefault(repoProvider, entityProvider, node) {
  if (!(node instanceof EntityNode))
    return;
  if (PREVIEW_KINDS.has(node.entityKind)) {
    return vscode9.commands.executeCommand("srs.previewEntity", node);
  }
  if (EDIT_KINDS.has(node.entityKind)) {
    return vscode9.commands.executeCommand("srs.editEntity", node);
  }
  return cmdOpenEntity(repoProvider, entityProvider, node);
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
var vscode12 = __toESM(require("vscode"));

// src/tree/NavigatorTreeDataProvider.ts
var vscode10 = __toESM(require("vscode"));
var EmptyNode = class extends vscode10.TreeItem {
  constructor(message) {
    super(message, vscode10.TreeItemCollapsibleState.None);
    this.contextValue = "srsNavEmpty";
  }
};
var RelationTypeGroupNode = class extends vscode10.TreeItem {
  constructor(relationType, peerIds, direction) {
    const arrow = direction === "outgoing" ? "\u2192" : "\u2190";
    super(
      `${arrow} ${relationType} (${peerIds.length})`,
      vscode10.TreeItemCollapsibleState.Collapsed
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
    this.collapsibleState = vscode10.TreeItemCollapsibleState.Collapsed;
  }
};
var DocViewNode = class extends vscode10.TreeItem {
  constructor(viewId, label, sections) {
    super(label, vscode10.TreeItemCollapsibleState.Collapsed);
    this.viewId = viewId;
    this.sections = sections;
    this.contextValue = "srsNavDocView";
    this.tooltip = viewId;
  }
};
var DocViewSectionNode = class extends vscode10.TreeItem {
  constructor(sectionId, label, semanticObjectType) {
    super(
      label,
      semanticObjectType ? vscode10.TreeItemCollapsibleState.Collapsed : vscode10.TreeItemCollapsibleState.None
    );
    this.sectionId = sectionId;
    this.semanticObjectType = semanticObjectType;
    this.contextValue = "srsNavSection";
    this.tooltip = semanticObjectType ? `Type: ${semanticObjectType}` : sectionId;
  }
};
var ContainerRootNode = class extends vscode10.TreeItem {
  constructor(containerId2, label, containerType) {
    super(label, vscode10.TreeItemCollapsibleState.Collapsed);
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
    this._onDidChangeTreeData = new vscode10.EventEmitter();
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
          r.displayLabel,
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
        map.set(r.instanceId, { label: r.displayLabel, kind: "record" });
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

// src/preview/PreviewPanel.ts
var vscode11 = __toESM(require("vscode"));
var PreviewPanel = class _PreviewPanel {
  constructor(context, _id, title, html, options) {
    this._id = _id;
    this._panel = vscode11.window.createWebviewPanel(
      "srsPreview",
      title,
      { viewColumn: vscode11.ViewColumn.Active, preserveFocus: false },
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
      existing._panel.reveal(vscode11.ViewColumn.Active);
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
    .field-row--text { flex-direction: column; gap: 0.3em; }
    .field-row--text .field-label { width: auto; }
    .markdown-value h3, .markdown-value h4, .markdown-value h5, .markdown-value h6
      { margin: 0.6em 0 0.2em; font-size: 1em; font-weight: 600; }
    .markdown-value p { margin: 0.4em 0; }
    .markdown-value ul, .markdown-value ol { margin: 0.3em 0; padding-left: 1.4em; }
    .markdown-value li { margin: 0.1em 0; }
    .markdown-value code { background: var(--vscode-textCodeBlock-background);
      padding: 0 3px; border-radius: 2px; font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
    .markdown-value pre { background: var(--vscode-textCodeBlock-background);
      padding: 0.6em 0.8em; border-radius: 4px; overflow-x: auto; margin: 0.4em 0; }
    .markdown-value pre code { background: none; padding: 0; }
    .markdown-value hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 0.6em 0; }
    .markdown-value strong { font-weight: 600; }
    .markdown-value em { font-style: italic; }
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
function registerPreviewCommands(context, cli, repoProvider, attention) {
  context.subscriptions.push(
    vscode12.commands.registerCommand(
      "srs.previewEntity",
      (node) => cmdPreviewEntity(context, cli, repoProvider, node)
    ),
    vscode12.commands.registerCommand(
      "srs.previewRender",
      (node) => cmdPreviewRender(context, cli, repoProvider, attention, node)
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
      case "protocol":
        return await previewProtocol(context, cli, repo.rootPath, node.entityId);
      case "blueprint":
        return await previewBlueprint(context, cli, repo.rootPath, node.entityId);
      default:
        vscode12.window.showInformationMessage(
          `SRS: No preview available for '${node.entityKind}'. Use Open Entity for raw JSON.`
        );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode12.window.showErrorMessage(`SRS: Preview failed: ${msg}`);
  }
}
function resolveContainerContext(node, attention) {
  if (node instanceof EntityNode && node.entityKind === "container") {
    return node.entityId;
  }
  return attention.active?.containerId;
}
function directRenderTarget(node) {
  if (node instanceof DocViewNode) {
    return { viewId: node.viewId, viewLabel: String(node.label) };
  }
  if (node instanceof EntityNode && node.entityKind === "document-view") {
    return { viewId: node.entityId, viewLabel: String(node.label) };
  }
  return void 0;
}
async function cmdPreviewRender(context, cli, repoProvider, attention, node) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode12.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  let viewId;
  let viewLabel;
  let selectedContainerType;
  const direct = directRenderTarget(node);
  if (direct) {
    viewId = direct.viewId;
    viewLabel = direct.viewLabel;
    try {
      const payload = await cli.runOk(repo.rootPath, [
        "document-view",
        "list"
      ]);
      selectedContainerType = payload.documentViews.find((v) => v.id === viewId)?.containerType;
    } catch {
    }
  } else {
    const containerCtxId = resolveContainerContext(node, attention);
    let views = [];
    try {
      if (containerCtxId) {
        const filtered = await cli.runOk(repo.rootPath, [
          "document-view",
          "list-for-container",
          containerCtxId
        ]);
        views = filtered.documentViews;
      }
      if (views.length === 0) {
        const full = await cli.runOk(repo.rootPath, [
          "document-view",
          "list"
        ]);
        views = full.documentViews;
      }
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      vscode12.window.showErrorMessage(`SRS: Failed to list document views: ${msg}`);
      return;
    }
    if (views.length === 0) {
      vscode12.window.showWarningMessage("SRS: No document views defined in this repository.");
      return;
    }
    const picked = await vscode12.window.showQuickPick(
      views.map((v) => ({
        label: `${v.namespace}/${v.name}`,
        description: `v${v.version}`,
        detail: v.id,
        view: v
      })),
      {
        placeHolder: "Select a document view to render",
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (!picked)
      return;
    viewId = picked.view.id;
    viewLabel = picked.label;
    selectedContainerType = picked.view.containerType;
  }
  let containerId2;
  if (selectedContainerType) {
    let containers;
    try {
      const containerPayload = await cli.runOk(repo.rootPath, [
        "container",
        "list"
      ]);
      containers = containerPayload.containers.filter(
        (c) => c.containerType === selectedContainerType
      );
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      vscode12.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
      return;
    }
    if (containers.length === 0) {
      vscode12.window.showWarningMessage(
        `SRS: No containers of type "${selectedContainerType}" found.`
      );
      return;
    }
    const picked = await vscode12.window.showQuickPick(
      containers.map((c) => ({ label: c.title, description: c.containerId, id: c.containerId })),
      { placeHolder: `Select a ${selectedContainerType} to render` }
    );
    if (!picked)
      return;
    containerId2 = picked.id;
  }
  try {
    const args = ["render", "document-view", "--view", viewId];
    if (containerId2)
      args.push("--container", containerId2);
    const payload = await cli.runOk(repo.rootPath, args);
    await openMarkdownPreview(payload.rendered, viewLabel ?? viewId);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode12.window.showErrorMessage(`SRS: Render failed: ${msg}`);
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
  let textFieldSet = /* @__PURE__ */ new Set();
  let relatedItems = [];
  const [typeResult, relResult, noteResult, recordListResult] = await Promise.allSettled([
    cli.runOk(repoPath, ["type", "get", record.typeId]),
    cli.runOk(repoPath, ["relation", "list"]),
    cli.runOk(repoPath, ["note", "list"]),
    cli.runOk(repoPath, ["record", "list"])
  ]);
  if (typeResult.status === "fulfilled") {
    const typeFields = typeResult.value.type.fields;
    for (const f of typeFields) {
      if (f.repeatable)
        repeatableSet.add(f.fieldId);
    }
    const fieldResults = await Promise.allSettled(
      typeFields.map((f) => cli.runOk(repoPath, ["field", "get", f.fieldId]))
    );
    for (let i = 0; i < typeFields.length; i++) {
      const f = typeFields[i];
      const fr = fieldResults[i];
      const fieldName = fr.status === "fulfilled" ? fr.value.field.name : void 0;
      labelMap.set(f.fieldId, f.displayLabel ?? fieldName ?? f.fieldId.slice(0, 8));
      if (fr.status === "fulfilled" && fr.value.field.valueType === "text") {
        textFieldSet.add(fr.value.field.id);
      }
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
        peerLabelMap.set(r.instanceId, { label: r.displayLabel, kind: "record" });
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
  const rows = record.fieldValues.map((fv2) => {
    const label = labelMap.get(fv2.fieldId) ?? fv2.fieldId.slice(0, 8);
    const isText = textFieldSet.has(fv2.fieldId);
    let valueHtml;
    if (repeatableSet.has(fv2.fieldId) && fv2.entries && fv2.entries.length > 0) {
      const items = fv2.entries.map((e) => {
        const v = typeof e.value === "string" ? e.value : JSON.stringify(e.value);
        return isText ? `<li class="markdown-value" data-md="${esc(v)}"></li>` : `<li>${esc(v)}</li>`;
      }).join("");
      valueHtml = `<ul class="repeatable-values">${items}</ul>`;
    } else {
      const v = typeof fv2.value === "string" ? fv2.value : JSON.stringify(fv2.value);
      valueHtml = isText ? `<div class="markdown-value" data-md="${esc(v)}"></div>` : esc(v);
    }
    const rowClass = isText ? "field-row field-row--text" : "field-row";
    return `<div class="${rowClass}">
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
      ${markdownRendererScript()}
      document.querySelectorAll('.markdown-value').forEach(function(el) {
        el.innerHTML = renderMarkdown(el.dataset.md || '');
      });
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
        vscode12.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
      }
    }
  });
}
async function previewContainer(context, cli, repoPath, id) {
  let resolvedView;
  try {
    const viewPayload = await cli.runOk(repoPath, [
      "container",
      "resolve-view",
      id
    ]);
    resolvedView = viewPayload.containerView;
  } catch {
  }
  const title = resolvedView?.root?.displayLabel ?? resolvedView?.members[0]?.displayLabel ?? id.slice(0, 8);
  const members = resolvedView?.members ?? [];
  const columns = resolvedView?.columns ?? [];
  let bodyHtml;
  if (columns.length > 0) {
    const headerCells = columns.map((col) => {
      const cls = col.isIdentityColumn ? ' class="col-identity"' : "";
      return `<th${cls}>${esc(col.displayLabel)}</th>`;
    }).join("");
    const rowsHtml = members.length === 0 ? `<tr><td colspan="${columns.length}" class="empty">No members.</td></tr>` : members.map((m) => {
      const hidden = !m.isVisibleByDefault ? ' class="member-hidden"' : "";
      const cells = columns.map((col) => {
        let cellContent;
        if (col.isIdentityColumn) {
          const label = m.tier === 2 && m.record ? m.record.fieldValues.find((fv2) => fv2.fieldId === col.fieldId)?.value ?? m.displayLabel : m.displayLabel;
          cellContent = `<a class="identity-link" href="#" data-id="${esc(m.instanceId)}" data-kind="${m.tier === 0 ? "note" : "record"}">${esc(label)}</a>`;
        } else if (m.tier === 2 && m.record) {
          const fv2 = m.record.fieldValues.find((f) => f.fieldId === col.fieldId);
          cellContent = fv2 !== void 0 ? esc(String(fv2.value ?? "")) : "";
        } else {
          cellContent = "";
        }
        const cellCls = col.isIdentityColumn ? ' class="col-identity"' : "";
        return `<td${cellCls}>${cellContent}</td>`;
      }).join("");
      return `<tr${hidden}>${cells}</tr>`;
    }).join("");
    const hiddenCount = members.filter((m) => !m.isVisibleByDefault).length;
    const hiddenNote = hiddenCount > 0 ? `<p class="hidden-note">${hiddenCount} member${hiddenCount === 1 ? "" : "s"} hidden by lifecycle state.</p>` : "";
    bodyHtml = `
      <table class="container-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${hiddenNote}
      <script>
        const vscode = acquireVsCodeApi();
        document.querySelectorAll('.identity-link').forEach(function(el) {
          el.addEventListener('click', function(ev) {
            ev.preventDefault();
            vscode.postMessage({ type: 'openEntity', id: el.dataset.id, kind: el.dataset.kind });
          });
        });
      </script>
    `;
  } else {
    const rows = members.map((m) => `<div class="member-row">${esc(m.displayLabel)}</div>`).join("");
    bodyHtml = rows || '<p class="empty">No members.</p>';
  }
  const memberCount = members.length;
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${memberCount} member${memberCount === 1 ? "" : "s"}</div>
    <h2>Members</h2>
    ${bodyHtml}
    <style>
      .container-table { width: 100%; border-collapse: collapse; margin-top: 0.5em; }
      .container-table th, .container-table td { padding: 0.35em 0.6em; border: 1px solid var(--vscode-panel-border, #555); text-align: left; }
      .container-table th { background: var(--vscode-editor-selectionBackground, #264f78); font-weight: 600; }
      .container-table th.col-identity { font-weight: 700; }
      .container-table td.col-identity { font-weight: 600; }
      .identity-link { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; }
      .identity-link:hover { text-decoration: underline; }
      .member-hidden { opacity: 0.45; }
      .hidden-note { font-size: 0.85em; color: var(--vscode-descriptionForeground, #888); margin-top: 0.5em; }
    </style>
  `, { enableScripts: columns.length > 0 });
  PreviewPanel.show(context, `container:${id}`, title, html, columns.length > 0 ? {
    enableScripts: true,
    onMessage: (msg) => {
      const m = msg;
      if (m.type === "openEntity" && m.id && m.kind) {
        vscode12.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
      }
    }
  } : void 0);
}
async function previewProtocol(context, cli, repoPath, id) {
  const [getResult, stagesResult] = await Promise.allSettled([
    cli.runOk(repoPath, ["protocol", "get", id]),
    cli.runOk(repoPath, ["protocol", "stages", id])
  ]);
  const proto = getResult.status === "fulfilled" ? getResult.value.protocol : void 0;
  const stages = stagesResult.status === "fulfilled" ? [...stagesResult.value.stages].sort((a, b) => a.order - b.order) : [];
  const ns = proto?.namespace ?? "";
  const name = proto?.name ?? id.slice(0, 8);
  const version = proto?.version ?? "";
  const title = `${ns}/${name} v${version}`;
  const descHtml = proto?.description ? `<p class="description">${esc(proto.description)}</p>` : "";
  const targetHtml = proto?.targetType ? `<div class="meta">Target type: ${esc(proto.targetType)}</div>` : "";
  const tagsHtml = (proto?.tags ?? []).length > 0 ? `<div class="meta">Tags: ${proto.tags.map((t) => `<code>${esc(t)}</code>`).join(" ")}</div>` : "";
  const stagesHtml = stages.length === 0 ? '<p class="empty">No stages defined.</p>' : stages.map((s) => {
    const deps = s.dependsOn.length > 0 ? `<div class="stage-deps">depends on: ${s.dependsOn.map((d) => esc(d)).join(", ")}</div>` : "";
    return `<div class="stage-row">
          <span class="stage-order">${s.order}</span>
          <div class="stage-body">
            <div class="stage-name">${esc(s.name)}</div>
            ${deps}
          </div>
        </div>`;
  }).join("");
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(id.slice(0, 8))}\u2026</div>
    ${targetHtml}
    ${tagsHtml}
    ${descHtml}
    <h2>Stages (${stages.length})</h2>
    ${stagesHtml}
  `);
  PreviewPanel.show(context, `protocol:${id}`, title, html);
}
async function previewBlueprint(context, cli, repoPath, id) {
  const [getResult, structureResult] = await Promise.allSettled([
    cli.runOk(repoPath, ["blueprint", "get", id]),
    cli.runOk(repoPath, ["blueprint", "structure", id])
  ]);
  const bp = getResult.status === "fulfilled" ? getResult.value.blueprint : void 0;
  const specs = structureResult.status === "fulfilled" ? structureResult.value.relationSpecs : [];
  const ns = bp?.namespace ?? "";
  const name = bp?.name ?? id.slice(0, 8);
  const version = bp?.version ?? "";
  const title = `${ns}/${name} v${version}`;
  const descHtml = bp?.description ? `<p class="description">${esc(bp.description)}</p>` : "";
  const specsHtml = specs.length === 0 ? '<p class="empty">No relation specs defined.</p>' : `<table class="specs-table">
        <thead><tr><th>Relation type</th><th>Source type</th><th>Target type</th><th>Cardinality</th><th>Required</th></tr></thead>
        <tbody>
          ${specs.map((s) => `<tr>
            <td>${esc(s.relationType)}</td>
            <td><code>${esc(s.sourceTypeId.slice(0, 8))}\u2026</code></td>
            <td><code>${esc(s.targetTypeId.slice(0, 8))}\u2026</code></td>
            <td>${s.cardinality ? esc(s.cardinality) : "\u2014"}</td>
            <td>${s.required ? "yes" : "\u2014"}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  const html = wrapHtml(title, `
    <h1>${esc(title)}</h1>
    <div class="meta">${esc(id.slice(0, 8))}\u2026</div>
    ${descHtml}
    <h2>Structure (${specs.length} relation spec${specs.length === 1 ? "" : "s"})</h2>
    ${specsHtml}
  `);
  PreviewPanel.show(context, `blueprint:${id}`, title, html);
}
async function openMarkdownPreview(markdown, _title) {
  const doc = await vscode12.workspace.openTextDocument({
    content: markdown,
    language: "markdown"
  });
  await vscode12.window.showTextDocument(doc, {
    viewColumn: vscode12.ViewColumn.Active,
    preview: true,
    preserveFocus: false
  });
  await vscode12.commands.executeCommand("markdown.showPreview", doc.uri);
}
function markdownRendererScript() {
  return [
    "function renderMarkdown(md) {",
    "  if (!md) return '';",
    "  var h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');",
    "  h = h.replace(/```[\\w]*\\n([\\s\\S]*?)```/g, function(_,c){ return '<pre><code>'+c+'</code></pre>'; });",
    "  h = h.replace(/^#{6}\\s+(.+)$/mg,'<h6>$1</h6>');",
    "  h = h.replace(/^#{5}\\s+(.+)$/mg,'<h5>$1</h5>');",
    "  h = h.replace(/^#{4}\\s+(.+)$/mg,'<h4>$1</h4>');",
    "  h = h.replace(/^#{3}\\s+(.+)$/mg,'<h3>$1</h3>');",
    "  h = h.replace(/^#{2}\\s+(.+)$/mg,'<h4>$1</h4>');",
    "  h = h.replace(/^#\\s+(.+)$/mg,'<h5>$1</h5>');",
    "  h = h.replace(/^---+$/mg,'<hr>');",
    "  h = h.replace(/`([^`]+)`/g,'<code>$1</code>');",
    "  h = h.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g,'<strong><em>$1</em></strong>');",
    "  h = h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');",
    "  h = h.replace(/\\*([^*]+)\\*/g,'<em>$1</em>');",
    "  h = h.replace(/((?:^[*-]\\s+.+$\\n?)+)/mg, function(b){",
    "    return '<ul>'+b.trim().split('\\n').map(function(l){return '<li>'+l.replace(/^[*-]\\s+/,'')+' </li>';}).join('')+'</ul>';",
    "  });",
    "  h = h.replace(/((?:^\\d+\\.\\s+.+$\\n?)+)/mg, function(b){",
    "    return '<ol>'+b.trim().split('\\n').map(function(l){return '<li>'+l.replace(/^\\d+\\.\\s+/,'')+' </li>';}).join('')+'</ol>';",
    "  });",
    "  h = h.replace(/(?:^(?!<)\\S[^\\n]*$\\n?)+/mg, function(b){",
    "    var t=b.trim(); return t ? '<p>'+t.replace(/\\n/g,' ')+'</p>' : '';",
    "  });",
    "  return h;",
    "}"
  ].join("\n");
}

// src/commands/editCommands.ts
var vscode14 = __toESM(require("vscode"));

// src/webview/EntityEditorPanel.ts
var vscode13 = __toESM(require("vscode"));
var EntityEditorPanel = class _EntityEditorPanel {
  constructor(_context, _id, title, html, onSave) {
    this._id = _id;
    this._onSave = onSave;
    this._panel = vscode13.window.createWebviewPanel(
      "srsEditor",
      title,
      { viewColumn: vscode13.ViewColumn.Active, preserveFocus: false },
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
      existing._panel.reveal(vscode13.ViewColumn.Active);
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
var REPEAT_ENTRY_JS = `
  function wireRemoveEntry(btn) {
    btn.addEventListener('click', function() {
      btn.closest('[data-repeat-entry]').remove();
    });
  }
  function addEntry(listId, rows) {
    var list = document.getElementById(listId);
    var entry = document.createElement('div');
    entry.className = 'repeat-entry';
    entry.setAttribute('data-repeat-entry', '');
    entry.innerHTML = '<textarea class="repeat-value" rows="' + (rows || 2) + '"></textarea>' +
      '<button type="button" class="btn-remove-entry" title="Remove">\\u2715</button>';
    list.appendChild(entry);
    entry.querySelector('.repeat-value').focus();
    wireRemoveEntry(entry.querySelector('.btn-remove-entry'));
  }
  document.querySelectorAll('.btn-remove-entry').forEach(wireRemoveEntry);
  document.querySelectorAll('.btn-add-entry[data-target]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      addEntry(btn.getAttribute('data-target'), parseInt(btn.getAttribute('data-rows') || '2', 10));
    });
  });
`;
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
    .group-entries { display: flex; flex-direction: column; gap: 0.8em; margin-bottom: 0.6em; }
    .group-entry { border-left: 2px solid var(--vscode-panel-border); padding-left: 1em; }
    .btn-remove-group-entry {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .btn-remove-group-entry:hover { opacity: 0.7; }
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
function groupFieldValueHtml(f, fv2) {
  const label = f.displayLabel ?? f.fieldId.slice(0, 8);
  const requiredMark = f.required ? ` <span class="required-mark">*</span>` : "";
  if (f.repeatable) {
    const entries = fv2?.entries && fv2.entries.length > 0 ? fv2.entries.map((e) => typeof e.value === "string" ? e.value : JSON.stringify(e.value)) : [""];
    const entryInputs = entries.map((v) => `
        <div class="repeat-entry" data-repeat-entry>
          <textarea class="repeat-value" rows="2">${escText(v)}</textarea>
          <button type="button" class="btn-remove-entry" title="Remove">\u2715</button>
        </div>`).join("");
    return `
      <div class="field" data-field-id="${escAttr(f.fieldId)}" data-repeatable>
        <label>${esc2(label)}${requiredMark}</label>
        <div class="repeat-list">${entryInputs}</div>
        <button type="button" class="btn-add-entry" data-add-repeat>+ Add value</button>
      </div>`;
  }
  const value = fv2 && !fv2.entries ? typeof fv2.value === "string" ? fv2.value : fv2.value == null ? "" : JSON.stringify(fv2.value) : "";
  const required = f.required ? ` required` : "";
  return `
      <div class="field" data-field-id="${escAttr(f.fieldId)}">
        <label>${esc2(label)}${requiredMark}</label>
        <textarea class="group-field-value" rows="2"${required}>${escText(value)}</textarea>
      </div>`;
}
function groupEntryHtml(fields, entry, removable) {
  const fvById = new Map((entry?.fieldValues ?? []).map((fv2) => [fv2.fieldId, fv2]));
  const fieldsHtml = [...fields].sort((a, b) => a.order - b.order).map((f) => groupFieldValueHtml(f, fvById.get(f.fieldId))).join("");
  const removeBtn = removable ? `<div class="section-header"><span></span><button type="button" class="btn-remove-group-entry" title="Remove entry">\u2715</button></div>` : "";
  return `
    <div class="group-entry" data-group-entry data-entry-id="${escAttr(entry?.entryId ?? "")}">
      ${removeBtn}
      ${fieldsHtml}
    </div>`;
}
function groupBlockHtml(g, index, entries) {
  const label = g.label ?? g.groupId;
  const requiredMark = g.required ? ` <span class="required-mark">*</span>` : "";
  const minHint = g.minItems != null ? ` min ${g.minItems}` : "";
  const maxHint = g.maxItems != null ? ` max ${g.maxItems}` : "";
  const repeatHint = g.repeatable && (minHint || maxHint) ? `<div class="hint">Repeatable${minHint}${maxHint}</div>` : "";
  const descriptionHtml = g.description ? `<div class="hint">${esc2(g.description)}</div>` : "";
  const initialEntries = entries.length > 0 ? entries : [void 0];
  const entriesHtml = initialEntries.map((e) => groupEntryHtml(g.fields, e, g.repeatable ?? false)).join("");
  const addEntryBtn = g.repeatable ? `<button type="button" class="btn-add-entry" data-add-group="${index}">+ Add ${esc2(label)}</button>` : "";
  const templateHtml = g.repeatable ? `<template id="group-entry-template-${index}">${groupEntryHtml(g.fields, void 0, true)}</template>` : "";
  return `
    <div class="section-group" data-group data-group-id="${escAttr(g.groupId)}">
      <div class="section-header"><strong>${esc2(label)}${requiredMark}</strong></div>
      ${descriptionHtml}
      <div class="group-entries" id="group-entries-${index}">${entriesHtml}</div>
      ${addEntryBtn}
      ${repeatHint}
      ${templateHtml}
    </div>`;
}
function buildRecordForm(record, fields, groups = []) {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const currentScalar = /* @__PURE__ */ new Map();
  const currentEntries = /* @__PURE__ */ new Map();
  for (const fv2 of record.fieldValues) {
    if (fv2.entries && fv2.entries.length > 0) {
      currentEntries.set(
        fv2.fieldId,
        fv2.entries.map((e) => typeof e.value === "string" ? e.value : JSON.stringify(e.value))
      );
    } else {
      currentScalar.set(
        fv2.fieldId,
        typeof fv2.value === "string" ? fv2.value : JSON.stringify(fv2.value)
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
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);
  const groupValuesByGroupId = /* @__PURE__ */ new Map();
  for (const gv of record.groupValues ?? []) {
    groupValuesByGroupId.set(gv.groupId, gv.entries);
  }
  const groupsHtml = sortedGroups.map((g, gi) => groupBlockHtml(g, gi, groupValuesByGroupId.get(g.groupId) ?? [])).join("");
  const hasGroups = sortedGroups.length > 0;
  const groupJs = hasGroups ? `
    function collectGroupValues() {
      var groupValues = [];
      document.querySelectorAll('[data-group]').forEach(function(groupEl) {
        var groupId = groupEl.getAttribute('data-group-id');
        var entries = [];
        groupEl.querySelectorAll('[data-group-entry]').forEach(function(entryEl) {
          var fieldValues = [];
          entryEl.querySelectorAll('[data-field-id]').forEach(function(fieldEl) {
            var fieldId = fieldEl.getAttribute('data-field-id');
            if (fieldEl.hasAttribute('data-repeatable')) {
              var vals = [];
              fieldEl.querySelectorAll('.repeat-entry .repeat-value').forEach(function(ta) {
                var v = ta.value.trim();
                if (v) vals.push({ value: v });
              });
              if (vals.length > 0) fieldValues.push({ fieldId: fieldId, value: '', entries: vals });
            } else {
              var val = fieldEl.querySelector('.group-field-value').value.trim();
              if (val) fieldValues.push({ fieldId: fieldId, value: val });
            }
          });
          if (fieldValues.length > 0) {
            var entryOut = { fieldValues: fieldValues };
            var entryId = entryEl.getAttribute('data-entry-id');
            if (entryId) entryOut.entryId = entryId;
            entries.push(entryOut);
          }
        });
        groupValues.push({ groupId: groupId, entries: entries });
      });
      return groupValues;
    }

    function wireRemoveGroupEntry(btn) {
      btn.addEventListener('click', function() {
        btn.closest('[data-group-entry]').remove();
      });
    }
    function wireGroupRepeatAdd(btn) {
      btn.addEventListener('click', function() {
        var list = btn.parentElement.querySelector('.repeat-list');
        var entry = document.createElement('div');
        entry.className = 'repeat-entry';
        entry.setAttribute('data-repeat-entry', '');
        entry.innerHTML = '<textarea class="repeat-value" rows="2"></textarea>' +
          '<button type="button" class="btn-remove-entry" title="Remove">\\u2715</button>';
        list.appendChild(entry);
        entry.querySelector('.repeat-value').focus();
        wireRemoveEntry(entry.querySelector('.btn-remove-entry'));
      });
    }
    function wireAddGroupEntry(btn) {
      btn.addEventListener('click', function() {
        var gi = btn.getAttribute('data-add-group');
        var template = document.getElementById('group-entry-template-' + gi);
        var container = document.getElementById('group-entries-' + gi);
        container.appendChild(template.content.cloneNode(true));
        var newEntry = container.lastElementChild;
        wireRemoveGroupEntry(newEntry.querySelector('.btn-remove-group-entry'));
        newEntry.querySelectorAll('.btn-add-entry[data-add-repeat]').forEach(wireGroupRepeatAdd);
      });
    }
    document.querySelectorAll('.btn-remove-group-entry').forEach(wireRemoveGroupEntry);
    document.querySelectorAll('.btn-add-entry[data-add-repeat]').forEach(wireGroupRepeatAdd);
    document.querySelectorAll('.btn-add-entry[data-add-group]').forEach(wireAddGroupEntry);
  ` : "";
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
      var result = { instanceId: instanceId, typeId: typeId, typeName: typeName,
               typeNamespace: typeNamespace, typeVersion: typeVersion,
               createdAt: createdAt, fieldValues: fieldValues };
      ${hasGroups ? "result.groupValues = collectGroupValues();" : ""}
      return result;
    }

    ${REPEAT_ENTRY_JS.trim()}
    ${groupJs}
  </script>`;
  return `
    ${fieldHtml}
    ${groupsHtml}
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
    vscode14.commands.registerCommand(
      "srs.editEntity",
      (node) => cmdEditEntity(context, cli, repoProvider, treeProvider, node)
    ),
    vscode14.commands.registerCommand(
      "srs.createRelation",
      () => cmdCreateRelation(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.createRelationType",
      () => cmdCreateRelationType(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.updateRelationType",
      () => cmdUpdateRelationType(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.deleteRelationType",
      () => cmdDeleteRelationType(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.createView",
      () => cmdCreateView(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.updateView",
      () => cmdUpdateView(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.createDocumentView",
      () => cmdCreateDocumentView(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.updateDocumentView",
      () => cmdUpdateDocumentView(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.createTheme",
      () => cmdCreateTheme(cli, repoProvider, treeProvider)
    ),
    vscode14.commands.registerCommand(
      "srs.updateTheme",
      () => cmdUpdateTheme(cli, repoProvider, treeProvider)
    )
  );
}
async function cmdEditEntity(context, cli, repoProvider, treeProvider, node) {
  if (!(node instanceof EntityNode)) {
    vscode14.window.showWarningMessage(
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
      case "view":
        await editView(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "document-view":
        await editDocumentView(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      case "theme":
        await editTheme(cli, repo.rootPath, node.entityId, treeProvider);
        break;
      default:
        vscode14.window.showInformationMessage(
          `SRS: No form editor for '${node.entityKind}'. Open the entity JSON to edit directly.`
        );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Edit failed: ${msg}`);
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
      const proceed = await vscode14.window.showWarningMessage(
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
      const proceed = await vscode14.window.showWarningMessage(
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
  const fieldGroups = typePayload.type.fieldGroups ?? [];
  const allFieldIds = [.../* @__PURE__ */ new Set([
    ...typeFields.map((f) => f.fieldId),
    ...fieldGroups.flatMap((g) => g.fields.map((f) => f.fieldId))
  ])];
  const fieldResults = await Promise.allSettled(
    allFieldIds.map((fieldId) => cli.runOk(repoPath, ["field", "get", fieldId]))
  );
  const fieldNameById = /* @__PURE__ */ new Map();
  allFieldIds.forEach((fieldId, i) => {
    const fr = fieldResults[i];
    if (fr.status === "fulfilled")
      fieldNameById.set(fieldId, fr.value.field.name);
  });
  const recordData = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeName: record.typeName,
    typeNamespace: record.typeNamespace,
    typeVersion: record.typeVersion,
    createdAt: record.createdAt,
    fieldValues: record.fieldValues,
    groupValues: record.groupValues
  };
  const toFieldData = (f) => ({
    fieldId: f.fieldId,
    displayLabel: f.displayLabel ?? fieldNameById.get(f.fieldId),
    order: f.order,
    required: f.required,
    repeatable: f.repeatable,
    minItems: f.minItems,
    maxItems: f.maxItems
  });
  const fieldData = typeFields.map(toFieldData);
  const groupData = fieldGroups.map((g) => ({
    groupId: g.groupId,
    label: g.label,
    description: g.description,
    order: g.order,
    required: g.required,
    repeatable: g.repeatable,
    minItems: g.minItems,
    maxItems: g.maxItems,
    fields: g.fields.map(toFieldData)
  }));
  const panelTitle = `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`;
  const html = formWrapHtml(panelTitle, buildRecordForm(recordData, fieldData, groupData));
  EntityEditorPanel.show(context, `record:${id}`, panelTitle, html, async (data) => {
    const d = data;
    const refetch = await cli.runOk(repoPath, ["record", "get", id]);
    if (refetch.record.fieldValues.length !== record.fieldValues.length) {
      const proceed = await vscode14.window.showWarningMessage(
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
async function cmdCreateView(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      $schema: "https://srs.semanticops.com/schema/2.0/view.json",
      id: randomUUID(),
      namespace: "com.example",
      name: "my-view",
      version: 1,
      description: "Description of what this view presents.",
      fieldViews: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    null,
    2
  );
  const doc = await vscode14.workspace.openTextDocument({ content: scaffold, language: "json" });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    "SRS: Edit the view definition above, then click Create.",
    "Create",
    "Cancel"
  );
  if (answer !== "Create")
    return;
  try {
    await cli.runOk(repo.rootPath, ["view", "create"], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: View created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to create view: ${msg}`);
  }
}
async function cmdUpdateView(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const picked = await pickView(cli, repo.rootPath);
  if (!picked)
    return;
  await editView(cli, repo.rootPath, picked.id, treeProvider);
}
async function editView(cli, repoPath, id, treeProvider) {
  const payload = await cli.runOk(repoPath, ["view", "get", id]);
  const doc = await vscode14.workspace.openTextDocument({
    content: JSON.stringify(payload.view, null, 2),
    language: "json"
  });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    `SRS: Edit the view definition above, then click Update.`,
    "Update",
    "Cancel"
  );
  if (answer !== "Update")
    return;
  try {
    await cli.runOk(repoPath, ["view", "update", id], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: View updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to update view: ${msg}`);
  }
}
async function cmdCreateDocumentView(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      $schema: "https://srs.semanticops.com/schema/2.0/document-view.json",
      id: randomUUID(),
      namespace: "com.example",
      name: "my-document-view",
      version: 1,
      description: "Description of what document this produces.",
      sections: [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    null,
    2
  );
  const doc = await vscode14.workspace.openTextDocument({ content: scaffold, language: "json" });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    "SRS: Edit the document view definition above, then click Create.",
    "Create",
    "Cancel"
  );
  if (answer !== "Create")
    return;
  try {
    await cli.runOk(repo.rootPath, ["document-view", "create"], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Document view created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to create document view: ${msg}`);
  }
}
async function cmdUpdateDocumentView(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const picked = await pickDocumentView(cli, repo.rootPath);
  if (!picked)
    return;
  await editDocumentView(cli, repo.rootPath, picked.id, treeProvider);
}
async function editDocumentView(cli, repoPath, id, treeProvider) {
  const payload = await cli.runOk(repoPath, ["document-view", "get", id]);
  const doc = await vscode14.workspace.openTextDocument({
    content: JSON.stringify(payload.documentView, null, 2),
    language: "json"
  });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    `SRS: Edit the document view definition above, then click Update.`,
    "Update",
    "Cancel"
  );
  if (answer !== "Update")
    return;
  try {
    await cli.runOk(repoPath, ["document-view", "update", id], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Document view updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to update document view: ${msg}`);
  }
}
async function cmdCreateTheme(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      $schema: "https://srs.semanticops.com/schema/2.0/theme.json",
      id: randomUUID(),
      namespace: "com.example",
      name: "my-theme",
      version: 1,
      description: "Description of this theme and its intended output format.",
      targets: ["html"],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    null,
    2
  );
  const doc = await vscode14.workspace.openTextDocument({ content: scaffold, language: "json" });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    "SRS: Edit the theme definition above, then click Create.",
    "Create",
    "Cancel"
  );
  if (answer !== "Create")
    return;
  try {
    await cli.runOk(repo.rootPath, ["theme", "create"], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Theme created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to create theme: ${msg}`);
  }
}
async function cmdUpdateTheme(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const picked = await pickTheme(cli, repo.rootPath);
  if (!picked)
    return;
  await editTheme(cli, repo.rootPath, picked.id, treeProvider);
}
async function editTheme(cli, repoPath, id, treeProvider) {
  const payload = await cli.runOk(repoPath, ["theme", "get", id]);
  const doc = await vscode14.workspace.openTextDocument({
    content: JSON.stringify(payload.theme, null, 2),
    language: "json"
  });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    `SRS: Edit the theme definition above, then click Update.`,
    "Update",
    "Cancel"
  );
  if (answer !== "Update")
    return;
  try {
    await cli.runOk(repoPath, ["theme", "update", id], { stdin: doc.getText() });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Theme updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to update theme: ${msg}`);
  }
}
async function cmdCreateRelation(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const pickedType = await pickRelationType(cli, repo.rootPath);
  if (!pickedType)
    return;
  const instanceItems = await buildInstanceItems(cli, repo.rootPath);
  if (instanceItems.length === 0) {
    vscode14.window.showWarningMessage(
      "SRS: No instances found to relate. Create some notes or records first."
    );
    return;
  }
  const source = await vscode14.window.showQuickPick(instanceItems, {
    placeHolder: "Select source instance",
    matchOnDescription: true
  });
  if (!source)
    return;
  const target = await vscode14.window.showQuickPick(
    instanceItems.filter((i) => i.id !== source.id),
    { placeHolder: "Select target instance", matchOnDescription: true }
  );
  if (!target)
    return;
  const { randomUUID } = await import("crypto");
  const relationJson = JSON.stringify({
    relationId: randomUUID(),
    relationType: pickedType.relationType,
    sourceInstanceId: source.id,
    targetInstanceId: target.id,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    await cli.runOk(repo.rootPath, ["relation", "create"], {
      stdin: relationJson
    });
    treeProvider.refresh();
    vscode14.window.showInformationMessage(
      `SRS: Relation '${pickedType.relationType}' created.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to create relation: ${msg}`);
  }
}
async function cmdCreateRelationType(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const { randomUUID } = await import("crypto");
  const scaffold = JSON.stringify(
    {
      id: randomUUID(),
      version: 1,
      relationType: "namespace/name",
      namespace: "com.example",
      label: "My relation type",
      description: "Description of what this relation means.",
      category: "association",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    null,
    2
  );
  const doc = await vscode14.workspace.openTextDocument({
    content: scaffold,
    language: "json"
  });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    "SRS: Edit the relation type definition above, then click Create.",
    "Create",
    "Cancel"
  );
  if (answer !== "Create")
    return;
  const content = doc.getText();
  try {
    await cli.runOk(repo.rootPath, ["relation-type", "create"], {
      stdin: content
    });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Relation type created.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to create relation type: ${msg}`);
  }
}
async function cmdUpdateRelationType(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const picked = await pickRelationType(cli, repo.rootPath);
  if (!picked)
    return;
  const payload = await cli.runOk(repo.rootPath, [
    "relation-type",
    "get",
    picked.id
  ]);
  const doc = await vscode14.workspace.openTextDocument({
    content: JSON.stringify(payload.relationTypeDefinition, null, 2),
    language: "json"
  });
  await vscode14.window.showTextDocument(doc);
  const answer = await vscode14.window.showInformationMessage(
    `SRS: Edit '${picked.label}', then click Update.`,
    "Update",
    "Cancel"
  );
  if (answer !== "Update")
    return;
  const content = doc.getText();
  try {
    await cli.runOk(repo.rootPath, ["relation-type", "update", picked.id], {
      stdin: content
    });
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Relation type updated.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to update relation type: ${msg}`);
  }
}
async function cmdDeleteRelationType(cli, repoProvider, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode14.window.showWarningMessage("SRS: No active repository.");
    return;
  }
  const picked = await pickRelationType(cli, repo.rootPath);
  if (!picked)
    return;
  const confirm = await vscode14.window.showWarningMessage(
    `SRS: Delete relation type '${picked.label}' (${picked.relationType})? This will fail if any stored relations reference it.`,
    { modal: true },
    "Delete"
  );
  if (confirm !== "Delete")
    return;
  try {
    await cli.runOk(repo.rootPath, ["relation-type", "delete", picked.id]);
    treeProvider.refresh();
    vscode14.window.showInformationMessage("SRS: Relation type deleted.");
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Failed to delete relation type: ${msg}`);
  }
}
async function pickRelationType(cli, repoPath) {
  let defs = [];
  try {
    const payload = await cli.runOk(repoPath, ["relation-type", "list"]);
    defs = payload.relationTypeDefinitions;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Could not load relation types: ${msg}`);
    return void 0;
  }
  if (defs.length === 0) {
    vscode14.window.showWarningMessage("SRS: No relation type definitions found in this repository.");
    return void 0;
  }
  const items = defs.map((rt) => ({
    label: rt.label,
    description: rt.relationType,
    id: rt.id,
    relationType: rt.relationType
  }));
  return vscode14.window.showQuickPick(items, { placeHolder: "Select relation type" });
}
async function pickView(cli, repoPath) {
  let views = [];
  try {
    const payload = await cli.runOk(repoPath, ["view", "list"]);
    views = payload.views;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Could not load views: ${msg}`);
    return void 0;
  }
  if (views.length === 0) {
    vscode14.window.showWarningMessage("SRS: No view definitions found in this repository.");
    return void 0;
  }
  const items = views.map((v) => ({
    label: `${v.namespace}/${v.name}`,
    description: v.id,
    id: v.id
  }));
  return vscode14.window.showQuickPick(items, { placeHolder: "Select view" });
}
async function pickDocumentView(cli, repoPath) {
  let views = [];
  try {
    const payload = await cli.runOk(repoPath, ["document-view", "list"]);
    views = payload.documentViews;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Could not load document views: ${msg}`);
    return void 0;
  }
  if (views.length === 0) {
    vscode14.window.showWarningMessage("SRS: No document view definitions found in this repository.");
    return void 0;
  }
  const items = views.map((v) => ({
    label: `${v.namespace}/${v.name}`,
    description: `v${v.version}`,
    id: v.id
  }));
  return vscode14.window.showQuickPick(items, { placeHolder: "Select document view" });
}
async function pickTheme(cli, repoPath) {
  let themes = [];
  try {
    const payload = await cli.runOk(repoPath, ["theme", "list"]);
    themes = payload.themes;
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode14.window.showErrorMessage(`SRS: Could not load themes: ${msg}`);
    return void 0;
  }
  if (themes.length === 0) {
    vscode14.window.showWarningMessage("SRS: No theme definitions found in this repository.");
    return void 0;
  }
  const items = themes.map((t) => ({
    label: `${t.namespace}/${t.name}`,
    description: `v${t.version}`,
    id: t.id
  }));
  return vscode14.window.showQuickPick(items, { placeHolder: "Select theme" });
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
        label: r.displayLabel,
        description: `record \xB7 ${r.instanceId.slice(0, 8)}`,
        id: r.instanceId
      });
    }
  } catch {
  }
  return items;
}

// src/commands/containerCommands.ts
var vscode15 = __toESM(require("vscode"));
function registerContainerCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode15.commands.registerCommand(
      "srs.setActiveContainer",
      () => cmdSetActiveContainer(cli, repoProvider, attention)
    ),
    vscode15.commands.registerCommand(
      "srs.clearActiveContainer",
      () => cmdClearActiveContainer(attention, treeProvider)
    ),
    vscode15.commands.registerCommand(
      "srs.createContainer",
      () => cmdCreateContainer(cli, repoProvider, attention, treeProvider)
    )
  );
}
async function cmdSetActiveContainer(cli, repoProvider, attention) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode15.window.showWarningMessage(
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
    vscode15.window.showErrorMessage(`SRS: Failed to list containers: ${msg}`);
    return;
  }
  if (containers.length === 0) {
    const action = "Create Container";
    const choice = await vscode15.window.showInformationMessage(
      "SRS: No containers found in the active repository.",
      action
    );
    if (choice === action) {
      vscode15.commands.executeCommand("srs.createContainer");
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
  const picked = await vscode15.window.showQuickPick(
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
    vscode15.window.showErrorMessage(`SRS: Failed to set active container: ${msg}`);
  }
}
async function cmdClearActiveContainer(attention, treeProvider) {
  await attention.clear();
  treeProvider.refresh();
}
async function cmdCreateContainer(cli, repoProvider, attention, treeProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode15.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  const title = await vscode15.window.showInputBox({
    title: "SRS: Create Container",
    prompt: "Container title",
    placeHolder: "e.g. Sprint 42",
    validateInput: (v) => v.trim() ? void 0 : "Title is required"
  });
  if (!title) {
    return;
  }
  const containerType = await vscode15.window.showInputBox({
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
    const choice = await vscode15.window.showInformationMessage(
      `SRS: Container '${title}' created.`,
      setActive
    );
    if (choice === setActive) {
      await attention.set({ containerId: containerId2, title: title.trim() }, repo.rootPath);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode15.window.showErrorMessage(`SRS: Failed to create container: ${msg}`);
  }
}

// src/commands/mutationCommands.ts
var vscode16 = __toESM(require("vscode"));
function registerMutationCommands(context, cli, repoProvider, attention, treeProvider) {
  context.subscriptions.push(
    vscode16.commands.registerCommand(
      "srs.createNote",
      () => cmdCreateNote(cli, repoProvider, attention, treeProvider)
    ),
    vscode16.commands.registerCommand(
      "srs.createTag",
      () => cmdCreateTag(cli, repoProvider, treeProvider)
    ),
    vscode16.commands.registerCommand(
      "srs.createRecord",
      () => cmdCreateRecord(cli, repoProvider, attention, treeProvider)
    ),
    vscode16.commands.registerCommand(
      "srs.deleteEntity",
      (node) => cmdDeleteEntity(cli, repoProvider, treeProvider, node)
    )
  );
}
function requireActiveRepo(repoProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode16.window.showWarningMessage(
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
  const title = await vscode16.window.showInputBox({
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
    vscode16.window.showInformationMessage(`SRS: Note '${title}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode16.window.showErrorMessage(`SRS: Failed to create note: ${msg}`);
  }
}
async function cmdCreateTag(cli, repoProvider, treeProvider) {
  const repo = requireActiveRepo(repoProvider);
  if (!repo)
    return;
  const slug = await vscode16.window.showInputBox({
    title: "SRS: Create Tag",
    prompt: "Tag slug (kebab-case identifier)",
    placeHolder: "e.g. needs-review",
    validateInput: (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim()) ? void 0 : "Slug must be kebab-case (e.g. my-tag)"
  });
  if (!slug)
    return;
  const label = await vscode16.window.showInputBox({
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
    vscode16.window.showInformationMessage(`SRS: Tag '${slug}' created.`);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode16.window.showErrorMessage(`SRS: Failed to create tag: ${msg}`);
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
    vscode16.window.showErrorMessage(`SRS: Failed to list types: ${msg}`);
    return;
  }
  if (types.length === 0) {
    vscode16.window.showWarningMessage(
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
  const picked = await vscode16.window.showQuickPick(typeItems, {
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
    vscode16.window.showInformationMessage(
      `SRS: Record of type '${typeName}' created.`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode16.window.showErrorMessage(`SRS: Failed to create record: ${msg}`);
  }
}
async function cmdDeleteEntity(cli, repoProvider, treeProvider, node) {
  if (!(node instanceof EntityNode)) {
    vscode16.window.showWarningMessage(
      "SRS: Select an entity in the SRS tree to delete."
    );
    return;
  }
  const repo = repoProvider.active;
  if (!repo)
    return;
  const confirmed = await vscode16.window.showWarningMessage(
    `SRS: Delete ${node.entityKind} '${node.label}'?`,
    { modal: true },
    "Delete"
  );
  if (confirmed !== "Delete")
    return;
  const deleteArgs = deleteArgsFor(node.entityKind, node.entityId);
  if (!deleteArgs) {
    vscode16.window.showErrorMessage(
      `SRS: Delete not supported for '${node.entityKind}'.`
    );
    return;
  }
  try {
    await cli.runOk(repo.rootPath, deleteArgs);
    treeProvider.refresh();
    vscode16.window.showInformationMessage(
      `SRS: ${node.entityKind} deleted.`
    );
  } catch (err) {
    if (err instanceof CliError && err.diagnostics.some(
      (d) => d.includes("CannotDeleteInUse") || d.includes("used by")
    )) {
      vscode16.window.showErrorMessage(
        `SRS: Cannot delete ${node.entityKind} '${node.label}' \u2014 it is referenced by other entities. Remove those references first.

Details: ${err.diagnostics.join("\n")}`,
        { modal: true }
      );
    } else {
      const msg = err instanceof CliError ? err.message : String(err);
      vscode16.window.showErrorMessage(`SRS: Failed to delete entity: ${msg}`);
    }
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
    case "protocol":
      return ["protocol", "delete", id];
    case "blueprint":
      return ["blueprint", "delete", id];
    case "view":
      return ["view", "delete", id];
    case "document-view":
      return ["document-view", "delete", id];
    case "theme":
      return ["theme", "delete", id];
    default:
      return void 0;
  }
}

// src/commands/graphCommands.ts
var vscode18 = __toESM(require("vscode"));

// src/graph/GraphPanel.ts
var vscode17 = __toESM(require("vscode"));
var GraphPanel = class _GraphPanel {
  constructor(_context, _key, title, _repoPath) {
    this._context = _context;
    this._key = _key;
    this._repoPath = _repoPath;
    this._panel = vscode17.window.createWebviewPanel(
      "srsGraph",
      `Relations: ${title}`,
      { viewColumn: vscode17.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [],
        retainContextWhenHidden: true
      }
    );
    this._panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "openEntity" && typeof msg.id === "string") {
        vscode17.commands.executeCommand("srs.openEntityById", msg.id, msg.kind ?? "note", this._repoPath);
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
      existing._panel.reveal(vscode17.ViewColumn.Active);
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
        labelMap.set(r.instanceId, r.displayLabel);
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
    vscode18.commands.registerCommand(
      "srs.showRelationGraph",
      () => cmdShowRelationGraph(context, cli, repoProvider)
    ),
    vscode18.commands.registerCommand(
      "srs.openEntityById",
      (id, kind, repoPath) => cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider)
    )
  );
}
async function cmdShowRelationGraph(context, cli, repoProvider) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode18.window.showWarningMessage(
      "SRS: No active repository. Run 'SRS: Select Repository' first."
    );
    return;
  }
  try {
    await GraphPanel.show(context, cli, repo.rootPath, repo.title);
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode18.window.showErrorMessage(`SRS: Failed to open relation graph: ${msg}`);
  }
}
async function cmdOpenEntityById(id, kind, repoPath, repoProvider, entityProvider) {
  const repo = repoProvider.active;
  if (!repo)
    return;
  const entityKind = kind;
  try {
    const uri = entityUri(repo.repositoryId, entityKind, id);
    const doc = await vscode18.workspace.openTextDocument(uri);
    await vscode18.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode18.ViewColumn.Beside,
      preserveFocus: false
    });
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode18.window.showErrorMessage(`SRS: Failed to open entity: ${msg}`);
  }
}

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

// src/webview/guides/guideEditorCommands.ts
var vscode20 = __toESM(require("vscode"));

// src/webview/guides/guideTypes.ts
var F = {
  slug: "2e3be0f8-0497-4754-a8b2-62ce6b05493f",
  title: "e5b359b0-8f8b-4807-bae9-b841adbd6248",
  subtitle: "9bb3d21d-3a02-4b87-863d-99fdfcdb8a3e",
  body: "cd97f7d2-29e4-435e-a991-9be8281d6a78",
  // universal prose: guide intro + section body
  blocks: "dabb80dc-a04e-48e9-afd8-37a6410bd43b",
  heading: "9629c9b5-3b17-4766-b3d3-b2890902821a",
  callout: "138e40f4-888b-49ed-9c26-bedc9567e806",
  listItems: "e5e6ebce-8dfe-446f-a7fd-e329d4f5d67e",
  outro: "04ce57ec-46bc-4e1e-9238-34bf7247905a",
  // closing prose: was confirmation (list) + note (table)
  itemTerm: "a02b147b-4319-4cdd-b263-781640c93fcb",
  // was tipTitle — term/title for items group entries
  itemBody: "6fafae71-f6f1-4e83-b091-19765517ff80",
  // was tip — body for items group entries
  // table block fields — used in groupValues["tables"] entries
  columns: "15d81030-07db-40a7-9885-d23b1d6b39f7",
  rows: "876daf6a-aefa-421c-80b5-2e3c3a4c6397",
  subheading: "4523e0e0-f7b6-4c72-9f30-b526ca74799e",
  tableLabel: "920fd0a2-5fb2-40c4-9362-7c6c86ab8ccd",
  widths: "8d98614d-f420-4597-90fd-c141e8584b06"
};
var TYPE_PREFIX = {
  guide: "8f138dd6",
  sectionText: "4408a98e",
  sectionList: "76cdc3fb",
  sectionTable: "d8d09d3b"
};

// src/webview/guides/guideLoader.ts
function fv(record, fieldId) {
  const entry = record.fieldValues.find((e) => e.fieldId === fieldId);
  if (entry == null)
    return "";
  return typeof entry.value === "string" ? entry.value : "";
}
function sortByPrecedes(ids, precedesMap) {
  const hasIncoming = new Set(ids.filter((id) => [...precedesMap.values()].includes(id)));
  const result = [];
  let cur = ids.find((id) => !hasIncoming.has(id));
  while (cur && result.length <= ids.length) {
    result.push(cur);
    cur = precedesMap.get(cur);
  }
  for (const id of ids) {
    if (!result.includes(id))
      result.push(id);
  }
  return result;
}
function sectionTypeFromPrefix(typeId) {
  const p = typeId.slice(0, 8);
  if (p === TYPE_PREFIX.sectionText)
    return "text";
  if (p === TYPE_PREFIX.sectionList)
    return "list";
  if (p === TYPE_PREFIX.sectionTable)
    return "table";
  throw new Error(`Unknown section typeId prefix: ${p} (${typeId})`);
}
function toSectionDoc(record) {
  const type = sectionTypeFromPrefix(record.typeId);
  const section = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeVersion: record.typeVersion,
    type,
    heading: fv(record, F.heading),
    slug: fv(record, F.slug)
  };
  if (type === "text") {
    section.body = fv(record, F.body);
    section.callout = fv(record, F.callout);
  } else if (type === "list") {
    section.body = fv(record, F.body);
    section.listItems = fv(record, F.listItems);
    section.outro = fv(record, F.outro);
  } else if (type === "table") {
    section.body = fv(record, F.body);
    const tablesGroup = record.groupValues?.find((gv) => gv.groupId === "tables");
    section.tables = (tablesGroup?.entries ?? []).map((entry) => {
      const fval = (id) => entry.fieldValues.find((e) => e.fieldId === id)?.value;
      let columns = [];
      let rows = [];
      let widths;
      try {
        columns = JSON.parse(String(fval(F.columns) ?? "[]"));
      } catch {
        columns = [];
      }
      try {
        rows = JSON.parse(String(fval(F.rows) ?? "[]"));
      } catch {
        rows = [];
      }
      const widthsRaw = fval(F.widths);
      if (widthsRaw) {
        try {
          widths = JSON.parse(String(widthsRaw));
        } catch {
        }
      }
      const block = { columns, rows };
      const sub = fval(F.subheading);
      const lbl = fval(F.tableLabel);
      if (typeof sub === "string" && sub)
        block.subheading = sub;
      if (typeof lbl === "string" && lbl)
        block.label = lbl;
      if (widths)
        block.widths = widths;
      return block;
    });
    const itemsGroup = record.groupValues?.find((gv) => gv.groupId === "items");
    section.items = (itemsGroup?.entries ?? []).map((entry) => {
      const term = entry.fieldValues.find((e) => e.fieldId === F.itemTerm)?.value;
      const body = entry.fieldValues.find((e) => e.fieldId === F.itemBody)?.value;
      return {
        term: typeof term === "string" && term ? term : void 0,
        body: typeof body === "string" ? body : ""
      };
    });
    section.outro = fv(record, F.outro);
  }
  return section;
}
async function loadGuide(cli, repoPath, containerId2) {
  const containerPayload = await cli.runOk(repoPath, [
    "container",
    "get",
    containerId2
  ]);
  const { memberInstanceIds, rootInstanceIds } = containerPayload.container;
  const guideId = rootInstanceIds[0];
  const records = await Promise.all(
    memberInstanceIds.map(
      (id) => cli.runOk(repoPath, ["record", "get", id]).then((p) => p.record)
    )
  );
  const relPayload = await cli.runOk(repoPath, ["relation", "list"]);
  const precedesMap = /* @__PURE__ */ new Map();
  for (const rel of relPayload.relations) {
    if (rel.relationType === "precedes") {
      precedesMap.set(rel.sourceId, rel.targetId);
    }
  }
  const guideRecord = records.find((r) => r.instanceId === guideId);
  if (!guideRecord) {
    throw new Error(`Guide record ${guideId} not found in container members`);
  }
  const sectionIds = memberInstanceIds.filter((id) => id !== guideId);
  const sortedSectionIds = sortByPrecedes(sectionIds, precedesMap);
  const recordById = new Map(records.map((r) => [r.instanceId, r]));
  const sections = sortedSectionIds.map((id) => {
    const r = recordById.get(id);
    if (!r)
      throw new Error(`Section record ${id} missing`);
    return toSectionDoc(r);
  });
  return {
    containerId: containerId2,
    guideInstanceId: guideId,
    guideTypeId: guideRecord.typeId,
    guideTypeVersion: guideRecord.typeVersion,
    slug: fv(guideRecord, F.slug),
    title: fv(guideRecord, F.title),
    subtitle: fv(guideRecord, F.subtitle),
    body: fv(guideRecord, F.body),
    sections
  };
}

// src/webview/guides/guideSaver.ts
function buildFieldValues(pairs) {
  return pairs.filter(([, v]) => v !== void 0 && v !== "").map(([fieldId, value]) => ({ fieldId, value }));
}
function guideUpdateInput(guide) {
  return {
    instanceId: guide.guideInstanceId,
    typeId: guide.guideTypeId,
    typeVersion: guide.guideTypeVersion,
    fieldValues: buildFieldValues([
      [F.slug, guide.slug],
      [F.title, guide.title],
      [F.subtitle, guide.subtitle],
      [F.body, guide.body]
    ])
  };
}
function sectionUpdateInput(section) {
  const pairs = [
    [F.heading, section.heading],
    [F.slug, section.slug]
  ];
  if (section.type === "text") {
    pairs.push([F.body, section.body], [F.callout, section.callout]);
  } else if (section.type === "list") {
    pairs.push([F.body, section.body], [F.listItems, section.listItems], [F.outro, section.outro]);
  } else if (section.type === "table") {
    pairs.push([F.body, section.body], [F.outro, section.outro]);
  }
  const fieldValues = buildFieldValues(pairs);
  const groupValues = [];
  if (section.type === "table") {
    if (section.items !== void 0) {
      groupValues.push({
        groupId: "items",
        entries: section.items.map((item) => ({
          fieldValues: [
            ...item.term ? [{ fieldId: F.itemTerm, value: item.term }] : [],
            { fieldId: F.itemBody, value: item.body }
          ]
        }))
      });
    }
    if (section.tables !== void 0) {
      groupValues.push({
        groupId: "tables",
        entries: section.tables.map((t) => ({
          fieldValues: [
            { fieldId: F.columns, value: JSON.stringify(t.columns ?? []) },
            { fieldId: F.rows, value: JSON.stringify(t.rows) },
            ...t.subheading ? [{ fieldId: F.subheading, value: t.subheading }] : [],
            ...t.label ? [{ fieldId: F.tableLabel, value: t.label }] : [],
            ...t.widths ? [{ fieldId: F.widths, value: JSON.stringify(t.widths) }] : []
          ]
        }))
      });
    }
  }
  return {
    instanceId: section.instanceId,
    typeId: section.typeId,
    typeVersion: section.typeVersion,
    fieldValues,
    ...groupValues.length > 0 ? { groupValues } : {}
  };
}
async function saveGuide(cli, repoPath, guide) {
  const updates = [
    { id: guide.guideInstanceId, input: guideUpdateInput(guide) },
    ...guide.sections.map((s) => ({ id: s.instanceId, input: sectionUpdateInput(s) }))
  ];
  for (const { id, input } of updates) {
    await cli.runOk(repoPath, ["record", "update", id], {
      stdin: JSON.stringify(input)
    });
  }
}

// src/webview/guides/guideForm.ts
function esc3(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr2(s) {
  return esc3(s);
}
function escText2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
var TYPE_LABEL = {
  text: "text",
  list: "list",
  table: "table"
};
function textField(label, name, value, opts = {}) {
  const req = opts.required ? ` <span class="required-mark">*</span>` : "";
  const reqAttr = opts.required ? " required" : "";
  const rows = opts.rows ?? 2;
  const hint = opts.hint ? `<div class="hint">${esc3(opts.hint)}</div>` : "";
  return `
    <div class="field">
      <label>${esc3(label)}${req}</label>
      <textarea name="${escAttr2(name)}" rows="${rows}"${reqAttr}>${escText2(value)}</textarea>
      ${hint}
    </div>`;
}
function inputField(label, name, value, opts = {}) {
  const req = opts.required ? ` <span class="required-mark">*</span>` : "";
  const reqAttr = opts.required ? " required" : "";
  return `
    <div class="field">
      <label>${esc3(label)}${req}</label>
      <input type="text" name="${escAttr2(name)}" value="${escAttr2(value)}"${reqAttr}>
    </div>`;
}
function textSectionFields(s, i) {
  return [
    textField("Body", `s_${i}_body`, s.body ?? "", { required: true, rows: 5 }),
    textField("Callout", `s_${i}_callout`, s.callout ?? "", { rows: 2 })
  ].join("");
}
function listSectionFields(s, i) {
  return [
    textField("Body", `s_${i}_body`, s.body ?? "", { rows: 3 }),
    textField("Items", `s_${i}_listItems`, s.listItems ?? "", {
      required: true,
      rows: 4,
      hint: "One item per line"
    }),
    textField("Outro", `s_${i}_outro`, s.outro ?? "", { rows: 2 })
  ].join("");
}
function itemEntryHtml(term, body) {
  return `
    <div class="section-group" data-item-entry>
      <div class="section-header">
        <span style="flex:1;font-size:0.8em;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.05em">Item</span>
        <button type="button" class="btn-remove-section" title="Remove item">\u2715</button>
      </div>
      <div class="field">
        <label>Term <span style="font-weight:400;text-transform:none">(optional)</span></label>
        <input type="text" class="item-term" placeholder="e.g. Why" value="${escAttr2(term)}">
      </div>
      <div class="field">
        <label>Body</label>
        <textarea class="item-body" rows="3">${escText2(body)}</textarea>
      </div>
    </div>`;
}
function tableBlockHtml(t, si, ti) {
  const cols = t.columns ?? [];
  const colCount = cols.length > 0 ? cols.length : t.rows.length > 0 ? t.rows[0].length : 2;
  const headerHtml = cols.length > 0 ? `<thead><tr>${cols.map((c) => `<th><input type="text" class="te-col-header" value="${escAttr2(c)}" placeholder="Header"></th>`).join("")}<th class="te-action-col"></th></tr></thead>` : "";
  const bodyHtml = (t.rows ?? []).map(
    (row) => `<tr>${row.map((cell) => `<td><input type="text" class="te-cell" value="${escAttr2(cell)}"></td>`).join("")}<td class="te-action-col"><button type="button" class="btn-remove-row" title="Remove row">\u2715</button></td></tr>`
  ).join("");
  return `
    <div class="table-block" data-table-section="${si}" data-table-idx="${ti}" data-col-count="${colCount}">
      <div class="table-block-meta">
        <div class="field">
          <label>Subheading <span style="font-weight:400;text-transform:none">(optional)</span></label>
          <input type="text" class="te-subheading" value="${escAttr2(t.subheading ?? "")}">
        </div>
        <div class="field">
          <label>Label <span style="font-weight:400;text-transform:none">(optional, shown above the table)</span></label>
          <textarea class="te-label" rows="2">${escText2(t.label ?? "")}</textarea>
        </div>
      </div>
      <div class="te-table-wrap">
        <table class="te-table">
          ${headerHtml}
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
      <button type="button" class="btn-add-row">+ Add row</button>
    </div>`;
}
function tableSectionFields(s, i) {
  const tables = s.tables ?? [];
  const tableBlocksHtml = tables.map((t, ti) => tableBlockHtml(t, i, ti)).join("");
  const items = s.items ?? [];
  const itemEntries = items.map((item) => itemEntryHtml(item.term ?? "", item.body)).join("");
  const itemBlock = `
    <div class="field">
      <label>Items</label>
      <div id="items-list-${i}">${itemEntries}</div>
      <button type="button" class="btn-add-entry" data-items-section="${i}">+ Add item</button>
    </div>`;
  return [
    textField("Body", `s_${i}_body`, s.body ?? "", { rows: 3 }),
    `<div class="field"><label>Tables</label><div class="table-blocks" id="table-blocks-${i}">${tableBlocksHtml}</div><button type="button" class="btn-add-entry btn-add-table" data-table-section="${i}">+ Add table</button></div>`,
    itemBlock,
    textField("Outro", `s_${i}_outro`, s.outro ?? "", { rows: 2 })
  ].join("");
}
function sectionBlock(s, i) {
  const typeLabel = TYPE_LABEL[s.type];
  let typeFields = "";
  if (s.type === "text")
    typeFields = textSectionFields(s, i);
  else if (s.type === "list")
    typeFields = listSectionFields(s, i);
  else if (s.type === "table")
    typeFields = tableSectionFields(s, i);
  return `
    <div class="section-block" data-section-index="${i}">
      <div class="section-block-header">
        <span class="section-type-badge">${esc3(typeLabel)}</span>
      </div>
      ${inputField("Heading", `s_${i}_heading`, s.heading, { required: true })}
      ${inputField("Slug (id)", `s_${i}_slug`, s.slug)}
      ${typeFields}
      <input type="hidden" name="s_${i}_instanceId" value="${escAttr2(s.instanceId)}">
      <input type="hidden" name="s_${i}_typeId" value="${escAttr2(s.typeId)}">
      <input type="hidden" name="s_${i}_typeVersion" value="${escAttr2(String(s.typeVersion))}">
      <input type="hidden" name="s_${i}_type" value="${escAttr2(s.type)}">
    </div>`;
}
var GUIDE_JS = `
<script>
function collectFormData() {
  var form = document.getElementById('editor-form');
  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }

  var guide = {
    containerId: val('containerId'),
    guideInstanceId: val('guideInstanceId'),
    guideTypeId: val('guideTypeId'),
    guideTypeVersion: parseInt(val('guideTypeVersion'), 10),
    slug: val('guide_slug'),
    title: val('guide_title'),
    subtitle: val('guide_subtitle'),
    body: val('guide_body'),
    sections: [],
  };

  var sectionCount = parseInt(val('sectionCount'), 10);
  for (var i = 0; i < sectionCount; i++) {
    var type = val('s_' + i + '_type');
    var section = {
      instanceId: val('s_' + i + '_instanceId'),
      typeId: val('s_' + i + '_typeId'),
      typeVersion: parseInt(val('s_' + i + '_typeVersion'), 10),
      type: type,
      heading: val('s_' + i + '_heading'),
      slug: val('s_' + i + '_slug'),
    };
    if (type === 'text') {
      section.body = val('s_' + i + '_body');
      section.callout = val('s_' + i + '_callout');
    } else if (type === 'list') {
      section.body = val('s_' + i + '_body');
      section.listItems = val('s_' + i + '_listItems');
      section.outro = val('s_' + i + '_outro');
    } else if (type === 'table') {
      section.body = val('s_' + i + '_body');
      section.outro = val('s_' + i + '_outro');
      section.tables = [];
      document.querySelectorAll('[data-table-section="' + i + '"]').forEach(function(tb) {
        var subheading = tb.querySelector('.te-subheading').value.trim();
        var label = tb.querySelector('.te-label').value.trim();
        var columns = [];
        tb.querySelectorAll('thead .te-col-header').forEach(function(inp) { columns.push(inp.value); });
        var rows = [];
        tb.querySelectorAll('tbody tr').forEach(function(tr) {
          var row = [];
          tr.querySelectorAll('.te-cell').forEach(function(inp) { row.push(inp.value); });
          rows.push(row);
        });
        var tbl = { columns: columns, rows: rows };
        if (subheading) tbl.subheading = subheading;
        if (label) tbl.label = label;
        section.tables.push(tbl);
      });
      section.items = [];
      var itemsList = document.getElementById('items-list-' + i);
      itemsList.querySelectorAll('[data-item-entry]').forEach(function(entry) {
        var body = entry.querySelector('.item-body').value.trim();
        if (!body) return;
        var term = entry.querySelector('.item-term').value.trim();
        section.items.push({ term: term || undefined, body: body });
      });
    }
    guide.sections.push(section);
  }
  return guide;
}

// Wire existing item remove buttons
document.querySelectorAll('[data-item-entry] .btn-remove-section').forEach(function(btn) {
  btn.addEventListener('click', function() { btn.closest('[data-item-entry]').remove(); });
});

// Wire item add buttons
document.querySelectorAll('.btn-add-entry[data-items-section]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var si = btn.getAttribute('data-items-section');
    var list = document.getElementById('items-list-' + si);
    var div = document.createElement('div');
    div.className = 'section-group';
    div.setAttribute('data-item-entry', '');
    div.innerHTML =
      '<div class="section-header">' +
        '<span style="flex:1;font-size:0.8em;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.05em">Item</span>' +
        '<button type="button" class="btn-remove-section" title="Remove item">\\u2715</button>' +
      '</div>' +
      '<div class="field"><label>Term <span style="font-weight:400;text-transform:none">(optional)</span></label>' +
        '<input type="text" class="item-term" placeholder="e.g. Why"></div>' +
      '<div class="field"><label>Body</label><textarea class="item-body" rows="3"></textarea></div>';
    list.appendChild(div);
    div.querySelector('.item-term').focus();
    div.querySelector('.btn-remove-section').addEventListener('click', function() { div.remove(); });
  });
});

// Table editor \u2014 event delegation handles all table buttons, including on dynamically added rows/tables
document.addEventListener('click', function(e) {
  var btn = e.target;
  if (!btn || btn.tagName !== 'BUTTON') return;
  if (btn.classList.contains('btn-remove-row')) {
    btn.closest('tr').remove();
  } else if (btn.classList.contains('btn-add-row')) {
    var addTb = btn.closest('[data-table-section]');
    var cols = addTb.querySelectorAll('thead .te-col-header').length;
    if (!cols) {
      var fr = addTb.querySelector('tbody tr');
      if (fr) cols = fr.querySelectorAll('.te-cell').length;
    }
    if (!cols) cols = 2;
    var addBody = addTb.querySelector('tbody');
    var newTr = document.createElement('tr');
    for (var c = 0; c < cols; c++) {
      var newTd = document.createElement('td');
      var newInp = document.createElement('input');
      newInp.type = 'text';
      newInp.className = 'te-cell';
      newTd.appendChild(newInp);
      newTr.appendChild(newTd);
    }
    var actTd = document.createElement('td');
    actTd.className = 'te-action-col';
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-remove-row';
    delBtn.title = 'Remove row';
    delBtn.textContent = '\\u2715';
    actTd.appendChild(delBtn);
    newTr.appendChild(actTd);
    addBody.appendChild(newTr);
    newTr.querySelector('.te-cell').focus();
  } else if (btn.classList.contains('btn-add-table')) {
    var tsi = btn.getAttribute('data-table-section');
    var tblContainer = document.getElementById('table-blocks-' + tsi);
    var newTi = tblContainer.querySelectorAll('[data-table-section]').length;
    var newBlock = document.createElement('div');
    newBlock.className = 'table-block';
    newBlock.setAttribute('data-table-section', tsi);
    newBlock.setAttribute('data-table-idx', String(newTi));
    newBlock.setAttribute('data-col-count', '2');
    newBlock.innerHTML =
      '<div class="table-block-meta">' +
        '<div class="field"><label>Subheading <span style="font-weight:400;text-transform:none">(optional)</span></label>' +
          '<input type="text" class="te-subheading"></div>' +
        '<div class="field"><label>Label <span style="font-weight:400;text-transform:none">(optional, shown above the table)</span></label>' +
          '<textarea class="te-label" rows="2"></textarea></div>' +
      '</div>' +
      '<div class="te-table-wrap"><table class="te-table">' +
        '<thead><tr>' +
          '<th><input type="text" class="te-col-header" placeholder="Header"></th>' +
          '<th><input type="text" class="te-col-header" placeholder="Header"></th>' +
          '<th class="te-action-col"></th>' +
        '</tr></thead>' +
        '<tbody><tr>' +
          '<td><input type="text" class="te-cell"></td>' +
          '<td><input type="text" class="te-cell"></td>' +
          '<td class="te-action-col"><button type="button" class="btn-remove-row" title="Remove row">\\u2715</button></td>' +
        '</tr></tbody>' +
      '</table></div>' +
      '<button type="button" class="btn-add-row">+ Add row</button>';
    tblContainer.appendChild(newBlock);
    newBlock.querySelector('.te-col-header').focus();
  }
});


</script>`;
var GUIDE_CSS = `
<style>
  .guide-meta { margin-bottom: 2em; }
  .guide-meta h2 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em; }
  .sections-list { display: flex; flex-direction: column; gap: 1.5em; }
  .section-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 1em;
  }
  .section-block-header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.8em;
  }
  .section-type-badge {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    padding: 1px 6px;
  }
  .sections-heading {
    font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em;
  }
  .table-blocks { display: flex; flex-direction: column; gap: 0.8em; }
  .table-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 0.8em;
  }
  .table-block-meta {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0 0.8em;
    margin-bottom: 0.6em;
  }
  .table-block-meta .field { margin-bottom: 0.6em; }
  .te-table-wrap { overflow-x: auto; margin-bottom: 0.5em; }
  .te-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .te-table th, .te-table td {
    border: 1px solid var(--vscode-panel-border);
    padding: 1px;
    vertical-align: middle;
  }
  .te-table th {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.07));
  }
  .te-table .te-col-header,
  .te-table .te-cell {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 3px 6px !important;
    outline: none !important;
    min-width: 80px;
    width: 100%;
  }
  .te-table .te-col-header { font-weight: 600; }
  .te-table .te-col-header:focus,
  .te-table .te-cell:focus {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.1)) !important;
  }
  .te-action-col {
    width: 24px;
    min-width: 24px;
    padding: 0 !important;
    text-align: center;
    border-left: none !important;
  }
  .btn-remove-row {
    background: none;
    border: none;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    padding: 2px 4px;
    opacity: 0.45;
    font-size: 0.75em;
    line-height: 1;
  }
  .btn-remove-row:hover { opacity: 1; }
  .btn-add-row {
    background: none;
    border: 1px dashed var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 3px 10px;
    border-radius: 2px;
    font-size: 0.8em;
    width: 100%;
    text-align: left;
  }
  .btn-add-row:hover {
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-foreground);
  }
</style>`;
function buildGuideForm(guide) {
  const sectionsHtml = guide.sections.map((s, i) => sectionBlock(s, i)).join("");
  const body = `
    ${GUIDE_CSS}
    <div class="guide-meta">
      <h2>Guide</h2>
      ${inputField("Title", "guide_title", guide.title, { required: true })}
      ${inputField("Subtitle", "guide_subtitle", guide.subtitle)}
      ${textField("Body", "guide_body", guide.body, { rows: 4 })}
    </div>
    <p class="sections-heading">Sections (${guide.sections.length})</p>
    <div class="sections-list">
      ${sectionsHtml}
    </div>
    <input type="hidden" name="containerId" value="${escAttr2(guide.containerId)}">
    <input type="hidden" name="guideInstanceId" value="${escAttr2(guide.guideInstanceId)}">
    <input type="hidden" name="guideTypeId" value="${escAttr2(guide.guideTypeId)}">
    <input type="hidden" name="guideTypeVersion" value="${escAttr2(String(guide.guideTypeVersion))}">
    <input type="hidden" name="guide_slug" value="${escAttr2(guide.slug)}">
    <input type="hidden" name="sectionCount" value="${guide.sections.length}">
    ${GUIDE_JS}`;
  return formWrapHtml(guide.title, body);
}

// src/webview/guides/guideEditorCommands.ts
function registerGuideEditorCommands(context, cli, repoProvider, treeProvider) {
  context.subscriptions.push(
    vscode20.commands.registerCommand(
      "srs.editGuide",
      () => cmdEditGuide(context, cli, repoProvider, treeProvider)
    )
  );
}
async function cmdEditGuide(context, cli, repoProvider, treeProvider) {
  const repoPath = repoProvider.active?.rootPath;
  if (!repoPath) {
    vscode20.window.showWarningMessage("SRS: No repository selected.");
    return;
  }
  let containers;
  try {
    const payload = await cli.runOk(repoPath, ["container", "list"]);
    containers = payload.containers.filter((c) => c.containerType === "guide");
  } catch (err) {
    vscode20.window.showErrorMessage(`SRS: Could not load containers \u2014 ${String(err)}`);
    return;
  }
  if (containers.length === 0) {
    vscode20.window.showInformationMessage("SRS: No guide containers found in this repository.");
    return;
  }
  const picked = await vscode20.window.showQuickPick(
    containers.map((c) => ({ label: c.title, description: c.containerId, id: c.containerId })),
    { placeHolder: "Select a guide to edit" }
  );
  if (!picked)
    return;
  await vscode20.window.withProgress(
    { location: vscode20.ProgressLocation.Notification, title: `Loading guide: ${picked.label}` },
    async () => {
      let guide;
      try {
        guide = await loadGuide(cli, repoPath, picked.id);
      } catch (err) {
        vscode20.window.showErrorMessage(`SRS: Failed to load guide \u2014 ${String(err)}`);
        return;
      }
      const html = buildGuideForm(guide);
      EntityEditorPanel.show(
        context,
        `guide:${picked.id}`,
        guide.title,
        html,
        async (data) => {
          await saveGuide(cli, repoPath, data);
          treeProvider.refresh();
          vscode20.window.showInformationMessage(`SRS: Guide "${guide.title}" saved.`);
        }
      );
    }
  );
}

// src/archive/ArchiveManager.ts
var vscode21 = __toESM(require("vscode"));

// src/archive/workdir.ts
var crypto = __toESM(require("crypto"));
var path2 = __toESM(require("path"));
function archiveWorkdirName(archivePath) {
  const abs = path2.resolve(archivePath);
  const base = path2.basename(abs, path2.extname(abs));
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40) || "archive";
  const hash = crypto.createHash("sha1").update(abs).digest("hex").slice(0, 12);
  return `${safe}-${hash}`;
}

// src/archive/ArchiveManager.ts
var ArchiveManager = class {
  constructor(context, cli, repoProvider) {
    this.context = context;
    this.cli = cli;
    this.repoProvider = repoProvider;
    this._dirty = false;
    this._onDidChangeDirty = new vscode21.EventEmitter();
    this.onDidChangeDirty = this._onDidChangeDirty.event;
    this._disposables = [this._onDidChangeDirty];
    this._disposables.push(
      repoProvider.onDidChangeActive((repo) => {
        if (this._current && repo?.rootPath !== this._current.workdir) {
          this._teardown();
        }
      })
    );
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
    const archivesRoot = vscode21.Uri.joinPath(
      this.context.globalStorageUri,
      "archives"
    );
    await vscode21.workspace.fs.createDirectory(archivesRoot);
    await this._deleteIfExists(vscode21.Uri.file(workdir));
    await this.cli.runRawOk([
      "archive",
      "unpack",
      archivePath,
      "--target",
      workdir
    ]);
    const repo = await this.repoProvider.probe(workdir);
    if (!repo) {
      throw new CliError(
        `Unpacked archive at ${workdir} did not load as a valid SRS repository.`,
        ["archive unpack produced an unloadable repository"],
        "archive unpack"
      );
    }
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
      vscode21.window.showWarningMessage(
        "SRS: The active repository is not opened from a .srs archive. Use 'SRS: Export Repository to .srs' instead."
      );
      return false;
    }
    await this.cli.runOk(repo.rootPath, [
      "archive",
      "pack",
      "--output",
      repo.archivePath
    ]);
    this._setDirty(false);
    return true;
  }
  // Pack the active repository (any kind — directory, working copy, or .srsj) into
  // a `.srs` at a user-chosen path. Does not change the active repo or dirty state.
  async exportActive(targetPath) {
    const repo = this.repoProvider.active;
    if (!repo) {
      throw new CliError(
        "No active SRS repository to export.",
        ["no active repository"],
        "archive pack"
      );
    }
    return this.cli.runOk(repo.rootPath, [
      "archive",
      "pack",
      "--output",
      targetPath
    ]);
  }
  _workdirFor(archivePath) {
    return vscode21.Uri.joinPath(
      this.context.globalStorageUri,
      "archives",
      archiveWorkdirName(archivePath)
    ).fsPath;
  }
  _startWatching(workdir) {
    const watcher = vscode21.workspace.createFileSystemWatcher(
      new vscode21.RelativePattern(vscode21.Uri.file(workdir), "**/*")
    );
    const markDirty = () => this._setDirty(true);
    watcher.onDidChange(markDirty);
    watcher.onDidCreate(markDirty);
    watcher.onDidDelete(markDirty);
    return watcher;
  }
  _teardown() {
    this._current?.watcher.dispose();
    this._current = void 0;
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
      await vscode21.workspace.fs.delete(uri, {
        recursive: true,
        useTrash: false
      });
    } catch {
    }
  }
  dispose() {
    this._current?.watcher.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
};

// src/archive/ArchiveStatusBarItem.ts
var vscode22 = __toESM(require("vscode"));
var path3 = __toESM(require("path"));
var ArchiveStatusBarItem = class {
  constructor(archiveManager, repoProvider) {
    this.archiveManager = archiveManager;
    this.repoProvider = repoProvider;
    this._disposables = [];
    this._item = vscode22.window.createStatusBarItem(
      vscode22.StatusBarAlignment.Left,
      99
    );
    this._item.command = "srs.saveArchive";
    this._disposables.push(this._item);
    this._disposables.push(
      archiveManager.onDidChangeDirty(() => this._update()),
      repoProvider.onDidChangeActive(() => this._update())
    );
    this._update();
  }
  _update() {
    const archivePath = this.repoProvider.active?.archivePath;
    if (!archivePath) {
      this._item.hide();
      return;
    }
    const name = path3.basename(archivePath);
    if (this.archiveManager.isDirty) {
      this._item.text = `$(archive) \u25CF ${name}`;
      this._item.tooltip = `SRS: ${name} has unsaved changes \u2014 click to save to .srs`;
    } else {
      this._item.text = `$(archive) ${name}`;
      this._item.tooltip = `SRS: ${name} (saved) \u2014 click to re-pack to .srs`;
    }
    this._item.show();
  }
  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
};

// src/commands/archiveCommands.ts
var vscode23 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
function registerArchiveCommands(context, cli, repoProvider, archiveManager) {
  context.subscriptions.push(
    vscode23.commands.registerCommand(
      "srs.openArchive",
      () => cmdOpenArchive(repoProvider, archiveManager)
    ),
    vscode23.commands.registerCommand(
      "srs.saveArchive",
      () => cmdSaveArchive(archiveManager)
    ),
    vscode23.commands.registerCommand(
      "srs.exportArchive",
      () => cmdExportArchive(repoProvider, archiveManager)
    )
  );
}
async function cmdOpenArchive(repoProvider, archiveManager) {
  const picked = await vscode23.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Open SRS Archive",
    filters: {
      "SRS Archive": ["srs"],
      "SRS Bundle (legacy)": ["srsj"],
      "All Files": ["*"]
    }
  });
  if (!picked || picked.length === 0)
    return;
  const fsPath = picked[0].fsPath;
  const name = path4.basename(fsPath);
  const isLegacyBundle = path4.extname(fsPath).toLowerCase() === ".srsj";
  try {
    await vscode23.window.withProgress(
      { location: vscode23.ProgressLocation.Window, title: `SRS: Opening ${name}\u2026` },
      async () => {
        if (isLegacyBundle) {
          const repo = await repoProvider.probe(fsPath);
          if (!repo) {
            throw new CliError(
              `${name} did not load as a valid SRS repository.`,
              ["repo map failed on the selected file"],
              "repo map"
            );
          }
          repoProvider.setActive(repo);
        } else {
          await archiveManager.openArchive(fsPath);
        }
      }
    );
    if (isLegacyBundle) {
      vscode23.window.showInformationMessage(
        `SRS: Opened legacy bundle ${name}. Use 'SRS: Export Repository to .srs' to save it in the .srs format.`
      );
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode23.window.showErrorMessage(`SRS: Failed to open ${name}: ${msg}`);
  }
}
async function cmdSaveArchive(archiveManager) {
  const name = archiveManager.activeArchivePath ? path4.basename(archiveManager.activeArchivePath) : ".srs";
  try {
    const saved = await vscode23.window.withProgress(
      { location: vscode23.ProgressLocation.Window, title: `SRS: Saving ${name}\u2026` },
      () => archiveManager.saveActive()
    );
    if (saved) {
      vscode23.window.showInformationMessage(`SRS: Saved ${name}.`);
    }
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode23.window.showErrorMessage(`SRS: Failed to save ${name}: ${msg}`);
  }
}
async function cmdExportArchive(repoProvider, archiveManager) {
  const repo = repoProvider.active;
  if (!repo) {
    vscode23.window.showWarningMessage(
      "SRS: No active repository. Open or select a repository first."
    );
    return;
  }
  const target = await vscode23.window.showSaveDialog({
    saveLabel: "Export .srs",
    filters: { "SRS Archive": ["srs"] },
    defaultUri: defaultExportUri(repo.archivePath, repo.title)
  });
  if (!target)
    return;
  const name = path4.basename(target.fsPath);
  try {
    const payload = await vscode23.window.withProgress(
      { location: vscode23.ProgressLocation.Window, title: `SRS: Exporting ${name}\u2026` },
      () => archiveManager.exportActive(target.fsPath)
    );
    vscode23.window.showInformationMessage(
      `SRS: Exported ${name} (${formatBytes(payload.fileSizeBytes)}).`
    );
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode23.window.showErrorMessage(`SRS: Failed to export ${name}: ${msg}`);
  }
}
function defaultExportUri(archivePath, title) {
  if (archivePath)
    return vscode23.Uri.file(archivePath);
  const safe = title.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "repository";
  const folder = vscode23.workspace.workspaceFolders?.[0];
  return folder ? vscode23.Uri.joinPath(folder.uri, `${safe}.srs`) : vscode23.Uri.file(`${safe}.srs`);
}
function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// src/extension.ts
async function activate(context) {
  const outputChannel = vscode24.window.createOutputChannel("SRS");
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
  const archiveManager = new ArchiveManager(context, cli, repoProvider);
  const archiveStatusBarItem = new ArchiveStatusBarItem(archiveManager, repoProvider);
  context.subscriptions.push(
    repoProvider,
    treeProvider,
    navigatorProvider,
    attention,
    statusBarItem,
    schemaProvider,
    entityDocProvider,
    diagnosticsProvider,
    archiveManager,
    archiveStatusBarItem,
    vscode24.workspace.registerTextDocumentContentProvider(
      ENTITY_SCHEME,
      entityDocProvider
    )
  );
  const treeView = vscode24.window.createTreeView("srsRepositoryTree", {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(treeView);
  const navigatorView = vscode24.window.createTreeView("srsNavigatorTree", {
    treeDataProvider: navigatorProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(navigatorView);
  vscode24.commands.executeCommand("setContext", "srs.navigatorMode", "relations");
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
    vscode24.workspace.onDidSaveTextDocument((doc) => {
      const repo = repoProvider.active;
      if (!repo)
        return;
      const config = vscode24.workspace.getConfiguration("srs");
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
  registerPreviewCommands(context, cli, repoProvider, attention);
  registerEditCommands(context, cli, repoProvider, treeProvider);
  registerGraphCommands(context, cli, repoProvider, entityDocProvider);
  registerNavigatorCommands(context, navigatorProvider);
  registerGuideEditorCommands(context, cli, repoProvider, treeProvider);
  registerArchiveCommands(context, cli, repoProvider, archiveManager);
  await autoDetectRepository(cli, repoProvider);
  const activeRepo = repoProvider.active;
  if (activeRepo) {
    await attention.restore(activeRepo.rootPath);
    statusBarItem.show();
  }
}
async function autoDetectRepository(cli, repoProvider) {
  const config = vscode24.workspace.getConfiguration("srs");
  const configuredPath = config.get("repository.path", null);
  if (configuredPath) {
    const repo = await repoProvider.probe(configuredPath);
    if (repo) {
      repoProvider.setActive(repo);
    } else {
      const action = "Open Settings";
      const choice = await vscode24.window.showWarningMessage(
        `SRS: Configured path '${configuredPath}' is not a valid SRS repository.`,
        action
      );
      if (choice === action) {
        vscode24.commands.executeCommand(
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
    vscode24.window.showInformationMessage(
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
