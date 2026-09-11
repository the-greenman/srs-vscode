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
exports.NavigatorTreeDataProvider = exports.ContainerRootNode = exports.CompositionSectionNode = exports.CompositionNode = exports.RelationRootNode = exports.RelationTypeGroupNode = exports.EmptyNode = void 0;
const vscode = __importStar(require("vscode"));
const SrsTreeDataProvider_1 = require("./SrsTreeDataProvider");
const labelMap_1 = require("../cli/labelMap");
// ---- Node types ----
/** Root placeholder shown when no repo is active */
class EmptyNode extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "srsNavEmpty";
    }
}
exports.EmptyNode = EmptyNode;
/** Groups peers under a relation type label, e.g. "precedes (3)" */
class RelationTypeGroupNode extends vscode.TreeItem {
    constructor(relationType, peerIds, direction) {
        const arrow = direction === "outgoing" ? "→" : "←";
        super(`${arrow} ${relationType} (${peerIds.length})`, vscode.TreeItemCollapsibleState.Collapsed);
        this.relationType = relationType;
        this.peerIds = peerIds;
        this.direction = direction;
        this.contextValue = "srsNavRelGroup";
        this.tooltip = `${direction} ${relationType} relations`;
    }
}
exports.RelationTypeGroupNode = RelationTypeGroupNode;
/** Top-level entity node in relations mode — expandable to show its relation groups */
class RelationRootNode extends SrsTreeDataProvider_1.EntityNode {
    constructor(entityId, entityKind, label, getArgs) {
        super(entityId, entityKind, label, getArgs);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        // command is set by EntityNode; keep it so single-click opens the entity
    }
}
exports.RelationRootNode = RelationRootNode;
function isSectionExpandable(source) {
    return !!(source?.containerId ||
        (source?.containerIds && source.containerIds.length > 0) ||
        (source?.query?.typeNamespace && source?.query?.typeName));
}
/** A composition root node */
class CompositionNode extends vscode.TreeItem {
    constructor(compositionId, label, sections) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.compositionId = compositionId;
        this.sections = sections;
        this.contextValue = "srsNavComposition";
        this.tooltip = compositionId;
    }
}
exports.CompositionNode = CompositionNode;
/** A section within a composition */
class CompositionSectionNode extends vscode.TreeItem {
    constructor(sectionId, label, source) {
        super(label, isSectionExpandable(source)
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        this.sectionId = sectionId;
        this.source = source;
        this.contextValue = "srsNavSection";
        this.tooltip = source ? `Source: ${source.type}` : sectionId;
    }
}
exports.CompositionSectionNode = CompositionSectionNode;
/** A container root node */
class ContainerRootNode extends vscode.TreeItem {
    constructor(containerId, label, containerType) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.containerId = containerId;
        this.containerType = containerType;
        this.contextValue = "srsNavContainer";
        this.description = containerType;
        this.tooltip = containerId;
    }
}
exports.ContainerRootNode = ContainerRootNode;
// ---- Provider ----
class NavigatorTreeDataProvider {
    constructor(cli, repoProvider) {
        this.cli = cli;
        this.repoProvider = repoProvider;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._mode = "relations";
        this._disposables = [];
        this._disposables.push(repoProvider.onDidChangeActive(() => this.refresh()));
    }
    get mode() { return this._mode; }
    setMode(mode) {
        this._mode = mode;
        this.refresh();
    }
    refresh() {
        this._relations = undefined;
        this._labelMap = undefined;
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
            return element.peerIds.map((p) => new SrsTreeDataProvider_1.EntityNode(p.id, p.kind, p.label, [p.kind === "record" ? "record" : "note", "get", p.id]));
        }
        if (element instanceof CompositionNode) {
            return element.sections.map((s) => new CompositionSectionNode(s.sectionId, s.title ?? s.sectionId, s.source));
        }
        if (element instanceof CompositionSectionNode) {
            return this._getSectionRecords(element.source, repo.rootPath);
        }
        if (element instanceof ContainerRootNode) {
            return this._getContainerMembers(element.containerId, repo.rootPath);
        }
        return [];
    }
    // ---- Root loaders ----
    async _getRoots(repoPath) {
        switch (this._mode) {
            case "relations": return this._getRelationRoots(repoPath);
            case "compositions": return this._getCompositionRoots(repoPath);
            case "containers": return this._getContainerRoots(repoPath);
        }
    }
    async _getRelationRoots(repoPath) {
        const [relations, labelMap] = await this._ensureRelationData(repoPath);
        if (relations.length === 0)
            return [new EmptyNode("No relations in this repository")];
        // Collect all source IDs (nodes with outgoing edges) — these are the roots
        const rootIds = new Set(relations.map((r) => r.sourceId));
        return Array.from(rootIds).map((id) => {
            const info = labelMap.get(id);
            return new RelationRootNode(id, info?.kind ?? "record", info?.label ?? id.slice(0, 8), [(info?.kind ?? "record") === "note" ? "note" : "record", "get", id]);
        });
    }
    async _getCompositionRoots(repoPath) {
        try {
            const payload = await this.cli.runOk(repoPath, ["composition", "list"]);
            if (payload.compositions.length === 0)
                return [new EmptyNode("No compositions in this repository")];
            // Fetch each composition's sections
            const nodes = await Promise.all(payload.compositions.map(async (c) => {
                const sections = await this._fetchCompositionSections(c.id, repoPath);
                return new CompositionNode(c.id, `${c.namespace}/${c.name}`, sections);
            }));
            return nodes;
        }
        catch {
            return [new EmptyNode("Failed to load compositions")];
        }
    }
    async _fetchCompositionSections(compositionId, repoPath) {
        try {
            const payload = await this.cli.runOk(repoPath, ["composition", "get", compositionId]);
            return payload.composition.sections;
        }
        catch {
            return [];
        }
    }
    async _getContainerRoots(repoPath) {
        try {
            const payload = await this.cli.runOk(repoPath, ["container", "list"]);
            if (payload.containers.length === 0)
                return [new EmptyNode("No containers in this repository")];
            return payload.containers.map((c) => new ContainerRootNode(c.containerId, c.title, c.containerType));
        }
        catch {
            return [new EmptyNode("Failed to load containers")];
        }
    }
    // ---- Child loaders ----
    async _getRelationGroups(entityId, repoPath) {
        const [relations, labelMap] = await this._ensureRelationData(repoPath);
        // Group outgoing then incoming by relationType
        const outgoing = new Map();
        const incoming = new Map();
        for (const r of relations) {
            if (r.sourceId === entityId) {
                const info = labelMap.get(r.targetId);
                const entry = { id: r.targetId, kind: (info?.kind ?? "record"), label: info?.label ?? r.targetId.slice(0, 8) };
                const list = outgoing.get(r.relationType) ?? [];
                list.push(entry);
                outgoing.set(r.relationType, list);
            }
            if (r.targetId === entityId) {
                const info = labelMap.get(r.sourceId);
                const entry = { id: r.sourceId, kind: (info?.kind ?? "record"), label: info?.label ?? r.sourceId.slice(0, 8) };
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
    async _getSectionRecords(source, repoPath) {
        if (!isSectionExpandable(source))
            return [new EmptyNode("No source binding for this section")];
        try {
            // container-subset (single or first of a multi-container set): resolve
            // members via container resolve-view — already used by the container
            // preview, and it carries displayLabel directly (no separate label-map
            // round trip needed).
            const containerId = source.containerId ?? source.containerIds?.[0];
            if (containerId) {
                const payload = await this.cli.runOk(repoPath, [
                    "container", "resolve-view", containerId,
                ]);
                const members = payload.containerView.members;
                if (members.length === 0)
                    return [new EmptyNode("No members")];
                return members.map((m) => {
                    const kind = m.tier === 0 ? "note" : "record";
                    return new SrsTreeDataProvider_1.EntityNode(m.instanceId, kind, m.displayLabel, [kind, "get", m.instanceId]);
                });
            }
            // discovery-query: `record list --type` wants namespace/name, not a UUID
            // (was passing a UUID here before the rename too — a second, independent
            // bug on top of the payload-key mismatch).
            const q = source.query;
            if (q?.typeNamespace && q?.typeName) {
                const payload = await this.cli.runOk(repoPath, [
                    "record", "list", "--type", `${q.typeNamespace}/${q.typeName}`,
                ]);
                if (payload.records.length === 0)
                    return [new EmptyNode("No records")];
                return payload.records.map((r) => new SrsTreeDataProvider_1.EntityNode(r.instanceId, "record", r.displayLabel, ["record", "get", r.instanceId]));
            }
            return [new EmptyNode("Unsupported section source shape")];
        }
        catch {
            return [new EmptyNode("Failed to load records for this section")];
        }
    }
    async _getContainerMembers(containerId, repoPath) {
        try {
            // container resolve-view (RFC-020, ADR-023) instead of `container members
            // list`, which returns bare memberInstanceIds — resolve-view already
            // carries displayLabel, so no separate label-map lookup is needed here.
            const payload = await this.cli.runOk(repoPath, [
                "container", "resolve-view", containerId,
            ]);
            const members = payload.containerView.members;
            if (members.length === 0)
                return [new EmptyNode("No members")];
            return members.map((m) => {
                const kind = m.tier === 0 ? "note" : "record";
                return new SrsTreeDataProvider_1.EntityNode(m.instanceId, kind, m.displayLabel, [kind, "get", m.instanceId]);
            });
        }
        catch {
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
        this._labelMap = await (0, labelMap_1.buildLabelMap)(this.cli, repoPath);
        return this._labelMap;
    }
    dispose() {
        this._onDidChangeTreeData.dispose();
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.NavigatorTreeDataProvider = NavigatorTreeDataProvider;
//# sourceMappingURL=NavigatorTreeDataProvider.js.map