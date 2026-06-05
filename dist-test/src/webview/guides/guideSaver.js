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
            [guideTypes_1.F.intro, guide.intro],
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
        pairs.push([guideTypes_1.F.listItems, section.listItems], [guideTypes_1.F.confirmation, section.confirmation]);
    }
    else if (section.type === "commentary") {
        const raw = section.commentaryItems ? JSON.stringify(section.commentaryItems) : undefined;
        pairs.push([guideTypes_1.F.commentaryItems, raw]);
    }
    else if (section.type === "table") {
        pairs.push([guideTypes_1.F.intro, section.intro], [guideTypes_1.F.tip, section.tip], [guideTypes_1.F.note, section.note]);
    }
    return {
        instanceId: section.instanceId,
        typeId: section.typeId,
        typeVersion: section.typeVersion,
        fieldValues: buildFieldValues(pairs),
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