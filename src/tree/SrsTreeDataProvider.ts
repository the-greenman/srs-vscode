import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { AttentionManager } from "../container/AttentionManager";
import type {
  EntityKind,
  NoteListPayload,
  TagListPayload,
  RecordListPayload,
  RelationListPayload,
  ContainerListPayload,
  FieldListPayload,
  TypeListPayload,
  ExtensionListPayload,
  ProtocolListPayload,
  BlueprintListPayload,
  ViewListPayload,
  DocumentViewListPayload,
  RelationTypeListPayload,
} from "../cli/types";

// ---- Tree item types ----

export class GroupNode extends vscode.TreeItem {
  constructor(
    public readonly kind: EntityKind,
    label: string,
    count: number,
  ) {
    super(
      count > 0 ? `${label} (${count})` : label,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.contextValue = "srsGroup";
    this.tooltip = `${label} — ${count} items`;
  }
}

export class EntityNode extends vscode.TreeItem {
  constructor(
    public readonly entityId: string,
    public readonly entityKind: EntityKind,
    label: string,
    // CLI args to retrieve this entity, e.g. ["note", "get", "<id>"]
    public readonly getArgs: string[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "srsEntity";
    this.tooltip = `${entityKind}: ${entityId}`;
    this.description = entityId.slice(0, 8);
    this.command = {
      command: "srs.openEntityDefault",
      title: "Open",
      arguments: [this],
    };
  }
}

export type SrsTreeNode = GroupNode | EntityNode;

// ---- Entity spec table ----
// Each entry maps an EntityKind to its list CLI args, a payload extractor,
// and the args needed to get a single entity by ID.

interface EntitySpec {
  listArgs: string[];
  extractItems: (payload: unknown) => Array<{ id: string; label: string }>;
  getArgs: (id: string) => string[];
}

const ENTITY_SPECS: Record<EntityKind, EntitySpec> = {
  note: {
    listArgs: ["note", "list"],
    extractItems: (p) =>
      (p as NoteListPayload).notes.map((n) => ({
        id: n.instanceId,
        label: n.title,
      })),
    getArgs: (id) => ["note", "get", id],
  },
  tag: {
    listArgs: ["tag", "list"],
    extractItems: (p) =>
      (p as TagListPayload).tagDefinitions.map((t) => ({
        id: t.instanceId,
        label: t.label ?? t.slug,
      })),
    getArgs: (id) => ["tag", "get", id],
  },
  record: {
    listArgs: ["record", "list"],
    extractItems: (p) =>
      (p as RecordListPayload).records.map((r) => ({
        id: r.instanceId,
        label: r.displayLabel,
      })),
    getArgs: (id) => ["record", "get", id],
  },
  relation: {
    listArgs: ["relation", "list"],
    extractItems: (p) =>
      (p as RelationListPayload).relations.map((r) => ({
        id: r.relationId,
        label: `${r.relationType}: ${r.sourceId.slice(0, 8)}→${r.targetId.slice(0, 8)}`,
      })),
    getArgs: (id) => ["relation", "get", id],
  },
  container: {
    listArgs: ["container", "list"],
    extractItems: (p) =>
      (p as ContainerListPayload).containers.map((c) => ({
        id: c.containerId,
        label: c.title,
      })),
    getArgs: (id) => ["container", "get", id],
  },
  field: {
    listArgs: ["field", "list"],
    extractItems: (p) =>
      (p as FieldListPayload).fields.map((f) => ({
        id: f.id,
        label: `${f.namespace}/${f.name}`,
      })),
    getArgs: (id) => ["field", "get", id],
  },
  type: {
    listArgs: ["type", "list"],
    extractItems: (p) =>
      (p as TypeListPayload).types.map((t) => ({
        id: t.id,
        label: `${t.namespace}/${t.name}`,
      })),
    getArgs: (id) => ["type", "get", id],
  },
  extension: {
    listArgs: ["extension", "list"],
    extractItems: (p) =>
      (p as ExtensionListPayload).extensions.map((e) => ({
        id: e.instanceId,
        label: e.extensionId ?? e.instanceId,
      })),
    getArgs: (id) => ["extension", "get", id],
  },
  protocol: {
    listArgs: ["protocol", "list"],
    extractItems: (p) =>
      (p as ProtocolListPayload).protocols.map((pr) => ({
        id: pr.instanceId,
        label: `${pr.namespace}/${pr.name} v${pr.version}`,
      })),
    getArgs: (id) => ["protocol", "get", id],
  },
  blueprint: {
    listArgs: ["blueprint", "list"],
    extractItems: (p) =>
      (p as BlueprintListPayload).blueprints.map((b) => ({
        id: b.blueprintId,
        label: `${b.namespace}/${b.name} v${b.version}`,
      })),
    getArgs: (id) => ["blueprint", "get", id],
  },
  view: {
    listArgs: ["view", "list"],
    extractItems: (p) =>
      (p as ViewListPayload).views.map((v) => ({
        id: v.id,
        label: `${v.namespace}/${v.name}`,
      })),
    getArgs: (id) => ["view", "get", id],
  },
  "document-view": {
    listArgs: ["document-view", "list"],
    extractItems: (p) =>
      (p as DocumentViewListPayload).documentViews.map((d) => ({
        id: d.id,
        label: `${d.namespace}/${d.name}`,
      })),
    getArgs: (id) => ["document-view", "get", id],
  },
  "relation-type": {
    listArgs: ["relation-type", "list"],
    extractItems: (p) =>
      (p as RelationTypeListPayload).relationTypeDefinitions.map((rt) => ({
        id: rt.id,
        label: rt.label,
      })),
    getArgs: (id) => ["relation-type", "get", id],
  },
};

// Display order and names for top-level group nodes
const GROUP_ORDER: Array<[EntityKind, string]> = [
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
  ["relation-type", "Relation Types"],
];

// ---- Provider ----

export class SrsTreeDataProvider implements vscode.TreeDataProvider<SrsTreeNode>, vscode.Disposable {
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<SrsTreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly cli: CliClient,
    private readonly repoProvider: RepositoryProvider,
    private readonly attention?: AttentionManager,
  ) {
    // Full tree refresh whenever the active repository changes
    this._disposables.push(
      repoProvider.onDidChangeActive(() => this.refresh()),
    );
    // Refresh when active container changes (filtered view changes)
    if (attention) {
      this._disposables.push(attention.onDidChange(() => this.refresh()));
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SrsTreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SrsTreeNode): Promise<SrsTreeNode[]> {
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
  private countFromRepoMap(
    kind: EntityKind,
    counts: { notes: number; records: number; totalInstances: number },
  ): number {
    if (kind === "note") return counts.notes;
    if (kind === "record") return counts.records;
    return 0;
  }

  private async loadGroupChildren(
    kind: EntityKind,
    repoPath: string,
  ): Promise<EntityNode[]> {
    const spec = ENTITY_SPECS[kind];
    const containerId = this.attention?.active?.containerId;
    try {
      const payload = await this.cli.runOk<unknown>(repoPath, spec.listArgs, {
        containerId,
      });
      const items = spec.extractItems(payload);
      return items.map(
        (item) => new EntityNode(item.id, kind, item.label, spec.getArgs(item.id)),
      );
    } catch {
      // Silently return empty — error already logged to output channel by CliClient
      return [];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
