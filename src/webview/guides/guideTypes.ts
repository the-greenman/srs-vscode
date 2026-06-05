// Types and field ID constants for the muDemocracy guide editor.
// Isolated to src/webview/guides/ — no dependencies on srs-vscode internals.

export const F = {
  slug:      "2e3be0f8-0497-4754-a8b2-62ce6b05493f",
  title:     "e5b359b0-8f8b-4807-bae9-b841adbd6248",
  subtitle:  "9bb3d21d-3a02-4b87-863d-99fdfcdb8a3e",
  body:      "cd97f7d2-29e4-435e-a991-9be8281d6a78",  // universal prose: guide intro + section body
  blocks:    "dabb80dc-a04e-48e9-afd8-37a6410bd43b",
  heading:   "9629c9b5-3b17-4766-b3d3-b2890902821a",
  callout:   "138e40f4-888b-49ed-9c26-bedc9567e806",
  listItems: "e5e6ebce-8dfe-446f-a7fd-e329d4f5d67e",
  outro:     "04ce57ec-46bc-4e1e-9238-34bf7247905a",  // closing prose: was confirmation (list) + note (table)
  itemTerm:  "a02b147b-4319-4cdd-b263-781640c93fcb",  // was tipTitle — term/title for items group entries
  itemBody:  "6fafae71-f6f1-4e83-b091-19765517ff80",  // was tip — body for items group entries
  // table block fields — used in groupValues["tables"] entries
  columns:   "15d81030-07db-40a7-9885-d23b1d6b39f7",
  rows:      "876daf6a-aefa-421c-80b5-2e3c3a4c6397",
  subheading:"4523e0e0-f7b6-4c72-9f30-b526ca74799e",
  tableLabel:"920fd0a2-5fb2-40c4-9362-7c6c86ab8ccd",
  widths:    "8d98614d-f420-4597-90fd-c141e8584b06",
} as const;

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
  outro?: string;      // closing prose — was confirmation (list) + note (table)
  // section.table
  tables?: GuideTableBlock[];
  items?: Array<{ term?: string; body: string }>;  // groupValues["items"] — was tips + commentary
}

// Raw CLI record shape (mirrors editCommands.ts RecordPayload locally)
export interface RawRecord {
  instanceId: string;
  typeId: string;
  typeName: string;
  typeNamespace: string;
  typeVersion: number;
  createdAt?: string;
  fieldValues: Array<{ fieldId: string; value: unknown; entries?: Array<{ value: unknown }> }>;
  groupValues?: Array<{
    groupId: string;
    entries: Array<{
      fieldValues: Array<{ fieldId: string; value: unknown }>;
      entryId?: string;
    }>;
  }>;
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
