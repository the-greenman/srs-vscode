// Shared instanceId → {label, kind} resolver, built from `note list` + `record list`.
// Hoisted out of three verbatim copies (NavigatorTreeDataProvider, previewCommands,
// GraphPanel) — see srs-vscode#119 workstream 5.
import { CliClient } from "./CliClient";
import type { EntityKind, NoteListPayload, RecordListPayload } from "./types";

export interface LabelInfo {
  label: string;
  kind: EntityKind;
}

/**
 * Best-effort label resolution: a failing list call (stale CLI, unreadable repo)
 * yields partial (or empty) coverage rather than throwing — callers fall back to
 * `id.slice(0, 8)` for anything not in the returned map.
 */
export async function buildLabelMap(
  cli: CliClient,
  repoPath: string,
): Promise<Map<string, LabelInfo>> {
  const map = new Map<string, LabelInfo>();
  const [noteResult, recordResult] = await Promise.allSettled([
    cli.runOk<NoteListPayload>(repoPath, ["note", "list"]),
    cli.runOk<RecordListPayload>(repoPath, ["record", "list"]),
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
