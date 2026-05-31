// JSON envelope shapes returned by every srs CLI command.
// ok:true responses carry a typed payload; ok:false carry a string[] diagnostics array.
export type SrsEnvelope<T> =
  | { ok: true; command: string; version: string; payload: T }
  | { ok: false; command: string; version: string; diagnostics: string[] };

// repo map
export interface RepoMapPayload {
  repoMap: {
    counts: {
      notes: number;
      records: number;
      totalInstances: number;
    };
    repository: {
      repositoryId: string;
      title: string;
      description?: string | null;
    };
  };
}

// repo validate
export interface RepoValidateDiagnostic {
  severity: "Error" | "Warning" | "Info";
  relative_path: string;
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

// tag list  → payload.tagDefinitions
export interface TagListPayload {
  tagDefinitions: Array<{ instanceId: string; slug: string; label?: string }>;
}

// record list  → payload.records
export interface RecordListPayload {
  records: Array<{
    instanceId: string;
    typeName: string;
    typeNamespace: string;
    typeVersion: number;
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
  protocols: Array<{ instanceId: string; title?: string }>;
}

// view list  → payload.views
export interface ViewListPayload {
  views: Array<{ id: string; name: string; namespace: string }>;
}

// document-view list  → payload.documentViews
export interface DocumentViewListPayload {
  documentViews: Array<{
    id: string;
    name: string;
    namespace: string;
    description?: string;
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
  | "view"
  | "document-view"
  | "relation-type";
