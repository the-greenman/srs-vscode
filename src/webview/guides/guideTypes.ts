// Types for the muDemocracy guide editor.
// Isolated to src/webview/guides/ — no dependencies on srs-vscode internals.
//
// RFC-039: fieldValues is a name-keyed object, so field identity here is the
// package's known field names (not the pre-RFC-039 fieldId UUIDs — a fixed
// vocabulary for this fixed package either way).

export const TYPE_PREFIX = {
  guide:       "8f138dd6",
  sectionText: "4408a98e",
  sectionList: "76cdc3fb",
  sectionTable:"d8d09d3b",
} as const;

export type SectionType = "text" | "list" | "table";

export interface GuideDoc {
  containerId: string;
  guideInstanceId: string;
  guideTypeId: string;
  guideTypeVersion: number;
  slug: string;
  title: string;
  subtitle: string;
  body: string;
  sections: SectionDoc[];
}

export interface GuideTableBlock {
  subheading?: string;
  label?: string;
  columns?: string[];
  widths?: string[];
  rows: string[][];
}

export interface SectionDoc {
  instanceId: string;
  typeId: string;
  typeVersion: number;
  type: SectionType;
  heading: string;
  slug: string;
  // section.text
  body?: string;
  callout?: string;
  // section.list
  listItems?: string;  // newline-separated textarea value
  outro?: string;       // closing prose
  // section.table
  tables?: GuideTableBlock[];
  items?: Array<{ term?: string; body: string }>;
}

// Raw CLI record shape (mirrors editCommands.ts RecordPayload locally). fieldValues is
// the RFC-039 name-keyed carrier — any field this editor doesn't model (e.g. the table
// section's `intro`/`note`/`theme`/`page`) still lives in here and must be preserved on
// save (record update is a full replace, not a patch).
export interface RawRecord {
  instanceId: string;
  typeId: string;
  typeName: string;
  typeNamespace: string;
  typeVersion: number;
  createdAt?: string;
  fieldValues: Record<string, unknown>;
}

export interface RawRecordPayload {
  record: RawRecord;
}

export interface ContainerGetPayload {
  container: {
    containerId: string;
    containerType?: string;
    title: string;
    memberInstanceIds: string[];
    rootInstanceIds: string[];
  };
}
