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
    if (p === guideTypes_1.TYPE_PREFIX.sectionCommentary)
        return "commentary";
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
        section.listItems = fv(record, guideTypes_1.F.listItems);
        section.confirmation = fv(record, guideTypes_1.F.confirmation);
    }
    else if (type === "commentary") {
        const raw = fv(record, guideTypes_1.F.commentaryItems);
        try {
            section.commentaryItems = raw ? JSON.parse(raw) : [];
        }
        catch {
            section.commentaryItems = [];
        }
    }
    else if (type === "table") {
        section.intro = fv(record, guideTypes_1.F.intro);
        section.tip = fv(record, guideTypes_1.F.tip);
        section.note = fv(record, guideTypes_1.F.note);
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
        intro: fv(guideRecord, guideTypes_1.F.intro),
        sections,
    };
}
//# sourceMappingURL=guideLoader.js.map