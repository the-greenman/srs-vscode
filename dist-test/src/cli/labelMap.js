"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLabelMap = buildLabelMap;
/**
 * Best-effort label resolution: a failing list call (stale CLI, unreadable repo)
 * yields partial (or empty) coverage rather than throwing — callers fall back to
 * `id.slice(0, 8)` for anything not in the returned map.
 */
async function buildLabelMap(cli, repoPath) {
    const map = new Map();
    const [noteResult, recordResult] = await Promise.allSettled([
        cli.runOk(repoPath, ["note", "list"]),
        cli.runOk(repoPath, ["record", "list"]),
    ]);
    if (noteResult.status === "fulfilled") {
        for (const n of noteResult.value.notes) {
            map.set(n.instanceId, { label: n.title, kind: "note" });
        }
    }
    if (recordResult.status === "fulfilled") {
        for (const r of recordResult.value.records) {
            map.set(r.instanceId, { label: r.displayLabel, kind: "record" });
        }
    }
    return map;
}
//# sourceMappingURL=labelMap.js.map