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
exports.SrsTreeDataProvider = exports.EntityNode = exports.GroupNode = void 0;
const vscode = __importStar(require("vscode"));
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
    getArgs) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.entityId = entityId;
        this.entityKind = entityKind;
        this.getArgs = getArgs;
        this.contextValue = "srsEntity";
        this.tooltip = `${entityKind}: ${entityId}`;
        this.description = entityId.slice(0, 8);
        this.command = {
            command: "srs.openEntity",
            title: "Open Entity",
            arguments: [this],
        };
    }
}
exports.EntityNode = EntityNode;
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
        extractItems: (p) => p.tagDefinitions.map((t) => ({
            id: t.instanceId,
            label: t.label ?? t.slug,
        })),
        getArgs: (id) => ["tag", "get", id],
    },
    record: {
        listArgs: ["record", "list"],
        extractItems: (p) => p.records.map((r) => ({
            id: r.instanceId,
            label: `${r.typeNamespace}/${r.typeName}`,
        })),
        getArgs: (id) => ["record", "get", id],
    },
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
        })),
        getArgs: (id) => ["container", "get", id],
    },
    field: {
        listArgs: ["field", "list"],
        extractItems: (p) => p.fields.map((f) => ({
            id: f.id,
            label: `${f.namespace}/${f.name}`,
        })),
        getArgs: (id) => ["field", "get", id],
    },
    type: {
        listArgs: ["type", "list"],
        extractItems: (p) => p.types.map((t) => ({
            id: t.id,
            label: `${t.namespace}/${t.name}`,
        })),
        getArgs: (id) => ["type", "get", id],
    },
    extension: {
        listArgs: ["extension", "list"],
        extractItems: (p) => p.extensions.map((e) => ({
            id: e.instanceId,
            label: e.extensionId ?? e.instanceId,
        })),
        getArgs: (id) => ["extension", "get", id],
    },
    protocol: {
        listArgs: ["protocol", "list"],
        extractItems: (p) => p.protocols.map((pr) => ({
            id: pr.instanceId,
            label: pr.title ?? pr.instanceId,
        })),
        getArgs: (id) => ["protocol", "get", id],
    },
    view: {
        listArgs: ["view", "list"],
        extractItems: (p) => p.views.map((v) => ({
            id: v.id,
            label: `${v.namespace}/${v.name}`,
        })),
        getArgs: (id) => ["view", "get", id],
    },
    "document-view": {
        listArgs: ["document-view", "list"],
        extractItems: (p) => p.documentViews.map((d) => ({
            id: d.id,
            label: `${d.namespace}/${d.name}`,
        })),
        getArgs: (id) => ["document-view", "get", id],
    },
    "relation-type": {
        listArgs: ["relation-type", "list"],
        extractItems: (p) => p.relationTypeDefinitions.map((rt) => ({
            id: rt.id,
            label: rt.label,
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
    ["view", "Views"],
    ["document-view", "Document Views"],
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
            const payload = await this.cli.runOk(repoPath, spec.listArgs, {
                containerId,
            });
            const items = spec.extractItems(payload);
            return items.map((item) => new EntityNode(item.id, kind, item.label, spec.getArgs(item.id)));
        }
        catch {
            // Silently return empty — error already logged to output channel by CliClient
            return [];
        }
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.SrsTreeDataProvider = SrsTreeDataProvider;
//# sourceMappingURL=SrsTreeDataProvider.js.map