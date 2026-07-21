import * as vscode from "vscode";
import * as path from "path";

// Maps file glob patterns to their SRS JSON schema file (relative to extension root).
// The extension.ts will resolve these to absolute URIs and register them with vscode.
const SCHEMA_ASSOCIATIONS: Array<{ glob: string; schema: string }> = [
  { glob: "**/manifest.json",              schema: "schemas/2.0/manifest.json" },
  // Instance files are always `.json`. `**` after the folder matches tier-nested
  // layouts too (e.g. an unpacked archive's records/tier-2/*.json). `.srsj`/`.srs`
  // are whole-repo bundle extensions, never per-instance files — do not glob them.
  { glob: "**/records/**/*.json",          schema: "schemas/2.0/record.json" },
  { glob: "**/notes/**/*.json",            schema: "schemas/2.0/note.json" },
  { glob: "**/typed-records/**/*.json",    schema: "schemas/2.0/typed-record.json" },
  { glob: "**/package/fields/*.json",      schema: "schemas/2.0/field.json" },
  { glob: "**/package/types/*.json",       schema: "schemas/2.0/type.json" },
  { glob: "**/package/views/*.json",       schema: "schemas/2.0/view.json" },
  { glob: "**/package/document-views/*.json", schema: "schemas/2.0/document-view.json" },
  { glob: "**/package/package.json",       schema: "schemas/2.0/package-manifest.json" },
  { glob: "**/relations/relations.json",   schema: "schemas/2.0/relations-collection.json" },
  { glob: "**/containers/*.json",          schema: "schemas/2.0/container.json" },
  { glob: "**/*.meta.json",               schema: "schemas/2.0/source-document-meta.json" },
];

export class SchemaProvider implements vscode.Disposable {
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
    this._register();
  }

  private _register(): void {
    const jsonConfig = vscode.workspace.getConfiguration("json");
    const existing: Array<{ fileMatch: string[]; url: string }> =
      jsonConfig.get("schemas") ?? [];

    const toAdd = SCHEMA_ASSOCIATIONS.filter(
      (assoc) =>
        !existing.some((e) => e.fileMatch.includes(assoc.glob)),
    ).map((assoc) => ({
      fileMatch: [assoc.glob],
      url: vscode.Uri.joinPath(this.extensionUri, assoc.schema).toString(),
    }));

    if (toAdd.length === 0) return;

    jsonConfig.update(
      "schemas",
      [...existing, ...toAdd],
      vscode.ConfigurationTarget.Workspace,
    );
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
  }
}
