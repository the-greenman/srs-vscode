import { CliClient } from "../../cli/CliClient";
import { RelationListPayload } from "../../cli/types";
import {
  F,
  TYPE_PREFIX,
  GuideDoc,
  GuideTableBlock,
  RawRecord,
  RawRecordPayload,
  ContainerGetPayload,
  SectionDoc,
} from "./guideTypes";

function fv(record: RawRecord, fieldId: string): string {
  const entry = record.fieldValues.find((e) => e.fieldId === fieldId);
  if (entry == null) return "";
  return typeof entry.value === "string" ? entry.value : "";
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

function toSectionDoc(record: RawRecord): SectionDoc {
  const type = sectionTypeFromPrefix(record.typeId);
  const section: SectionDoc = {
    instanceId: record.instanceId,
    typeId: record.typeId,
    typeVersion: record.typeVersion,
    type,
    heading: fv(record, F.heading),
    slug: fv(record, F.slug),
  };

  if (type === "text") {
    section.body = fv(record, F.body);
    section.callout = fv(record, F.callout);
  } else if (type === "list") {
    section.body = fv(record, F.body);
    section.listItems = fv(record, F.listItems);
    section.outro = fv(record, F.outro);
  } else if (type === "table") {
    section.body = fv(record, F.body);
    const tablesGroup = record.groupValues?.find((gv) => gv.groupId === "tables");
    section.tables = (tablesGroup?.entries ?? []).map((entry) => {
      const fval = (id: string) =>
        entry.fieldValues.find((e) => e.fieldId === id)?.value;
      let columns: string[] = [];
      let rows: string[][] = [];
      let widths: string[] | undefined;
      try { columns = JSON.parse(String(fval(F.columns) ?? "[]")); } catch { columns = []; }
      try { rows = JSON.parse(String(fval(F.rows) ?? "[]")); } catch { rows = []; }
      const widthsRaw = fval(F.widths);
      if (widthsRaw) { try { widths = JSON.parse(String(widthsRaw)); } catch { /* ignore */ } }
      const block: GuideTableBlock = { columns, rows };
      const sub = fval(F.subheading);
      const lbl = fval(F.tableLabel);
      if (typeof sub === "string" && sub) block.subheading = sub;
      if (typeof lbl === "string" && lbl) block.label = lbl;
      if (widths) block.widths = widths;
      return block;
    });
    const itemsGroup = record.groupValues?.find((gv) => gv.groupId === "items");
    section.items = (itemsGroup?.entries ?? []).map((entry) => {
      const term = entry.fieldValues.find((e) => e.fieldId === F.itemTerm)?.value;
      const body = entry.fieldValues.find((e) => e.fieldId === F.itemBody)?.value;
      return {
        term: typeof term === "string" && term ? term : undefined,
        body: typeof body === "string" ? body : "",
      };
    });
    section.outro = fv(record, F.outro);
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
    slug: fv(guideRecord, F.slug),
    title: fv(guideRecord, F.title),
    subtitle: fv(guideRecord, F.subtitle),
    body: fv(guideRecord, F.body),
    sections,
  };
}
