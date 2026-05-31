import * as vscode from "vscode";
import * as path from "path";
import { CliClient } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import type { RepoValidatePayload } from "../cli/types";

// Synthetic URI used when we cannot map a diagnostic to a specific file.
// VS Code surfaces these under a virtual "SRS Repository" entry in the Problems panel.
const REPO_DIAGNOSTIC_SOURCE = "SRS";

export class DiagnosticsProvider implements vscode.Disposable {
  private readonly _collection: vscode.DiagnosticCollection;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly cli: CliClient,
    private readonly repoProvider: RepositoryProvider,
  ) {
    this._collection = vscode.languages.createDiagnosticCollection("srs");
    this._disposables.push(this._collection);
  }

  // Run validation and populate the DiagnosticCollection.
  // Called explicitly (e.g. after save) or by commands.
  async validate(): Promise<void> {
    const repo = this.repoProvider.active;
    if (!repo) {
      return;
    }

    this._collection.clear();

    // ok:false means CLI invocation failed (bad binary, no manifest, etc.) — not semantic errors
    const envelope = await this.cli.run<RepoValidatePayload>(
      repo.rootPath,
      ["repo", "validate"],
    );

    if (!envelope.ok) {
      // Surface the invocation error against a synthetic URI for the repo root
      const uri = vscode.Uri.file(path.join(repo.rootPath, "manifest.json"));
      this._collection.set(uri, [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          envelope.diagnostics.join("; "),
          vscode.DiagnosticSeverity.Error,
        ),
      ]);
      return;
    }

    const { diagnostics } = envelope.payload;
    if (diagnostics.length === 0) {
      return;
    }

    // Group diagnostics by file URI
    const byUri = new Map<string, vscode.Diagnostic[]>();

    for (const d of diagnostics) {
      const uri = d.relative_path
        ? vscode.Uri.file(path.join(repo.rootPath, d.relative_path)).toString()
        : vscode.Uri.file(path.join(repo.rootPath, "manifest.json")).toString();

      const severity = severityFor(d.severity);
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        d.message,
        severity,
      );
      diag.source = REPO_DIAGNOSTIC_SOURCE;

      if (!byUri.has(uri)) {
        byUri.set(uri, []);
      }
      byUri.get(uri)!.push(diag);
    }

    for (const [uriStr, diags] of byUri) {
      this._collection.set(vscode.Uri.parse(uriStr), diags);
    }
  }

  // Clear all diagnostics (e.g. when active repo changes)
  clear(): void {
    this._collection.clear();
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}

function severityFor(s: string | undefined): vscode.DiagnosticSeverity {
  switch (s) {
    case "Error":   return vscode.DiagnosticSeverity.Error;
    case "Warning": return vscode.DiagnosticSeverity.Warning;
    default:        return vscode.DiagnosticSeverity.Information;
  }
}
