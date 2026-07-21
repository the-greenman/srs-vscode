"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGuide = saveGuide;
const guideTypes_1 = require("./guideTypes");
function buildFieldValues(pairs) {
    return pairs
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([fieldId, value]) => ({ fieldId, value: value }));
}
function guideUpdateInput(guide) {
    return {
        instanceId: guide.guideInstanceId,
        typeId: guide.guideTypeId,
        typeVersion: guide.guideTypeVersion,
        fieldValues: buildFieldValues([
            [guideTypes_1.F.slug, guide.slug],
            [guideTypes_1.F.title, guide.title],
            [guideTypes_1.F.subtitle, guide.subtitle],
            [guideTypes_1.F.body, guide.body],
        ]),
    };
}
function sectionUpdateInput(section) {
    const pairs = [
        [guideTypes_1.F.heading, section.heading],
        [guideTypes_1.F.slug, section.slug],
    ];
    if (section.type === "text") {
        pairs.push([guideTypes_1.F.body, section.body], [guideTypes_1.F.callout, section.callout]);
    }
    else if (section.type === "list") {
        pairs.push([guideTypes_1.F.body, section.body], [guideTypes_1.F.listItems, section.listItems], [guideTypes_1.F.outro, section.outro]);
    }
    else if (section.type === "table") {
        pairs.push([guideTypes_1.F.body, section.body], [guideTypes_1.F.outro, section.outro]);
    }
    const fieldValues = buildFieldValues(pairs);
    const groupValues = [];
    if (section.type === "table") {
        if (section.items !== undefined) {
            groupValues.push({
                groupId: "items",
                entries: section.items.map((item) => ({
                    fieldValues: [
                        ...(item.term ? [{ fieldId: guideTypes_1.F.itemTerm, value: item.term }] : []),
                        { fieldId: guideTypes_1.F.itemBody, value: item.body },
                    ],
                })),
            });
        }
        if (section.tables !== undefined) {
            groupValues.push({
                groupId: "tables",
                entries: section.tables.map((t) => ({
                    fieldValues: [
                        { fieldId: guideTypes_1.F.columns, value: JSON.stringify(t.columns ?? []) },
                        { fieldId: guideTypes_1.F.rows, value: JSON.stringify(t.rows) },
                        ...(t.subheading ? [{ fieldId: guideTypes_1.F.subheading, value: t.subheading }] : []),
                        ...(t.label ? [{ fieldId: guideTypes_1.F.tableLabel, value: t.label }] : []),
                        ...(t.widths ? [{ fieldId: guideTypes_1.F.widths, value: JSON.stringify(t.widths) }] : []),
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
async function saveGuide(cli, repoPath, guide) {
    // Save guide record first, then each section in order
    const updates = [
        { id: guide.guideInstanceId, input: guideUpdateInput(guide) },
        ...guide.sections.map((s) => ({ id: s.instanceId, input: sectionUpdateInput(s) })),
    ];
    for (const { id, input } of updates) {
        await cli.runOk(repoPath, ["record", "update", id], {
            stdin: JSON.stringify(input),
        });
    }
}
//# sourceMappingURL=guideSaver.js.map