// Pure functions for CLI envelope parsing and argv construction.
// No vscode dependency — importable in unit tests without the extension host.
import type { SrsEnvelope } from "./types";
import { CliError } from "./errors";

export { CliError } from "./errors";

export interface CliRunOptions {
  pretty?: boolean;
  containerId?: string;
  stdin?: string;
}

export function parseEnvelope<T>(
  stdout: string,
  commandHint: string,
): SrsEnvelope<T> {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new CliError("srs produced no output", ["Empty stdout"], commandHint);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new CliError(
      `srs output is not valid JSON: ${trimmed.slice(0, 200)}`,
      ["Non-JSON stdout"],
      commandHint,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["ok"] !== "boolean"
  ) {
    throw new CliError(
      "srs envelope missing 'ok' field",
      ["Malformed envelope"],
      commandHint,
    );
  }

  return parsed as SrsEnvelope<T>;
}

export function buildArgv(
  repoPath: string,
  subcommandArgs: string[],
  options?: CliRunOptions,
): string[] {
  const args = ["--repo", repoPath, "--format", "json"];
  if (options?.pretty) {
    args.push("--pretty");
  }
  if (options?.containerId) {
    args.push("--container", options.containerId);
  }
  args.push(...subcommandArgs);
  return args;
}
