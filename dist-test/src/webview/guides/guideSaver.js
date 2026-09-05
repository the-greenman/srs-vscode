"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveGuide = saveGuide;
function set(target, name, value) {
    if (value !== undefined && value !== "")
        target[name] = value;
    else
        delete target[name];
}
function tableBlockToFieldValues(t) {
    const out = {
        columns: t.columns ?? [],
        rows: (t.rows ?? []).map((cells) => ({ cells })),
    };
    if (t.subheading)
        out.subheading = t.subheading;
    if (t.label)
        out.label = t.label;
    if (t.widths)
        out.widths = JSON.stringify(t.widths);
    return out;
}
function applySectionFields(fieldValues, section) {
    set(fieldValues, "heading", section.heading);
    set(fieldValues, "slug", section.slug);
    if (section.type === "text") {
        set(fieldValues, "body", section.body);
        set(fieldValues, "callout", section.callout);
    }
    else if (section.type === "list") {
        set(fieldValues, "body", section.body);
        set(fieldValues, "list-items", section.listItems);
        set(fieldValues, "outro", section.outro);
    }
    else if (section.type === "table") {
        set(fieldValues, "body", section.body);
        set(fieldValues, "outro", section.outro);
        if (section.tables !== undefined)
            fieldValues.tables = section.tables.map(tableBlockToFieldValues);
        if (section.items !== undefined) {
            fieldValues.items = section.items.map((item) => {
                const entry = { "item-body": item.body };
                if (item.term)
                    entry["item-term"] = item.term;
                return entry;
            });
        }
    }
}
// `record update` is a full replace (RFC-039 R9: key absence = unset), and this editor
// models only a subset of each Type's fields (e.g. a table section's `intro`/`note`/
// `theme`/`page`). Fetch the current fieldValues and merge the edited fields on top so
// every field this editor doesn't know about survives the save untouched.
async function mergedFieldValues(cli, repoPath, instanceId, apply) {
    const current = await cli.runOk(repoPath, ["record", "get", instanceId]);
    const fieldValues = { ...current.record.fieldValues };
    apply(fieldValues);
    return fieldValues;
}
// Each record (the guide + every section) is independent — no shared state, no
// ordering requirement between them — so all saves run concurrently rather than
// paying N sequential fetch+update round-trips.
async function saveOne(cli, repoPath, instanceId, apply) {
    const fieldValues = await mergedFieldValues(cli, repoPath, instanceId, apply);
    await cli.runOk(repoPath, ["record", "update", instanceId], {
        stdin: JSON.stringify({ fieldValues }),
    });
}
async function saveGuide(cli, repoPath, guide) {
    const targets = [
        {
            label: `guide "${guide.title}"`,
            save: () => saveOne(cli, repoPath, guide.guideInstanceId, (fv) => {
                set(fv, "slug", guide.slug);
                set(fv, "title", guide.title);
                set(fv, "subtitle", guide.subtitle);
                set(fv, "body", guide.body);
            }),
        },
        ...guide.sections.map((section, i) => ({
            label: `section ${i + 1} (${section.heading || section.instanceId})`,
            save: () => saveOne(cli, repoPath, section.instanceId, (fv) => applySectionFields(fv, section)),
        })),
    ];
    // Promise.all would fail on the first rejection while every other save keeps
    // running to completion in the background regardless (each is an independent
    // record, no shared state to roll back) — the caller's single error toast would
    // then name only one failing record while silently leaving the rest already
    // persisted. Wait for all of them and report exactly what happened.
    const results = await Promise.allSettled(targets.map((t) => t.save()));
    const failures = results
        .map((r, i) => ({ result: r, label: targets[i].label }))
        .filter((x) => x.result.status === "rejected");
    if (failures.length > 0) {
        const succeeded = targets.length - failures.length;
        const detail = failures.map(({ result, label }) => `${label}: ${String(result.reason)}`).join("; ");
        throw new Error(`${succeeded}/${targets.length} saved; failed — ${detail}`);
    }
}
//# sourceMappingURL=guideSaver.js.map