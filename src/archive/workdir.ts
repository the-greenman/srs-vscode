import * as crypto from "crypto";
import * as path from "path";

// Deterministic, filesystem-safe directory name for the working copy of a `.srs`
// archive. Keyed by the archive's absolute path so the same archive always maps
// to the same working copy (stable across sessions), while two archives that
// share a basename never collide. No vscode dependency — importable in unit tests.
//
// Shape: "<sanitised-basename>-<sha1(absPath)[0..12]>", e.g. "governance-1a2b3c4d5e6f".
export function archiveWorkdirName(archivePath: string): string {
  const abs = path.resolve(archivePath);
  const base = path.basename(abs, path.extname(abs));
  const safe = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40) || "archive";
  const hash = crypto.createHash("sha1").update(abs).digest("hex").slice(0, 12);
  return `${safe}-${hash}`;
}
