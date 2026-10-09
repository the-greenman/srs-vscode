import type { ErrorReportPayload } from "./types";

// No vscode dependency — safe to import in unit tests.
export class CliError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[],
    public readonly command: string,
    // Structured errors aligned 1:1 with `diagnostics` (srs-rust ADR-053), when the
    // envelope carried them. Absent for client-side failures (spawn errors, non-JSON
    // output) that never reached the CLI's envelope encoder.
    public readonly errors?: ErrorReportPayload[],
  ) {
    super(message);
    this.name = "CliError";
  }
}
