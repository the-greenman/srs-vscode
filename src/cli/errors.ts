// No vscode dependency — safe to import in unit tests.
import type { ErrorReportPayload } from "./types";

export class CliError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[],
    public readonly command: string,
    public readonly errors?: ErrorReportPayload[],
  ) {
    super(message);
    this.name = "CliError";
  }
}

// True when the CLI reported the structured `cannot-delete-in-use` code (ADR-053,
// srs-rust#1338) — i.e. the entity still has a reference pointing at it and the engine
// refused the delete. `errors[]` is absent on an older CLI build; that's treated as "no",
// not a match, so callers fall back to the generic failure message instead of guessing.
export function isCannotDeleteInUse(err: CliError): boolean {
  return (err.errors ?? []).some((e) => e.code === "cannot-delete-in-use");
}
