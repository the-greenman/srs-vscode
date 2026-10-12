import type { ErrorReportPayload } from "./types";

// No vscode dependency — safe to import in unit tests.
export class CliError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[],
    public readonly command: string,
    // Structured reports aligned with `diagnostics` (ADR-053, srs-rust#1338).
    // Empty when the envelope predates that contract or none were parsed
    // (e.g. a spawn/stderr-fallback failure with no envelope at all).
    public readonly errors: ErrorReportPayload[] = [],
  ) {
    super(message);
    this.name = "CliError";
  }

  /** True when any structured error report carries the given stable `code`. */
  hasErrorCode(code: string): boolean {
    return this.errors.some((e) => e.code === code);
  }
}
