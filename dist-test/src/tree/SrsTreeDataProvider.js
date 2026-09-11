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
exports.SrsTreeDataProvider = exports.ErrorNode = exports.EntityNode = exports.GroupNode = void 0;
const vscode = __importStar(require("vscode"));
const errors_1 = require("../cli/errors");
const labelMap_1 = require("../cli/labelMap");
// Convert an EntityKind into a regex-safe camelCase contextValue suffix,
// e.g. "relation-type" → "relationType" ("composition" needs no conversion).
function entityKindToContext(kind) {
    return kind.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}
// ---- Tree item types ----
class GroupNode extends vscode.TreeItem {
    constructor(kind, label, count) {
        super(count > 0 ? `${label} (${count})` : label, vscode.TreeItemCollapsibleState.Collapsed);
        this.kind = kind;
        this.contextValue = "srsGroup";
        this.tooltip = `${label} — ${count} items`;
    }
}
exports.GroupNode = GroupNode;
class EntityNode extends vscode.TreeItem {
    constructor(entityId, entityKind, label, 
    // CLI args to retrieve this entity, e.g. ["note", "get", "<id>"]
    getArgs, 
    // Human-meaningful secondary text the payload already carries (a record's
    // type, a definition's version, a container's type, ...) — falls back to
    // a uuid8 stub only when the caller has nothing better to show.
    description) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.entityId = entityId;
        this.entityKind = entityKind;
        this.getArgs = getArgs;
        // Per-kind contextValue so menus can target specific kinds (e.g. only
        // composition / container get the render action). The `srsEntity.` prefix
        // is matched by the generic entity menus via `viewItem =~ /^srsEntity/`.
        this.contextValue = `srsEntity.${entityKindToContext(entityKind)}`;
        if (entityKind === "extension") {
            // `repo extensions list` returns plain strings, not instances with an
            // instanceId — entityId IS the label (e.g. "ext:lifecycle"); there is no
            // "extension get" to describe or link to. See openEntityDefault's
            // special case for this kind.
            this.tooltip = entityId;
        }
        else {
            this.tooltip = `${entityKind}: ${entityId}`;
            this.description = description ?? entityId.slice(0, 8);
        }
        this.command = {
            command: "srs.openEntityDefault",
            title: "Open",
            arguments: [this],
        };
    }
}
exports.EntityNode = EntityNode;
/** Shown in place of a group's children when the underlying CLI call failed —
 * so a broken group reads as an actionable error, not indistinguishable from
 * "this repository legitimately has zero of these". */
class ErrorNode extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "srsError";
        this.iconPath = new vscode.ThemeIcon("error");
        this.tooltip = message;
    }
}
exports.ErrorNode = ErrorNode;
const ENTITY_SPECS = {
    note: {
        listArgs: ["note", "list"],
        extractItems: (p) => p.notes.map((n) => ({
            id: n.instanceId,
            label: n.title,
        })),
        getArgs: (id) => ["note", "get", id],
    },
    tag: {
        listArgs: ["tag", "list"],
        extractItems: (p) => p.terms.map((t) => ({
            id: t.id,
            label: t.label ?? t.key,
        })),
        getArgs: (id) => ["tag", "get", id],
    },
    record: {
        listArgs: ["record", "list"],
        extractItems: (p) => p.records.map((r) => ({
            id: r.instanceId,
            label: r.displayLabel,
            description: `${r.record.typeNamespace}/${r.record.typeName}`,
        })),
        getArgs: (id) => ["record", "get", id],
    },
    // Labels are resolved separately in loadGroupChildren (needs the async label
    // map) — extractItems here is the id-only fallback used if that path is
    // bypassed, and stays uuid8-based on purpose as a degrade-gracefully floor.
    relation: {
        listArgs: ["relation", "list"],
        extractItems: (p) => p.relations.map((r) => ({
            id: r.relationId,
            label: `${r.relationType}: ${r.sourceId.slice(0, 8)}→${r.targetId.slice(0, 8)}`,
        })),
        getArgs: (id) => ["relation", "get", id],
    },
    container: {
        listArgs: ["container", "list"],
        extractItems: (p) => p.containers.map((c) => ({
            id: c.containerId,
            label: c.title,
            description: c.containerType,
        })),
        getArgs: (id) => ["container", "get", id],
    },
    field: {
        listArgs: ["field", "list"],
        extractItems: (p) => p.fields.map((f) => ({
            id: f.id,
            label: `${f.namespace}/${f.name}`,
            description: `v${f.version}`,
        })),
        getArgs: (id) => ["field", "get", id],
    },
    type: {
        listArgs: ["type", "list"],
        extractItems: (p) => p.types.map((t) => ({
            id: t.id,
            label: `${t.namespace}/${t.name}`,
            description: `v${t.version}`,
        })),
        getArgs: (id) => ["type", "get", id],
    },
    // `extension list` no longer exists — moved to `repo extensions list`, which
    // returns plain declared-extension strings (payload.extensions: string[]),
    // not objects with an instanceId. There is no "extension get"; these are
    // leaf nodes labeled by the string itself (see EntityNode's extension-kind
    // special case and openEntityDefault's).
    extension: {
        listArgs: ["repo", "extensions", "list"],
        extractItems: (p) => p.extensions.map((e) => ({
            id: e,
            label: e,
        })),
        getArgs: () => ["repo", "extensions", "list"],
    },
    protocol: {
        listArgs: ["protocol", "list"],
        extractItems: (p) => p.protocols.map((pr) => ({
            id: pr.instanceId,
            label: `${pr.namespace}/${pr.name} v${pr.version}`,
        })),
        getArgs: (id) => ["protocol", "get", id],
    },
    blueprint: {
        listArgs: ["blueprint", "list"],
        extractItems: (p) => p.blueprints.map((b) => ({
            id: b.blueprintId,
            label: `${b.namespace}/${b.name} v${b.version}`,
        })),
        getArgs: (id) => ["blueprint", "get", id],
    },
    view: {
        listArgs: ["view", "list"],
        extractItems: (p) => p.views.map((v) => ({
            id: v.id,
            label: `${v.namespace}/${v.name}`,
        })),
        getArgs: (id) => ["view", "get", id],
    },
    composition: {
        listArgs: ["composition", "list"],
        extractItems: (p) => p.compositions.map((d) => ({
            id: d.id,
            label: `${d.namespace}/${d.name}`,
            description: `v${d.version}`,
        })),
        getArgs: (id) => ["composition", "get", id],
    },
    theme: {
        listArgs: ["theme", "list"],
        extractItems: (p) => p.themes.map((t) => ({
            id: t.id,
            label: `${t.namespace}/${t.name}`,
            description: `v${t.version}`,
        })),
        getArgs: (id) => ["theme", "get", id],
    },
    "relation-type": {
        listArgs: ["relation-type", "list"],
        extractItems: (p) => p.relationTypeDefinitions.map((rt) => ({
            id: rt.id,
            label: rt.label,
            description: rt.relationType,
        })),
        getArgs: (id) => ["relation-type", "get", id],
    },
};
// Display order and names for top-level group nodes
const GROUP_ORDER = [
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
    ["composition", "Compositions"],
    ["theme", "Themes"],
    ["relation-type", "Relation Types"],
];
// ---- Provider ----
class SrsTreeDataProvider {
    constructor(cli, repoProvider, attention) {
        this.cli = cli;
        this.repoProvider = repoProvider;
        this.attention = attention;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._disposables = [];
        // Full tree refresh whenever the active repository changes
        this._disposables.push(repoProvider.onDidChangeActive(() => this.refresh()));
        // Refresh when active container changes (filtered view changes)
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
            // Root: one GroupNode per entity kind
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
        const containerId = this.attention?.active?.containerId;
        try {
            if (kind === "relation") {
                // Resolve source/target labels via the shared label map instead of the
                // uuid8→uuid8 stub extractItems falls back to — this is the "every
                // relation renders as <uuid8>→<uuid8>" bug (srs-vscode#119 workstream 5).
                const [payload, labelMap] = await Promise.all([
                    this.cli.runOk(repoPath, spec.listArgs, { containerId }),
                    (0, labelMap_1.buildLabelMap)(this.cli, repoPath),
                ]);
                return payload.relations.map((r) => {
                    const s = labelMap.get(r.sourceId);
                    const t = labelMap.get(r.targetId);
                    const label = `${r.relationType}: ${s?.label ?? r.sourceId.slice(0, 8)} → ${t?.label ?? r.targetId.slice(0, 8)}`;
                    return new EntityNode(r.relationId, kind, label, spec.getArgs(r.relationId));
                });
            }
            const payload = await this.cli.runOk(repoPath, spec.listArgs, {
                containerId,
            });
            const items = spec.extractItems(payload);
            return items.map((item) => new EntityNode(item.id, kind, item.label, spec.getArgs(item.id), item.description));
        }
        catch (err) {
            // Surface the failure as a node instead of silently returning [] — an
            // unknown-subcommand or repo error must be visible, not indistinguishable
            // from "this repository legitimately has zero of these" (srs-vscode#119
            // workstream 6). CliClient already logs the raw error to the output channel.
            const msg = err instanceof errors_1.CliError ? err.message : String(err);
            return [new ErrorNode(`Failed to load ${kind}: ${msg}`)];
        }
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.SrsTreeDataProvider = SrsTreeDataProvider;
//# sourceMappingURL=SrsTreeDataProvider.js.map