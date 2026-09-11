import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { EntityNode } from "./SrsTreeDataProvider";
import { buildLabelMap } from "../cli/labelMap";
import type {
  RelationListPayload,
  RecordListPayload,
  ContainerListPayload,
  CompositionListPayload,
  ContainerResolveViewPayload,
  EntityKind,
} from "../cli/types";

// ---- Mode ----

export type NavigatorMode = "relations" | "compositions" | "containers";

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

// A Composition section's `source` discriminant (RFC-036/f7c9bfec collapsed away the
// old `semanticObjectType` field). Real shapes seen live (muSrs): container-subset
// `{type, containerId}`, discovery-query `{type, query: {typeNamespace, typeName, ...}}`,
// and a multi-container variant `{type, containerIds, containerScope, query}`. `query`'s
// full filter-axis shape (ext:discovery's DiscoveryQuery) isn't modeled beyond the two
// keys the record-list drill-down needs.
export interface CompositionSectionSource {
  type: string;
  containerId?: string;
  containerIds?: string[];
  query?: { typeNamespace?: string; typeName?: string };
}

export interface CompositionSection {
  sectionId: string;
  title?: string;
  source?: CompositionSectionSource;
}

function isSectionExpandable(source: CompositionSectionSource | undefined): boolean {
  return !!(
    source?.containerId ||
    (source?.containerIds && source.containerIds.length > 0) ||
    (source?.query?.typeNamespace && source?.query?.typeName)
  );
}

/** A composition root node */
export class CompositionNode extends vscode.TreeItem {
  constructor(
    public readonly compositionId: string,
    label: string,
    public readonly sections: CompositionSection[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = "srsNavComposition";
    this.tooltip = compositionId;
  }
}

/** A section within a composition */
export class CompositionSectionNode extends vscode.TreeItem {
  constructor(
    public readonly sectionId: string,
    label: string,
    public readonly source: CompositionSectionSource | undefined,
  ) {
    super(
      label,
      isSectionExpandable(source)
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.contextValue = "srsNavSection";
    this.tooltip = source ? `Source: ${source.type}` : sectionId;
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
  | CompositionNode
  | CompositionSectionNode
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

    if (element instanceof CompositionNode) {
      return element.sections.map(
        (s) => new CompositionSectionNode(s.sectionId, s.title ?? s.sectionId, s.source),
      );
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

  private async _getRoots(repoPath: string): Promise<NavigatorNode[]> {
    switch (this._mode) {
      case "relations":    return this._getRelationRoots(repoPath);
      case "compositions": return this._getCompositionRoots(repoPath);
      case "containers":   return this._getContainerRoots(repoPath);
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

  private async _getCompositionRoots(repoPath: string): Promise<NavigatorNode[]> {
    try {
      const payload = await this.cli.runOk<CompositionListPayload>(repoPath, ["composition", "list"]);
      if (payload.compositions.length === 0) return [new EmptyNode("No compositions in this repository")];

      // Fetch each composition's sections
      const nodes = await Promise.all(
        payload.compositions.map(async (c) => {
          const sections = await this._fetchCompositionSections(c.id, repoPath);
          return new CompositionNode(c.id, `${c.namespace}/${c.name}`, sections);
        }),
      );
      return nodes;
    } catch {
      return [new EmptyNode("Failed to load compositions")];
    }
  }

  private async _fetchCompositionSections(
    compositionId: string,
    repoPath: string,
  ): Promise<CompositionSection[]> {
    try {
      const payload = await this.cli.runOk<{
        composition: { sections: CompositionSection[] };
      }>(repoPath, ["composition", "get", compositionId]);
      return payload.composition.sections;
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
    source: CompositionSectionSource | undefined,
    repoPath: string,
  ): Promise<NavigatorNode[]> {
    if (!isSectionExpandable(source)) return [new EmptyNode("No source binding for this section")];
    try {
      // container-subset (single or first of a multi-container set): resolve
      // members via container resolve-view — already used by the container
      // preview, and it carries displayLabel directly (no separate label-map
      // round trip needed).
      const containerId = source!.containerId ?? source!.containerIds?.[0];
      if (containerId) {
        const payload = await this.cli.runOk<ContainerResolveViewPayload>(repoPath, [
          "container", "resolve-view", containerId,
        ]);
        const members = payload.containerView.members;
        if (members.length === 0) return [new EmptyNode("No members")];
        return members.map((m) => {
          const kind: EntityKind = m.tier === 0 ? "note" : "record";
          return new EntityNode(m.instanceId, kind, m.displayLabel, [kind, "get", m.instanceId]);
        });
      }

      // discovery-query: `record list --type` wants namespace/name, not a UUID
      // (was passing a UUID here before the rename too — a second, independent
      // bug on top of the payload-key mismatch).
      const q = source!.query;
      if (q?.typeNamespace && q?.typeName) {
        const payload = await this.cli.runOk<RecordListPayload>(repoPath, [
          "record", "list", "--type", `${q.typeNamespace}/${q.typeName}`,
        ]);
        if (payload.records.length === 0) return [new EmptyNode("No records")];
        return payload.records.map(
          (r) => new EntityNode(
            r.instanceId,
            "record",
            r.displayLabel,
            ["record", "get", r.instanceId],
          ),
        );
      }

      return [new EmptyNode("Unsupported section source shape")];
    } catch {
      return [new EmptyNode("Failed to load records for this section")];
    }
  }

  private async _getContainerMembers(
    containerId: string,
    repoPath: string,
  ): Promise<NavigatorNode[]> {
    try {
      // container resolve-view (RFC-020, ADR-023) instead of `container members
      // list`, which returns bare memberInstanceIds — resolve-view already
      // carries displayLabel, so no separate label-map lookup is needed here.
      const payload = await this.cli.runOk<ContainerResolveViewPayload>(repoPath, [
        "container", "resolve-view", containerId,
      ]);
      const members = payload.containerView.members;
      if (members.length === 0) return [new EmptyNode("No members")];
      return members.map((m) => {
        const kind: EntityKind = m.tier === 0 ? "note" : "record";
        return new EntityNode(m.instanceId, kind, m.displayLabel, [kind, "get", m.instanceId]);
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
    this._labelMap = await buildLabelMap(this.cli, repoPath);
    return this._labelMap;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
