import { CliClient } from "../../cli/CliClient";
import { F, GuideDoc, SectionDoc } from "./guideTypes";

interface FieldValue {
  fieldId: string;
  value: string;
  entries?: Array<{ value: string }>;
}

function buildFieldValues(pairs: Array<[string, string | undefined]>): FieldValue[] {
  return pairs
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([fieldId, value]) => ({ fieldId, value: value as string }));
}

function guideUpdateInput(guide: GuideDoc) {
  return {
    instanceId: guide.guideInstanceId,
    typeId: guide.guideTypeId,
    typeVersion: guide.guideTypeVersion,
    fieldValues: buildFieldValues([
      [F.slug,     guide.slug],
      [F.title,    guide.title],
      [F.subtitle, guide.subtitle],
      [F.body,     guide.body],
    ]),
  };
}

function sectionUpdateInput(section: SectionDoc) {
  const pairs: Array<[string, string | undefined]> = [
    [F.heading, section.heading],
    [F.slug,    section.slug],
  ];

  if (section.type === "text") {
    pairs.push([F.body, section.body], [F.callout, section.callout]);
  } else if (section.type === "list") {
    pairs.push([F.body, section.body], [F.listItems, section.listItems], [F.outro, section.outro]);
  } else if (section.type === "table") {
    pairs.push([F.body, section.body], [F.outro, section.outro]);
  }

  const fieldValues = buildFieldValues(pairs);

  const groupValues: Array<{
    groupId: string;
    entries: Array<{ fieldValues: Array<{ fieldId: string; value: string }> }>;
  }> = [];

  if (section.type === "table") {
    if (section.items !== undefined) {
      groupValues.push({
        groupId: "items",
        entries: section.items.map((item) => ({
          fieldValues: [
            ...(item.term ? [{ fieldId: F.itemTerm, value: item.term }] : []),
            { fieldId: F.itemBody, value: item.body },
          ],
        })),
      });
    }
    if (section.tables !== undefined) {
      groupValues.push({
        groupId: "tables",
        entries: section.tables.map((t) => ({
          fieldValues: [
            { fieldId: F.columns, value: JSON.stringify(t.columns ?? []) },
            { fieldId: F.rows, value: JSON.stringify(t.rows) },
            ...(t.subheading ? [{ fieldId: F.subheading, value: t.subheading }] : []),
            ...(t.label ? [{ fieldId: F.tableLabel, value: t.label }] : []),
            ...(t.widths ? [{ fieldId: F.widths, value: JSON.stringify(t.widths) }] : []),
          ],
        })),
      });
    }
  }

  return {
    instanceId: section.instanceId,
    typeId: section.typeId,
    typeVersion: section.typeVersion,
    fieldValues,
    ...(groupValues.length > 0 ? { groupValues } : {}),
  };
}

export async function saveGuide(
  cli: CliClient,
  repoPath: string,
  guide: GuideDoc,
): Promise<void> {
  // Save guide record first, then each section in order
  const updates = [
    { id: guide.guideInstanceId, input: guideUpdateInput(guide) },
    ...guide.sections.map((s) => ({ id: s.instanceId, input: sectionUpdateInput(s) })),
  ];

  for (const { id, input } of updates) {
    await cli.runOk<unknown>(repoPath, ["record", "update", id], {
      stdin: JSON.stringify(input),
    });
  }
}
