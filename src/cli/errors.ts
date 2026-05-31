// No vscode dependency — safe to import in unit tests.
export class CliError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: string[],
    public readonly command: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}
