import * as cp from "child_process";
import * as vscode from "vscode";
import { CliError } from "./errors";
import { parseEnvelope, buildArgv } from "./envelope";
import type { SrsEnvelope } from "./types";
import type { CliRunOptions } from "./envelope";

export { CliError } from "./errors";
export { parseEnvelope, buildArgv } from "./envelope";
export type { CliRunOptions } from "./envelope";

export class CliClient {
  constructor(private readonly outputChannel: vscode.OutputChannel) {}

  private get binaryPath(): string {
    return vscode.workspace
      .getConfiguration("srs")
      .get<string>("cli.path", "srs");
  }

  private get tracing(): boolean {
    return vscode.workspace
      .getConfiguration("srs")
      .get<boolean>("trace.cli", false);
  }

  // Run a CLI command and return the raw envelope (ok:true or ok:false).
  async run<T>(
    repoPath: string,
    subcommandArgs: string[],
    options?: CliRunOptions,
  ): Promise<SrsEnvelope<T>> {
    const binary = this.binaryPath;
    const args = buildArgv(repoPath, subcommandArgs, options);
    const commandHint = subcommandArgs[0] ?? "unknown";

    if (this.tracing) {
      this.outputChannel.appendLine(`[srs] ${binary} ${args.join(" ")}`);
    }

    return new Promise((resolve, reject) => {
      let proc: cp.ChildProcess;
      try {
        proc = cp.spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
      } catch (err) {
        reject(
          new CliError(
            `Failed to spawn srs binary '${binary}'. Check srs.cli.path in settings.`,
            [`Spawn error: ${String(err)}`],
            commandHint,
          ),
        );
        return;
      }

      let stdout = "";
      let stderr = "";
      proc.stdout!.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr!.on("data", (d: Buffer) => {
        stderr += d.toString();
      });

      if (options?.stdin) {
        proc.stdin!.write(options.stdin);
      }
      proc.stdin!.end();

      proc.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          reject(
            new CliError(
              `srs binary not found at '${binary}'. Install srs and set srs.cli.path in settings.`,
              [`Binary not found: ${binary}`],
              commandHint,
            ),
          );
        } else {
          reject(
            new CliError(
              `srs process error: ${err.message}`,
              [err.message],
              commandHint,
            ),
          );
        }
      });

      proc.on("close", () => {
        if (this.tracing && stdout) {
          this.outputChannel.appendLine(`[srs stdout] ${stdout.slice(0, 2000)}`);
        }
        if (stderr) {
          this.outputChannel.appendLine(`[srs stderr] ${stderr}`);
        }

        try {
          resolve(parseEnvelope<T>(stdout, commandHint));
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  // Run and assert ok:true; throw CliError on ok:false.
  async runOk<T>(
    repoPath: string,
    subcommandArgs: string[],
    options?: CliRunOptions,
  ): Promise<T> {
    const envelope = await this.run<T>(repoPath, subcommandArgs, options);
    if (!envelope.ok) {
      throw new CliError(
        `srs ${subcommandArgs.join(" ")} failed: ${envelope.diagnostics.join("; ")}`,
        envelope.diagnostics,
        subcommandArgs[0] ?? "unknown",
      );
    }
    return envelope.payload;
  }
}
