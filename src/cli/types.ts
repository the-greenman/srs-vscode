// JSON envelope shapes returned by every srs CLI command.
// ok:true responses carry a typed payload; ok:false carry a string[] diagnostics array.
export type SrsEnvelope<T> =
  | { ok: true; command: string; version: string; payload: T }
  | { ok: false; command: string; version: string; diagnostics: string[] };

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

// extension list  → payload.extensions
export interface ExtensionListPayload {
  extensions: Array<{ instanceId: string; extensionId?: string }>;
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

// document-view list / list-for-container  → payload.documentViews
// Mirrors the Rust DocumentViewSummary (srs-repository view_service.rs): both
// `version` and `description` are always emitted; `containerType` is optional.
export interface DocumentViewListPayload {
  documentViews: Array<{
    id: string;
    name: string;
    namespace: string;
    version: number;
    description?: string;
    containerType?: string;
  }>;
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
    documentViewId?: string;
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
    fieldValues: Array<{ fieldId: string; value: unknown; entries?: Array<{ value: unknown }> }>;
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
  | "document-view"
  | "theme"
  | "relation-type";
