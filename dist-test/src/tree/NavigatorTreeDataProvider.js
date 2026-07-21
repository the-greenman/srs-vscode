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
exports.NavigatorTreeDataProvider = exports.ContainerRootNode = exports.DocViewSectionNode = exports.DocViewNode = exports.RelationRootNode = exports.RelationTypeGroupNode = exports.EmptyNode = void 0;
const vscode = __importStar(require("vscode"));
const SrsTreeDataProvider_1 = require("./SrsTreeDataProvider");
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
/** A document-view root node */
class DocViewNode extends vscode.TreeItem {
    constructor(viewId, label, sections) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.viewId = viewId;
        this.sections = sections;
        this.contextValue = "srsNavDocView";
        this.tooltip = viewId;
    }
}
exports.DocViewNode = DocViewNode;
/** A section within a document-view */
class DocViewSectionNode extends vscode.TreeItem {
    constructor(sectionId, label, semanticObjectType) {
        super(label, semanticObjectType
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        this.sectionId = sectionId;
        this.semanticObjectType = semanticObjectType;
        this.contextValue = "srsNavSection";
        this.tooltip = semanticObjectType ? `Type: ${semanticObjectType}` : sectionId;
    }
}
exports.DocViewSectionNode = DocViewSectionNode;
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
        if (element instanceof DocViewNode) {
            return element.sections.map((s) => new DocViewSectionNode(s.sectionId, s.title, s.semanticObjectType));
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
            case "relations": return this._getRelationRoots(repoPath);
            case "document-views": return this._getDocViewRoots(repoPath);
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
    async _getDocViewRoots(repoPath) {
        try {
            const payload = await this.cli.runOk(repoPath, ["document-view", "list"]);
            if (payload.documentViews.length === 0)
                return [new EmptyNode("No document views in this repository")];
            // Fetch each document-view's sections
            const nodes = await Promise.all(payload.documentViews.map(async (dv) => {
                const sections = await this._fetchDocViewSections(dv.id, repoPath);
                return new DocViewNode(dv.id, `${dv.namespace}/${dv.name}`, sections);
            }));
            return nodes;
        }
        catch {
            return [new EmptyNode("Failed to load document views")];
        }
    }
    async _fetchDocViewSections(viewId, repoPath) {
        try {
            const payload = await this.cli.runOk(repoPath, ["document-view", "get", viewId]);
            return payload.documentView.sections.map((s) => ({
                sectionId: s.sectionId,
                title: s.title,
                semanticObjectType: s.source?.semanticObjectType,
            }));
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
    async _getSectionRecords(semanticObjectType, repoPath) {
        if (!semanticObjectType)
            return [new EmptyNode("No type binding for this section")];
        try {
            const payload = await this.cli.runOk(repoPath, [
                "record", "list", "--type", semanticObjectType,
            ]);
            if (payload.records.length === 0)
                return [new EmptyNode("No records")];
            return payload.records.map((r) => new SrsTreeDataProvider_1.EntityNode(r.instanceId, "record", r.displayLabel, ["record", "get", r.instanceId]));
        }
        catch {
            return [new EmptyNode(`Failed to load records for ${semanticObjectType}`)];
        }
    }
    async _getContainerMembers(containerId, repoPath) {
        try {
            const payload = await this.cli.runOk(repoPath, ["container", "members", "list", containerId]);
            if (payload.memberInstanceIds.length === 0)
                return [new EmptyNode("No members")];
            // Best-effort: resolve labels from the shared label map (built lazily)
            const labelMap = await this._ensureLabelMap(repoPath);
            return payload.memberInstanceIds.map((id) => {
                const info = labelMap.get(id);
                return new SrsTreeDataProvider_1.EntityNode(id, info?.kind ?? "record", info?.label ?? id.slice(0, 8), [(info?.kind ?? "record") === "note" ? "note" : "record", "get", id]);
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
        const map = new Map();
        const [noteResult, recordResult] = await Promise.allSettled([
            this.cli.runOk(repoPath, ["note", "list"]),
            this.cli.runOk(repoPath, ["record", "list"]),
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
}
exports.NavigatorTreeDataProvider = NavigatorTreeDataProvider;
//# sourceMappingURL=NavigatorTreeDataProvider.js.map