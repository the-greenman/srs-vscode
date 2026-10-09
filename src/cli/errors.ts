import type { ErrorReport } from "./types";

// No vscode dependency — safe to import in unit tests.
export class CliError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[],
    public readonly command: string,
    public readonly errors?: ErrorReport[],
  ) {
    super(message);
    this.name = "CliError";
  }
}

// Branch on the structured ADR-053 error code, never on message/diagnostics text
// (ADR-048 rule 6: identifier over label) — Display text is prose and carries no
// stability guarantee across srs-rust releases.
export function hasErrorCode(err: unknown, code: string): boolean {
  return err instanceof CliError && (err.errors?.some((e) => e.code === code) ?? false);
}
