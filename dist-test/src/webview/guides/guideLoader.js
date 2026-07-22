"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGuide = loadGuide;
const guideTypes_1 = require("./guideTypes");
function fv(record, fieldId) {
    const entry = record.fieldValues.find((e) => e.fieldId === fieldId);
    if (entry == null)
        return "";
    return typeof entry.value === "string" ? entry.value : "";
}
function sortByPrecedes(ids, precedesMap) {
    const hasIncoming = new Set(ids.filter((id) => [...precedesMap.values()].includes(id)));
    const result = [];
    let cur = ids.find((id) => !hasIncoming.has(id));
    while (cur && result.length <= ids.length) {
        result.push(cur);
        cur = precedesMap.get(cur);
    }
    for (const id of ids) {
        if (!result.includes(id))
            result.push(id);
    }
    return result;
}
function sectionTypeFromPrefix(typeId) {
    const p = typeId.slice(0, 8);
    if (p === guideTypes_1.TYPE_PREFIX.sectionText)
        return "text";
    if (p === guideTypes_1.TYPE_PREFIX.sectionList)
        return "list";
    if (p === guideTypes_1.TYPE_PREFIX.sectionTable)
        return "table";
    throw new Error(`Unknown section typeId prefix: ${p} (${typeId})`);
}
function toSectionDoc(record) {
    const type = sectionTypeFromPrefix(record.typeId);
    const section = {
        instanceId: record.instanceId,
        typeId: record.typeId,
        typeVersion: record.typeVersion,
        type,
        heading: fv(record, guideTypes_1.F.heading),
        slug: fv(record, guideTypes_1.F.slug),
    };
    if (type === "text") {
        section.body = fv(record, guideTypes_1.F.body);
        section.callout = fv(record, guideTypes_1.F.callout);
    }
    else if (type === "list") {
        section.body = fv(record, guideTypes_1.F.body);
        section.listItems = fv(record, guideTypes_1.F.listItems);
        section.outro = fv(record, guideTypes_1.F.outro);
    }
    else if (type === "table") {
        section.body = fv(record, guideTypes_1.F.body);
        const tablesGroup = record.groupValues?.find((gv) => gv.groupId === "tables");
        section.tables = (tablesGroup?.entries ?? []).map((entry) => {
            const fval = (id) => entry.fieldValues.find((e) => e.fieldId === id)?.value;
            let columns = [];
            let rows = [];
            let widths;
            try {
                columns = JSON.parse(String(fval(guideTypes_1.F.columns) ?? "[]"));
            }
            catch {
                columns = [];
            }
            try {
                rows = JSON.parse(String(fval(guideTypes_1.F.rows) ?? "[]"));
            }
            catch {
                rows = [];
            }
            const widthsRaw = fval(guideTypes_1.F.widths);
            if (widthsRaw) {
                try {
                    widths = JSON.parse(String(widthsRaw));
                }
                catch { /* ignore */ }
            }
            const block = { columns, rows };
            const sub = fval(guideTypes_1.F.subheading);
            const lbl = fval(guideTypes_1.F.tableLabel);
            if (typeof sub === "string" && sub)
                block.subheading = sub;
            if (typeof lbl === "string" && lbl)
                block.label = lbl;
            if (widths)
                block.widths = widths;
            return block;
        });
        const itemsGroup = record.groupValues?.find((gv) => gv.groupId === "items");
        section.items = (itemsGroup?.entries ?? []).map((entry) => {
            const term = entry.fieldValues.find((e) => e.fieldId === guideTypes_1.F.itemTerm)?.value;
            const body = entry.fieldValues.find((e) => e.fieldId === guideTypes_1.F.itemBody)?.value;
            return {
                term: typeof term === "string" && term ? term : undefined,
                body: typeof body === "string" ? body : "",
            };
        });
        section.outro = fv(record, guideTypes_1.F.outro);
    }
    return section;
}
async function loadGuide(cli, repoPath, containerId) {
    const containerPayload = await cli.runOk(repoPath, [
        "container",
        "get",
        containerId,
    ]);
    const { memberInstanceIds, rootInstanceIds } = containerPayload.container;
    const guideId = rootInstanceIds[0];
    // Load all member records in parallel
    const records = await Promise.all(memberInstanceIds.map((id) => cli.runOk(repoPath, ["record", "get", id]).then((p) => p.record)));
    // Build precedes map from relation list
    const relPayload = await cli.runOk(repoPath, ["relation", "list"]);
    const precedesMap = new Map();
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
    const sections = sortedSectionIds.map((id) => {
        const r = recordById.get(id);
        if (!r)
            throw new Error(`Section record ${id} missing`);
        return toSectionDoc(r);
    });
    return {
        containerId,
        guideInstanceId: guideId,
        guideTypeId: guideRecord.typeId,
        guideTypeVersion: guideRecord.typeVersion,
        slug: fv(guideRecord, guideTypes_1.F.slug),
        title: fv(guideRecord, guideTypes_1.F.title),
        subtitle: fv(guideRecord, guideTypes_1.F.subtitle),
        body: fv(guideRecord, guideTypes_1.F.body),
        sections,
    };
}
//# sourceMappingURL=guideLoader.js.map