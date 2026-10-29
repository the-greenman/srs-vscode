import * as assert from "assert";
import * as vscode from "vscode";
import { DiagnosticsProvider } from "../../src/diagnostics/DiagnosticsProvider";
import type { MockDiagnosticCollection } from "../fixtures/vscode-mock";

// srs-vscode#155: the engine's stable rule code (srs-rust#1264) is set on
// vscode.Diagnostic.code when present; an older binary that emits none is
// unchanged. The code is never parsed out of the message.

function makeProvider(diagnostics: Array<Record<string, unknown>>) {
  const cli = {
    run: async () => ({
      ok: true,
      payload: {
        summary: { checked: 1, errors: 1, warnings: 0, advisories: 0 },
        diagnostics,
      },
    }),
  };
  const repoProvider = { active: { rootPath: "/repo" } };
  const provider = new DiagnosticsProvider(cli as never, repoProvider as never);
  const collection = (
    vscode.languages as unknown as { lastCollection: MockDiagnosticCollection }
  ).lastCollection;
  return { provider, collection };
}

describe("validation diagnostics carry the engine's code (#155)", () => {
  it("sets Diagnostic.code when the engine supplies one", async () => {
    const { provider, collection } = makeProvider([
      { severity: "error", path: "a.json", code: "R23", message: "[R23] too deep" },
    ]);
    await provider.validate();
    const [diag] = [...collection.entries.values()][0];
    assert.strictEqual(diag.code, "R23");
    assert.strictEqual(diag.message, "[R23] too deep");
  });

  it("leaves Diagnostic.code unset when the engine supplies none", async () => {
    const { provider, collection } = makeProvider([
      { severity: "error", path: "a.json", message: "[R23] too deep" },
    ]);
    await provider.validate();
    const [diag] = [...collection.entries.values()][0];
    assert.strictEqual(diag.code, undefined);
  });
});
