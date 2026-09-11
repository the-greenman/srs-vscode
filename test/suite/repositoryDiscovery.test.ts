import * as assert from "assert";
import { workspace } from "../fixtures/vscode-mock";
import { RepositoryProvider } from "../../src/repository/RepositoryProvider";
import type { CliClient } from "../../src/cli/CliClient";

// A CLI stub that only recognises `repoRoot` as a repository.
function cliFor(repoRoot: string, probed: string[]): CliClient {
  return {
    runOk: async (cwd: string) => {
      probed.push(cwd);
      if (cwd !== repoRoot) {
        throw new Error("not a repo");
      }
      return {
        repoMap: {
          repository: { repositoryId: "r1", title: "muSrs" },
          counts: { totalInstances: 1, notes: 0, records: 1 },
        },
      };
    },
  } as unknown as CliClient;
}

describe("RepositoryProvider.discoverAll — nested repositories (#117)", () => {
  afterEach(() => {
    workspace.workspaceFolders = [];
    workspace.findFilesResult = [];
  });

  it("finds a repository in a subdirectory of the workspace folder", async () => {
    const probed: string[] = [];
    workspace.workspaceFolders = [{ uri: { fsPath: "/ws" } }];
    workspace.findFilesResult = [{ fsPath: "/ws/muSrs/manifest.json" }];

    const found = await new RepositoryProvider(cliFor("/ws/muSrs", probed)).discoverAll();

    assert.deepStrictEqual(found.map((r) => r.rootPath), ["/ws/muSrs"]);
    assert.ok(probed.includes("/ws"), "still probes the workspace-folder root");
  });

  it("probes a workspace-folder root that also holds the manifest only once", async () => {
    const probed: string[] = [];
    workspace.workspaceFolders = [{ uri: { fsPath: "/ws" } }];
    workspace.findFilesResult = [{ fsPath: "/ws/manifest.json" }];

    const found = await new RepositoryProvider(cliFor("/ws", probed)).discoverAll();

    assert.strictEqual(found.length, 1);
    assert.strictEqual(probed.filter((p) => p === "/ws").length, 1);
  });
});
