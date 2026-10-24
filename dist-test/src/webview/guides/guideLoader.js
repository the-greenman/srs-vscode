"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadGuide = loadGuide;
const guideTypes_1 = require("./guideTypes");
function str(record, name) {
    const v = record.fieldValues[name];
    return typeof v === "string" ? v : "";
}
// Coerce, never filter: a table row's cells are positional (aligned to the columns
// declaration) — dropping a non-string entry instead of coercing it would shift every
// later cell in the row left and misalign it under the wrong column header.
function strArray(v) {
    if (!Array.isArray(v))
        return [];
    return v.map((x) => (typeof x === "string" ? x : x === null || x === undefined ? "" : String(x)));
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
function toTableBlock(raw) {
    const r = (raw && typeof raw === "object") ? raw : {};
    const rows = Array.isArray(r.rows)
        ? r.rows.map((row) => strArray((row && typeof row === "object") ? row.cells : undefined))
        : [];
    const block = { columns: strArray(r.columns), rows };
    if (typeof r.subheading === "string" && r.subheading)
        block.subheading = r.subheading;
    if (typeof r.label === "string" && r.label)
        block.label = r.label;
    if (typeof r.widths === "string" && r.widths) {
        try {
            block.widths = JSON.parse(r.widths);
        }
        catch { /* ignore malformed widths */ }
    }
    return block;
}
function toSectionDoc(record) {
    const type = sectionTypeFromPrefix(record.typeId);
    const section = {
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
    }
    else if (type === "list") {
        section.body = str(record, "body");
        section.listItems = str(record, "list-items");
        section.outro = str(record, "outro");
    }
    else if (type === "table") {
        section.body = str(record, "body");
        const tables = record.fieldValues.tables;
        section.tables = Array.isArray(tables) ? tables.map(toTableBlock) : [];
        const items = record.fieldValues.items;
        section.items = Array.isArray(items)
            ? items.map((it) => {
                const r = (it && typeof it === "object") ? it : {};
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
async function loadGuide(cli, repoPath, containerId) {
    const containerPayload = await cli.runOk(repoPath, [
        "container",
        "get",
        containerId,
    ]);
    const { memberInstanceIds, anchorInstanceId: guideId } = containerPayload.container;
    // anchorInstanceId is the explicit typing anchor (RFC-013 amended, I-145).
    // At dataModelRevision 8 the rootInstanceIds[0] positional fallback is
    // withdrawn (RFC-043 [R4]) — never guess the guide record by position.
    if (!guideId) {
        throw new Error(`Container ${containerId} has no anchorInstanceId, so the guide record cannot be determined. ` +
            `Set the container's typing anchor to its guide record (the container may predate dataModelRevision 8 — run the SRS migration).`);
    }
    // Load all member records in parallel
    const records = await Promise.all(memberInstanceIds.map((id) => cli.runOk(repoPath, ["record", "get", id]).then((p) => p.record)));
    const guideRecord = records.find((r) => r.instanceId === guideId);
    if (!guideRecord) {
        throw new Error(`Guide record ${guideId} not found in container members`);
    }
    // Section order is the container's entry order (RFC-043, R6): `precedes` is
    // semantic, never presentation, so it is not read here.
    const sortedSectionIds = memberInstanceIds.filter((id) => id !== guideId);
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
        slug: str(guideRecord, "slug"),
        title: str(guideRecord, "title"),
        subtitle: str(guideRecord, "subtitle"),
        body: str(guideRecord, "body"),
        sections,
    };
}
//# sourceMappingURL=guideLoader.js.map