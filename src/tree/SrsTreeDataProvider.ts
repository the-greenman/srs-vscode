import * as vscode from "vscode";
import { CliClient } from "../cli/CliClient";
import { CliError } from "../cli/errors";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { AttentionManager } from "../container/AttentionManager";
import { buildLabelMap } from "../cli/labelMap";
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
  CompositionListPayload,
  ThemeListPayload,
  RelationTypeListPayload,
} from "../cli/types";

// Convert an EntityKind into a regex-safe camelCase contextValue suffix,
// e.g. "relation-type" → "relationType" ("composition" needs no conversion).
function entityKindToContext(kind: EntityKind): string {
  return kind.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

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
    // Human-meaningful secondary text the payload already carries (a record's
    // type, a definition's version, a container's type, ...) — falls back to
    // a uuid8 stub only when the caller has nothing better to show.
    description?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
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
    } else {
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

/** Shown in place of a group's children when the underlying CLI call failed —
 * so a broken group reads as an actionable error, not indistinguishable from
 * "this repository legitimately has zero of these". */
export class ErrorNode extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "srsError";
    this.iconPath = new vscode.ThemeIcon("error");
    this.tooltip = message;
  }
}

export type SrsTreeNode = GroupNode | EntityNode | ErrorNode;

// ---- Entity spec table ----
// Each entry maps an EntityKind to its list CLI args, a payload extractor,
// and the args needed to get a single entity by ID.

interface EntitySpec {
  listArgs: string[];
  extractItems: (payload: unknown) => Array<{ id: string; label: string; description?: string }>;
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
      (p as TagListPayload).terms.map((t) => ({
        id: t.id,
        label: t.label ?? t.key,
      })),
    getArgs: (id) => ["tag", "get", id],
  },
  record: {
    listArgs: ["record", "list"],
    extractItems: (p) =>
      (p as RecordListPayload).records.map((r) => ({
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
        description: c.containerType,
      })),
    getArgs: (id) => ["container", "get", id],
  },
  field: {
    listArgs: ["field", "list"],
    extractItems: (p) =>
      (p as FieldListPayload).fields.map((f) => ({
        id: f.id,
        label: `${f.namespace}/${f.name}`,
        description: `v${f.version}`,
      })),
    getArgs: (id) => ["field", "get", id],
  },
  type: {
    listArgs: ["type", "list"],
    extractItems: (p) =>
      (p as TypeListPayload).types.map((t) => ({
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
    extractItems: (p) =>
      (p as ExtensionListPayload).extensions.map((e) => ({
        id: e,
        label: e,
      })),
    getArgs: () => ["repo", "extensions", "list"],
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
  composition: {
    listArgs: ["composition", "list"],
    extractItems: (p) =>
      (p as CompositionListPayload).compositions.map((d) => ({
        id: d.id,
        label: `${d.namespace}/${d.name}`,
        description: `v${d.version}`,
      })),
    getArgs: (id) => ["composition", "get", id],
  },
  theme: {
    listArgs: ["theme", "list"],
    extractItems: (p) =>
      (p as ThemeListPayload).themes.map((t) => ({
        id: t.id,
        label: `${t.namespace}/${t.name}`,
        description: `v${t.version}`,
      })),
    getArgs: (id) => ["theme", "get", id],
  },
  "relation-type": {
    listArgs: ["relation-type", "list"],
    extractItems: (p) =>
      (p as RelationTypeListPayload).relationTypeDefinitions.map((rt) => ({
        id: rt.id,
        label: rt.label,
        description: rt.relationType,
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
  ["composition", "Compositions"],
  ["theme", "Themes"],
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
  ): Promise<Array<EntityNode | ErrorNode>> {
    const spec = ENTITY_SPECS[kind];
    const containerId = this.attention?.active?.containerId;
    try {
      if (kind === "relation") {
        // Resolve source/target labels via the shared label map instead of the
        // uuid8→uuid8 stub extractItems falls back to — this is the "every
        // relation renders as <uuid8>→<uuid8>" bug (srs-vscode#119 workstream 5).
        const [payload, labelMap] = await Promise.all([
          this.cli.runOk<RelationListPayload>(repoPath, spec.listArgs, { containerId }),
          buildLabelMap(this.cli, repoPath),
        ]);
        return payload.relations.map((r) => {
          const s = labelMap.get(r.sourceId);
          const t = labelMap.get(r.targetId);
          const label = `${r.relationType}: ${s?.label ?? r.sourceId.slice(0, 8)} → ${t?.label ?? r.targetId.slice(0, 8)}`;
          return new EntityNode(r.relationId, kind, label, spec.getArgs(r.relationId));
        });
      }

      const payload = await this.cli.runOk<unknown>(repoPath, spec.listArgs, {
        containerId,
      });
      const items = spec.extractItems(payload);
      return items.map(
        (item) => new EntityNode(item.id, kind, item.label, spec.getArgs(item.id), item.description),
      );
    } catch (err) {
      // Surface the failure as a node instead of silently returning [] — an
      // unknown-subcommand or repo error must be visible, not indistinguishable
      // from "this repository legitimately has zero of these" (srs-vscode#119
      // workstream 6). CliClient already logs the raw error to the output channel.
      const msg = err instanceof CliError ? err.message : String(err);
      return [new ErrorNode(`Failed to load ${kind}: ${msg}`)];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
