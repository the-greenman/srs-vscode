// One entry of the top-level `errors[]` on an `ok:false` envelope (srs-rust ADR-053),
// aligned 1:1 with `diagnostics`. `code` is the stable kebab-case error code to branch
// on (e.g. "cannot-delete-in-use") — never match on `message`/`diagnostics` text, which
// is free-form prose and not a contract (srs-vscode#131).
export interface ErrorReportPayload {
  code: string;
  message: string;
  details?: { usedBy?: string[]; [key: string]: unknown };
}

// JSON envelope shapes returned by every srs CLI command.
// ok:true responses carry a typed payload; ok:false carry a string[] diagnostics array
// plus, since srs-rust#1338, a structured `errors[]` aligned 1:1 with it.
export type SrsEnvelope<T> =
  | { ok: true; command: string; version: string; payload: T }
  | {
      ok: false;
      command: string;
      version: string;
      diagnostics: string[];
      errors?: ErrorReportPayload[];
    };

// A Record's field-value carrier (RFC-039): a JSON object keyed by `Field.name` verbatim,
// recursive over scalar / list / inline-composite shapes. `fieldId` is not stored in the
// instance — resolve names/labels via `type schema` (see cli/typeFields.ts).
export type FieldValues = Record<string, unknown>;

// repo map
export interface RepoMapPayload {
  repoMap: {
    counts: {
      totalInstances: number;
      notes: number;
      typedRecords: number;
      records: number;
      byTier: Record<string, number>;
    };
    repository: {
      repositoryId?: string | null;
      title?: string | null;
      description?: string | null;
      conformance?: string | null;
    };
    // additional fields (schemas, sourceDocuments, etc.) present but not consumed here
    [key: string]: unknown;
  };
}

// repo validate
export interface RepoValidateDiagnostic {
  severity: "error" | "warning";  // lowercase — Rust: #[serde(rename_all = "lowercase")]
  path: string;                    // renamed — Rust: #[serde(rename = "path")]
  schemaId?: string;
  message: string;
}

export interface RepoValidatePayload {
  summary: { checked: number; errors: number; warnings: number };
  diagnostics: RepoValidateDiagnostic[];
}

// note list  → payload.notes
export interface NoteListPayload {
  notes: Array<{ instanceId: string; title: string }>;
}

// tag list  → payload.terms
// RFC-006 vocabulary Terms (Rust srs-core Term): id/version/namespace/key are
// always emitted; label/description/roles are optional. Replaces the retired
// tagDefinitions shape.
export interface TagListPayload {
  terms: Array<{
    id: string;
    version: number;
    namespace: string;
    key: string;
    label?: string;
    description?: string;
    roles?: string[];
  }>;
}

// record list  → payload.records
// Each entry is a RecordSummary: the resolved `displayLabel` plus the full nested
// `record`. Type fields (typeName/typeNamespace/typeVersion) live under `.record`,
// NOT at the top level — reading them flat yields "undefined/undefined".
export interface RecordListPayload {
  records: Array<{
    instanceId: string;
    /** Resolved human label — the same resolution `srs tree` uses. */
    displayLabel: string;
    record: {
      typeName: string;
      typeNamespace: string;
      typeVersion: number;
    };
  }>;
}

// relation list  → payload.relations
export interface RelationListPayload {
  relations: Array<{
    relationId: string;
    relationType: string;
    sourceId: string;
    targetId: string;
  }>;
}

// container list  → payload.containers
export interface ContainerListPayload {
  containers: Array<{
    containerId: string;
    title: string;
    containerType?: string;
  }>;
}

// field list  → payload.fields
export interface FieldListPayload {
  fields: Array<{ id: string; name: string; namespace: string; version: number }>;
}

// type list  → payload.types
export interface TypeListPayload {
  types: Array<{
    id: string;
    name: string;
    namespace: string;
    version: number;
    fieldCount?: number;
  }>;
}

// repo extensions list  → payload.extensions (plain declared-extension strings, e.g.
// "ext:lifecycle" — there is no "extension get"; the extension moved from the retired
// `extension list` command to `repo extensions list`, RFC-N/A, srs-rust f7c9bfec era)
export interface ExtensionListPayload {
  extensions: string[];
}

// protocol list  → payload.protocols
export interface ProtocolListPayload {
  protocols: Array<{
    instanceId: string;
    protocolId: string;
    namespace: string;
    name: string;
    version: number;
    stageCount: number;
  }>;
}

// protocol stages  → payload.stages
export interface ProtocolStagesPayload {
  stages: Array<{
    stageId: string;
    name: string;
    order: number;
    dependsOn: string[];
  }>;
}

// view list  → payload.views
export interface ViewListPayload {
  views: Array<{ id: string; name: string; namespace: string }>;
}

// composition list / list-for-container  → payload.compositions
// Mirrors the Rust CompositionSummary (srs-repository view_service.rs): both
// `version` and `description` are always emitted; `containerType` is optional.
// (Renamed from DocumentView → Composition, srs-rust PR #921 / f7c9bfec.)
export interface CompositionListPayload {
  compositions: Array<{
    id: string;
    name: string;
    namespace: string;
    version: number;
    description?: string;
    containerType?: string;
  }>;
}

// repo presentation list  → payload.presentations
// manifest.renderedPresentations (RFC-015): which composition a conformant viewer
// should open. `isDefault` is nullable — no entry marked true means "the first one".
export interface RepoPresentationListPayload {
  presentations: Array<{
    compositionId: string;
    format?: string;
    outputPath?: string;
    isDefault?: boolean | null;
  }>;
}

// render composition  → payload
// `rendered` and `projection` are mutually exclusive by construction
// (srs-rust render_service.rs): --view-format json yields the projection and an
// empty `rendered`; every other format yields `rendered` and no projection.
export interface RenderCompositionPayload {
  rendered: string;
  diagnostics: string[];
  projection?: CompositionProjection;
}

export interface CompositionProjection {
  compositionId: string;
  containerTitle?: string;
  preamble?: string;
  sections: ProjectionSection[];
}

export interface ProjectionSection {
  sectionId: string;
  title?: string;
  order: number;
  records: ProjectionRecord[];
  /** Nested sections; omitted when empty (srs-rust#1261). */
  sections?: ProjectionSection[];
}

export interface ProjectionRecord {
  instanceId: string;
  typeId?: string;
  typeVersion?: number;
  typeNamespace?: string;
  typeName?: string;
  /** Core-resolved heading — never re-derive one client-side (ADR-001). */
  recordHeading?: string;
  fields?: FieldValues;
  orderedFieldKeys?: string[];
  relations?: ProjectionRelation[];
  properties?: ProjectionProperty[];
  /** Effective arrangement depth, present only when above 0 (RFC-043; srs-rust#1261). */
  depth?: number;
  /** Nested records; omitted when empty (srs-rust#1261). */
  children?: ProjectionRecord[];
}

export interface ProjectionRelation {
  relationType: string;
  direction: string;
  label: string;
  targets: Array<{ instanceId: string; displayLabel: string }>;
}

export interface ProjectionProperty {
  property: string;
  label: string;
  value: unknown;
}

// relation-type list  → payload.relationTypeDefinitions
export interface RelationTypeListPayload {
  relationTypeDefinitions: Array<{
    id: string;
    relationType: string;
    label: string;
    namespace: string;
  }>;
}

// blueprint list  → payload.blueprints
export interface BlueprintListPayload {
  blueprints: Array<{
    blueprintId: string;
    namespace: string;
    name: string;
    version: number;
    description: string;
    rootTypeCount: number;
    sourcePackage?: string;
  }>;
  diagnostics: string[];
}

// theme list  → payload.themes
export interface ThemeListPayload {
  themes: Array<{ id: string; name: string; namespace: string; version: number }>;
}

// blueprint structure  → payload.relationSpecs
export interface BlueprintStructurePayload {
  relationSpecs: Array<{
    relationType: string;
    sourceTypeId: string;
    targetTypeId: string;
    cardinality?: string;
    required?: boolean;
  }>;
}

// container resolve-view  → payload.containerView  (RFC-020, ADR-023)
export interface ContainerResolveViewPayload {
  containerView: {
    containerId: string;
    compositionId?: string;
    root?: ContainerResolvedMember;
    members: ContainerResolvedMember[];
    columns: ContainerColumnSpec[];
    excludeLifecycleStates: string[];
    diagnostics: string[];
  };
}

export interface ContainerColumnSpec {
  fieldId: string;
  fieldName: string;
  displayLabel: string;
  order: number;
  required: boolean;
  /** True when this column is the Type's effective identityFieldId (RFC-020, ADR-023). */
  isIdentityColumn: boolean;
}

export interface ContainerResolvedMember {
  instanceId: string;
  /** 0 = Note, 1 = TypedRecord, 2 = Record */
  tier: number;
  displayLabel: string;
  isVisibleByDefault: boolean;
  record?: {
    typeId: string;
    typeVersion: number;
    typeName: string;
    typeNamespace: string;
    instanceId: string;
    fieldValues: FieldValues;
  };
}

// archive pack  → payload
export interface ArchivePackPayload {
  outputPath: string;
  fileSizeBytes: number;
}

// archive unpack  → payload
export interface ArchiveUnpackPayload {
  targetDir: string;
  repositoryId: string;
}

// attachment list  → payload
export interface AttachmentListPayload {
  sourceDocumentsPath: string;
  entries: Array<{
    path: string;
    documentId?: string;
    title?: string;
    contentChecksum?: string;
    sidecarChecksum?: string;
    sizeBytes?: number;
  }>;
}

// attachment add  → payload
export interface AttachmentAddPayload {
  documentId: string;
  contentPath: string;
  sidecarPath: string;
  sourceDocumentsPath: string;
  contentChecksum: string;
  sidecarChecksum: string;
}

// Entity kinds understood by the tree
export type EntityKind =
  | "note"
  | "tag"
  | "record"
  | "relation"
  | "container"
  | "field"
  | "type"
  | "extension"
  | "protocol"
  | "blueprint"
  | "view"
  | "composition"
  | "theme"
  | "relation-type";

// ── discovery (`find`, `find --similar`) — srs-rust#1219/#1237/#1239/#1243 ──────────────
// The golden `find` schema (srs-rust#1258) now types `result` in full; the payload-contract
// test validates fixtures and live binary output against it.
export interface FacetValue { value: string; count: number }
export interface FacetCounts { values: FacetValue[]; other?: number }
export interface FieldFacet extends FacetCounts { field: string }
// Every facet key is omitted when empty/zero; `limit: 0` gives hits: [] with full facets.
export interface DiscoveryFacets {
  byType?: FacetCounts;
  notes?: number;
  tags?: FacetCounts;
  fields?: FieldFacet[];
}
export interface DiscoveryHit {
  instanceId: string;
  uri: string;                 // srs://<repo>/record/<id>
  label: string;
  typeId?: string;             // absent for Tier 0 notes
  containerIds: string[];
  typeNamespace?: string;
  typeName?: string;
  lifecycleState?: string;
  score?: number;              // only with --rank (BM25)
  snippet?: string;
  matchedFields: string[];
}
export interface DiscoveryResult {
  hits: DiscoveryHit[];
  total: number;
  facets: DiscoveryFacets;
  diagnostics: string[];
}
// `find` and `find --similar` share this payload.
export interface FindPayload { result: DiscoveryResult }

// agent-index (`repo agent-index`) entry point — srs-rust#1237
export interface AgentEntryPoint { path: string; instanceId?: string; uri?: string }

// `relation neighbours` — srs-rust#1234
export interface NeighbourEdge {
  direction: "out" | "in";
  relationId: string;
  relationType: string;
  neighbour: { instanceId: string; uri: string; label?: string; typeNamespace?: string; typeName?: string };
}
export interface NeighboursPayload {
  result: { instanceId: string; total: number; neighbours: NeighbourEdge[] };
}
