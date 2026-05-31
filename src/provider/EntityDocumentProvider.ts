import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import type { EntityKind } from "../cli/types";

export const ENTITY_SCHEME = "srs-entity";

/**
 * URI format: srs-entity://<repositoryId>/<kind>/<entityId>
 *
 * The repositoryId in the authority anchors the document to a specific repo so
 * that if the active repo changes, previously-opened tabs remain valid (they
 * just re-fetch from the same repo path they were opened with).
 */
export function entityUri(
  repositoryId: string,
  kind: EntityKind,
  entityId: string,
): vscode.Uri {
  return vscode.Uri.from({
    scheme: ENTITY_SCHEME,
    authority: repositoryId,
    path: `/${kind}/${entityId}`,
  });
}

export function parseEntityUri(uri: vscode.Uri): {
  repositoryId: string;
  kind: string;
  entityId: string;
} {
  const parts = uri.path.replace(/^\//, "").split("/");
  return {
    repositoryId: uri.authority,
    kind: parts[0] ?? "",
    entityId: parts[1] ?? "",
  };
}

export class EntityDocumentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChangeEmitter = this._onDidChange;
  readonly onDidChange = this._onDidChange.event;

  constructor(
    private readonly cli: CliClient,
    private readonly repoProvider: RepositoryProvider,
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { kind, entityId } = parseEntityUri(uri);

    const repo = this.repoProvider.active;
    if (!repo) {
      return JSON.stringify({ error: "No active SRS repository" }, null, 2);
    }

    const getArgs = getArgsFor(kind, entityId);
    if (!getArgs) {
      return JSON.stringify({ error: `Unknown entity kind: ${kind}` }, null, 2);
    }

    try {
      const payload = await this.cli.runOk<unknown>(repo.rootPath, getArgs, {
        pretty: true,
      });
      return JSON.stringify(payload, null, 2);
    } catch (err) {
      const msg = err instanceof CliError ? err.message : String(err);
      return JSON.stringify({ error: msg }, null, 2);
    }
  }

  // Call this to force a refresh of an already-open entity document.
  refresh(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

function getArgsFor(kind: string, entityId: string): string[] | undefined {
  switch (kind) {
    case "note":           return ["note", "get", entityId];
    case "tag":            return ["tag", "get", entityId];
    case "record":         return ["record", "get", entityId];
    case "relation":       return ["relation", "get", entityId];
    case "container":      return ["container", "get", entityId];
    case "field":          return ["field", "get", entityId];
    case "type":           return ["type", "get", entityId];
    case "extension":      return ["extension", "get", entityId];
    case "protocol":       return ["protocol", "get", entityId];
    case "view":           return ["view", "get", entityId];
    case "document-view":  return ["document-view", "get", entityId];
    case "relation-type":  return ["relation-type", "get", entityId];
    default:               return undefined;
  }
}
