import { CliClient } from "../../cli/CliClient";
import { RelationListPayload } from "../../cli/types";
import {
  TYPE_PREFIX,
  GuideDoc,
  GuideTableBlock,
  RawRecord,
  RawRecordPayload,
  ContainerGetPayload,
  SectionDoc,
} from "./guideTypes";

function str(record: RawRecord, name: string): string {
  const v = record.fieldValues[name];
  return typeof v === "string" ? v : "";
}

// Coerce, never filter: a table row's cells are positional (aligned to the columns
// declaration) — dropping a non-string entry instead of coercing it would shift every
// later cell in the row left and misalign it under the wrong column header.
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : x === null || x === undefined ? "" : String(x)));
}

function sortByPrecedes(ids: string[], precedesMap: Map<string, string>): string[] {
  const hasIncoming = new Set(ids.filter((id) => [...precedesMap.values()].includes(id)));
  const result: string[] = [];
  let cur: string | undefined = ids.find((id) => !hasIncoming.has(id));
  while (cur && result.length <= ids.length) {
    result.push(cur);
    cur = precedesMap.get(cur);
  }
  for (const id of ids) {
    if (!result.includes(id)) result.push(id);
  }
  return result;
}

function sectionTypeFromPrefix(typeId: string) {
  const p = typeId.slice(0, 8);
  if (p === TYPE_PREFIX.sectionText) return "text" as const;
  if (p === TYPE_PREFIX.sectionList) return "list" as const;
  if (p === TYPE_PREFIX.sectionTable) return "table" as const;
  throw new Error(`Unknown section typeId prefix: ${p} (${typeId})`);
}

function toTableBlock(raw: unknown): GuideTableBlock {
  const r = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(r.rows)
    ? r.rows.map((row) => strArray((row && typeof row === "object") ? (row as Record<string, unknown>).cells : undefined))
    : [];
  const block: GuideTableBlock = { columns: strArray(r.columns), rows };
  if (typeof r.subheading === "string" && r.subheading) block.subheading = r.subheading;
  if (typeof r.label === "string" && r.label) block.label = r.label;
  if (typeof r.widths === "string" && r.widths) {
    try { block.widths = JSON.parse(r.widths); } catch { /* ignore malformed widths */ }
  }
  return block;
}

function toSectionDoc(record: RawRecord): SectionDoc {
  const type = sectionTypeFromPrefix(record.typeId);
  const section: SectionDoc = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeVersion: record.typeVersion,
    type,
    heading: str(record, "heading"),
    slug: str(record, "slug"),
  };

  if (type === "text") {
    section.body = str(record, "body");
    section.callout = str(record, "callout");
  } else if (type === "list") {
    section.body = str(record, "body");
    section.listItems = str(record, "list-items");
    section.outro = str(record, "outro");
  } else if (type === "table") {
    section.body = str(record, "body");
    const tables = record.fieldValues.tables;
    section.tables = Array.isArray(tables) ? tables.map(toTableBlock) : [];
    const items = record.fieldValues.items;
    section.items = Array.isArray(items)
      ? items.map((it) => {
          const r = (it && typeof it === "object") ? it as Record<string, unknown> : {};
          const term = r["item-term"];
          const body = r["item-body"];
          return {
            term: typeof term === "string" && term ? term : undefined,
            body: typeof body === "string" ? body : "",
          };
        })
      : [];
    section.outro = str(record, "outro");
  }

  return section;
}

export async function loadGuide(
  cli: CliClient,
  repoPath: string,
  containerId: string,
): Promise<GuideDoc> {
  const containerPayload = await cli.runOk<ContainerGetPayload>(repoPath, [
    "container",
    "get",
    containerId,
  ]);
  const { memberInstanceIds, rootInstanceIds } = containerPayload.container;
  const guideId = rootInstanceIds[0];

  // Load all member records in parallel
  const records = await Promise.all(
    memberInstanceIds.map((id) =>
      cli.runOk<RawRecordPayload>(repoPath, ["record", "get", id]).then((p) => p.record),
    ),
  );

  // Build precedes map from relation list
  const relPayload = await cli.runOk<RelationListPayload>(repoPath, ["relation", "list"]);
  const precedesMap = new Map<string, string>();
  for (const rel of relPayload.relations) {
    if (rel.relationType === "precedes") {
      precedesMap.set(rel.sourceId, rel.targetId);
    }
  }

  const guideRecord = records.find((r) => r.instanceId === guideId);
  if (!guideRecord) {
    throw new Error(`Guide record ${guideId} not found in container members`);
  }

  const sectionIds = memberInstanceIds.filter((id) => id !== guideId);
  const sortedSectionIds = sortByPrecedes(sectionIds, precedesMap);

  const recordById = new Map(records.map((r) => [r.instanceId, r]));

  const sections: SectionDoc[] = sortedSectionIds.map((id) => {
    const r = recordById.get(id);
    if (!r) throw new Error(`Section record ${id} missing`);
    return toSectionDoc(r);
  });

  return {
    containerId,
    guideInstanceId: guideId,
    guideTypeId: guideRecord.typeId,
    guideTypeVersion: guideRecord.typeVersion,
    slug: str(guideRecord, "slug"),
    title: str(guideRecord, "title"),
    subtitle: str(guideRecord, "subtitle"),
    body: str(guideRecord, "body"),
    sections,
  };
}
