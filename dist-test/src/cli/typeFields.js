"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTypeFields = resolveTypeFields;
function parseFields(properties, required) {
    if (!properties)
        return [];
    const requiredSet = new Set(required ?? []);
    const fields = Object.entries(properties).map(([name, node]) => parseField(name, node, requiredSet.has(name)));
    return fields.sort((a, b) => a.order - b.order);
}
// The CLI's `title` falls back to Field.description when no displayLabel was set
// (srs-rust type_schema_service.rs: display_label ?? description), never to
// Field.name — so a field with a long description and no explicit displayLabel would
// otherwise show that whole sentence, uppercased, as its form/preview/table-header
// label. A real displayLabel is short; treat anything else as "probably a
// description" and fall back to the field name instead.
function looksLikeShortLabel(t) {
    return t.length <= 50 && t.trim().split(/\s+/).length <= 6;
}
function parseField(name, node, required) {
    const base = {
        name,
        displayLabel: node.title && looksLikeShortLabel(node.title) ? node.title : name,
        description: node.description,
        order: node["x-srs-order"] ?? 0,
        required,
        widget: node["x-srs-widget"],
        // `contentMediaType` alone under-detects: a Field migrated from the pre-RFC-032
        // valueType:"text" model lands on StringFormat::Plain, which gets the textarea
        // widget but no contentMediaType at all — confirmed against a real corpus (every
        // muDemocracy prose field: body/intro/note/outro/callout/item-body) carries
        // `x-srs-widget: "textarea"` with no `contentMediaType`. Treat any textarea-widget
        // scalar as markdown-renderable; the one false-positive class (a textarea field
        // holding non-prose data, e.g. a JSON-encoded string) just renders inertly, since
        // its content isn't markdown syntax — far cheaper than the alternative of prose
        // rendering as one unformatted blob.
        isMarkdown: node.contentMediaType === "text/markdown" || node["x-srs-widget"] === "textarea",
    };
    if (node.enum) {
        return { ...base, kind: "enum", enumValues: node.enum };
    }
    if (node.type === "array") {
        const items = node.items ?? {};
        if (items.type === "object" && items.properties) {
            return {
                ...base,
                kind: "list-composite",
                minItems: node.minItems,
                maxItems: node.maxItems,
                children: parseFields(items.properties, items.required),
            };
        }
        // ponytail: an array-of-enum field (items.enum set) renders here as free-text
        // repeat entries rather than per-entry <select> dropdowns — loses the client-side
        // vocabulary constraint (the CLI still validates on write). Not observed in any
        // real Type this unit touched; add a "list-enum" kind if one appears.
        //
        // items.type "object" with no properties (cardinality:list over datatype:map —
        // a normal, spec-sanctioned combination, RFC-039 R16 — or an inline-composite
        // range that failed to expand) is the same "structured value, no per-field
        // inputs" hazard as the scalar case below: mark it so the collector round-trips
        // each entry through JSON instead of pushing the display string back verbatim.
        const itemsScalarType = items.type === undefined || items.type === "object" ? "json" : items.type;
        return { ...base, kind: "list-scalar", scalarType: itemsScalarType, minItems: node.minItems, maxItems: node.maxItems };
    }
    if (node.type === "object" && node.properties) {
        return { ...base, kind: "composite", children: parseFields(node.properties, node.required) };
    }
    // An object node with no `properties` (Field.fieldType.datatype "map" — a real,
    // non-error open string-keyed collection — or an inline-composite range that
    // failed to expand, e.g. a cycle) is NOT a plain scalar: its value is a JSON
    // object. Rendering it as a generic string-typed scalar would round-trip an
    // untouched save as a JSON-encoded STRING, silently corrupting the stored object.
    // Same hazard for a node with no `type` at all (Field.fieldType.datatype
    // "dependent" carries no shape of its own). Preserve the value through
    // JSON parse/stringify instead of passing it through as text.
    if (node.type === undefined || node.type === "object") {
        return { ...base, kind: "scalar", scalarType: "json" };
    }
    return { ...base, kind: "scalar", scalarType: node.type };
}
async function resolveTypeFields(cli, repoPath, typeId, 
// A Record binds to a specific typeId@typeVersion and is never auto-migrated when a
// new Type version is published (CLAUDE.md). `type schema` defaults to the latest
// version — passing the record's own stored typeVersion is required, or the form
// renders the WRONG field set: a field only in the record's version is invisible and
// silently dropped by the next full-replace `record update`; a field only in a newer
// version is asked for even though it doesn't apply to this record.
typeVersion) {
    const args = ["type", "schema", typeId];
    if (typeVersion !== undefined)
        args.push("--type-version", String(typeVersion));
    const payload = await cli.runOk(repoPath, args);
    return parseFields(payload.schema.properties, payload.schema.required);
}
//# sourceMappingURL=typeFields.js.map