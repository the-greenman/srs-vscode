import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { EntityNode } from "./SrsTreeDataProvider";
import type {
  RelationListPayload,
  NoteListPayload,
  RecordListPayload,
  ContainerListPayload,
  DocumentViewListPayload,
  EntityKind,
} from "../cli/types";

// ---- Mode ----

export type NavigatorMode = "relations" | "document-views" | "containers";

// ---- Node types ----

/** Root placeholder shown when no repo is active */
export class EmptyNode extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "srsNavEmpty";
  }
}


/** Groups peers under a relation type label, e.g. "precedes (3)" */
export class RelationTypeGroupNode extends vscode.TreeItem {
  constructor(
    public readonly relationType: string,
    public readonly peerIds: Array<{ id: string; kind: EntityKind; label: string }>,
    public readonly direction: "outgoing" | "incoming",
  ) {
    const arrow = direction === "outgoing" ? "→" : "←";
    super(
      `${arrow} ${relationType} (${peerIds.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = "srsNavRelGroup";
    this.tooltip = `${direction} ${relationType} relations`;
  }
}

/** Top-level entity node in relations mode — expandable to show its relation groups */
export class RelationRootNode extends EntityNode {
  constructor(
    entityId: string,
    entityKind: EntityKind,
    label: string,
    getArgs: string[],
  ) {
    super(entityId, entityKind, label, getArgs);
    this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    // command is set by EntityNode; keep it so single-click opens the entity
  }
}

/** A document-view root node */
export class DocViewNode extends vscode.TreeItem {
  constructor(
    public readonly viewId: string,
    label: string,
    public readonly sections: Array<{ sectionId: string; title: string; semanticObjectType?: string }>,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "srsNavDocView";
    this.tooltip = viewId;
  }
}

/** A section within a document-view */
export class DocViewSectionNode extends vscode.TreeItem {
  constructor(
    public readonly sectionId: string,
    label: string,
    public readonly semanticObjectType: string | undefined,
  ) {
    super(
      label,
      semanticObjectType
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.contextValue = "srsNavSection";
    this.tooltip = semanticObjectType ? `Type: ${semanticObjectType}` : sectionId;
  }
}

/** A container root node */
export class ContainerRootNode extends vscode.TreeItem {
  constructor(
    public readonly containerId: string,
    label: string,
    public readonly containerType: string | undefined,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "srsNavContainer";
    this.description = containerType;
    this.tooltip = containerId;
  }
}

export type NavigatorNode =
  | EmptyNode
  | EntityNode
  | RelationTypeGroupNode
  | RelationRootNode
  | DocViewNode
  | DocViewSectionNode
  | ContainerRootNode;

// ---- Provider ----

export class NavigatorTreeDataProvider
  implements vscode.TreeDataProvider<NavigatorNode>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<NavigatorNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _mode: NavigatorMode = "relations";

  // Cached per-refresh data (cleared on refresh)
  private _relations: RelationListPayload["relations"] | undefined;
  private _labelMap: Map<string, { label: string; kind: EntityKind }> | undefined;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly cli: CliClient,
    private readonly repoProvider: RepositoryProvider,
  ) {
    this._disposables.push(
      repoProvider.onDidChangeActive(() => this.refresh()),
    );
  }

  get mode(): NavigatorMode { return this._mode; }

  setMode(mode: NavigatorMode): void {
    this._mode = mode;
    this.refresh();
  }

  refresh(): void {
    this._relations = undefined;
    this._labelMap = undefined;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: NavigatorNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: NavigatorNode): Promise<NavigatorNode[]> {
    const repo = this.repoProvider.active;
    if (!repo) return [new EmptyNode("No active SRS repository")];

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
          [p.kind === "record" ? "record" : "note", "get", p.id],
        ),
      );
    }

    if (element instanceof DocViewNode) {
      return element.sections.map(
        (s) => new DocViewSectionNode(s.sectionId, s.title, s.semanticObjectType),
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

  private async _getRoots(repoPath: string): Promise<NavigatorNode[]> {
    switch (this._mode) {
      case "relations":      return this._getRelationRoots(repoPath);
      case "document-views": return this._getDocViewRoots(repoPath);
      case "containers":     return this._getContainerRoots(repoPath);
    }
  }

  private async _getRelationRoots(repoPath: string): Promise<NavigatorNode[]> {
    const [relations, labelMap] = await this._ensureRelationData(repoPath);
    if (relations.length === 0) return [new EmptyNode("No relations in this repository")];

    // Collect all source IDs (nodes with outgoing edges) — these are the roots
    const rootIds = new Set(relations.map((r) => r.sourceId));

    return Array.from(rootIds).map((id) => {
      const info = labelMap.get(id);
      return new RelationRootNode(
        id,
        info?.kind ?? "record",
        info?.label ?? id.slice(0, 8),
        [(info?.kind ?? "record") === "note" ? "note" : "record", "get", id],
      );
    });
  }

  private async _getDocViewRoots(repoPath: string): Promise<NavigatorNode[]> {
    try {
      const payload = await this.cli.runOk<DocumentViewListPayload>(repoPath, ["document-view", "list"]);
      if (payload.documentViews.length === 0) return [new EmptyNode("No document views in this repository")];

      // Fetch each document-view's sections
      const nodes = await Promise.all(
        payload.documentViews.map(async (dv) => {
          const sections = await this._fetchDocViewSections(dv.id, repoPath);
          return new DocViewNode(dv.id, `${dv.namespace}/${dv.name}`, sections);
        }),
      );
      return nodes;
    } catch {
      return [new EmptyNode("Failed to load document views")];
    }
  }

  private async _fetchDocViewSections(
    viewId: string,
    repoPath: string,
  ): Promise<Array<{ sectionId: string; title: string; semanticObjectType?: string }>> {
    try {
      const payload = await this.cli.runOk<{
        documentView: {
          sections: Array<{
            sectionId: string;
            title: string;
            source?: { type: string; semanticObjectType?: string };
          }>;
        };
      }>(repoPath, ["document-view", "get", viewId]);
      return payload.documentView.sections.map((s) => ({
        sectionId: s.sectionId,
        title: s.title,
        semanticObjectType: s.source?.semanticObjectType,
      }));
    } catch {
      return [];
    }
  }

  private async _getContainerRoots(repoPath: string): Promise<NavigatorNode[]> {
    try {
      const payload = await this.cli.runOk<ContainerListPayload>(repoPath, ["container", "list"]);
      if (payload.containers.length === 0) return [new EmptyNode("No containers in this repository")];
      return payload.containers.map(
        (c) => new ContainerRootNode(c.containerId, c.title, c.containerType),
      );
    } catch {
      return [new EmptyNode("Failed to load containers")];
    }
  }

  // ---- Child loaders ----

  private async _getRelationGroups(
    entityId: string,
    repoPath: string,
  ): Promise<NavigatorNode[]> {
    const [relations, labelMap] = await this._ensureRelationData(repoPath);

    // Group outgoing then incoming by relationType
    const outgoing = new Map<string, Array<{ id: string; kind: EntityKind; label: string }>>();
    const incoming = new Map<string, Array<{ id: string; kind: EntityKind; label: string }>>();

    for (const r of relations) {
      if (r.sourceId === entityId) {
        const info = labelMap.get(r.targetId);
        const entry = { id: r.targetId, kind: (info?.kind ?? "record") as EntityKind, label: info?.label ?? r.targetId.slice(0, 8) };
        const list = outgoing.get(r.relationType) ?? [];
        list.push(entry);
        outgoing.set(r.relationType, list);
      }
      if (r.targetId === entityId) {
        const info = labelMap.get(r.sourceId);
        const entry = { id: r.sourceId, kind: (info?.kind ?? "record") as EntityKind, label: info?.label ?? r.sourceId.slice(0, 8) };
        const list = incoming.get(r.relationType) ?? [];
        list.push(entry);
        incoming.set(r.relationType, list);
      }
    }

    const nodes: NavigatorNode[] = [];
    for (const [type, peers] of outgoing) {
      nodes.push(new RelationTypeGroupNode(type, peers, "outgoing"));
    }
    for (const [type, peers] of incoming) {
      nodes.push(new RelationTypeGroupNode(type, peers, "incoming"));
    }

    if (nodes.length === 0) return [new EmptyNode("No relations")];
    return nodes;
  }

  private async _getSectionRecords(
    semanticObjectType: string | undefined,
    repoPath: string,
  ): Promise<NavigatorNode[]> {
    if (!semanticObjectType) return [new EmptyNode("No type binding for this section")];
    try {
      const payload = await this.cli.runOk<RecordListPayload>(repoPath, [
        "record", "list", "--type", semanticObjectType,
      ]);
      if (payload.records.length === 0) return [new EmptyNode("No records")];
      return payload.records.map(
        (r) => new EntityNode(
          r.instanceId,
          "record",
          r.typeName,
          ["record", "get", r.instanceId],
        ),
      );
    } catch {
      return [new EmptyNode(`Failed to load records for ${semanticObjectType}`)];
    }
  }

  private async _getContainerMembers(
    containerId: string,
    repoPath: string,
  ): Promise<NavigatorNode[]> {
    try {
      const payload = await this.cli.runOk<{ containerId: string; memberInstanceIds: string[] }>(
        repoPath,
        ["container", "members", "list", containerId],
      );
      if (payload.memberInstanceIds.length === 0) return [new EmptyNode("No members")];

      // Best-effort: resolve labels from the shared label map (built lazily)
      const labelMap = await this._ensureLabelMap(repoPath);
      return payload.memberInstanceIds.map((id) => {
        const info = labelMap.get(id);
        return new EntityNode(
          id,
          info?.kind ?? "record",
          info?.label ?? id.slice(0, 8),
          [(info?.kind ?? "record") === "note" ? "note" : "record", "get", id],
        );
      });
    } catch {
      return [new EmptyNode("Failed to load members")];
    }
  }

  // ---- Shared data helpers ----

  private async _ensureRelationData(
    repoPath: string,
  ): Promise<[RelationListPayload["relations"], Map<string, { label: string; kind: EntityKind }>]> {
    if (!this._relations) {
      const payload = await this.cli.runOk<RelationListPayload>(repoPath, ["relation", "list"]);
      this._relations = payload.relations;
    }
    const labelMap = await this._ensureLabelMap(repoPath);
    return [this._relations, labelMap];
  }

  private async _ensureLabelMap(
    repoPath: string,
  ): Promise<Map<string, { label: string; kind: EntityKind }>> {
    if (this._labelMap) return this._labelMap;

    const map = new Map<string, { label: string; kind: EntityKind }>();
    const [noteResult, recordResult] = await Promise.allSettled([
      this.cli.runOk<NoteListPayload>(repoPath, ["note", "list"]),
      this.cli.runOk<RecordListPayload>(repoPath, ["record", "list"]),
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

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
