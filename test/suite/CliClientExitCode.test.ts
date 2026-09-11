/**
 * Exercises CliClient._exec's exit-code + stderr surfacing (srs-vscode#119
 * workstream 6) against a real spawned process — parseEnvelope's own unit
 * tests (CliClient.test.ts) cover the pure-function fallback message, but
 * not the exit-code branch that pre-empts it, which only exists inside
 * CliClient's `child_process.spawn` handling.
 *
 * Installs a fake `srs` executable at the front of PATH for the duration of
 * each test — CliClient's binaryPath defaults to "srs" (resolved via PATH)
 * and the vscode-mock's configuration stub always returns whatever default
 * the caller passes, so this is the one point of control available without
 * reaching into private state.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CliClient } from "../../src/cli/CliClient";
import { CliError } from "../../src/cli/errors";

function fakeOutputChannel(): { appendLine: () => void } {
  return { appendLine: () => { /* no-op */ } };
}

describe("CliClient — exit code / stderr surfacing", () => {
  let tmpDir: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "srs-vscode-clitest-"));
    originalPath = process.env.PATH;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function installFakeSrs(script: string): void {
    const binPath = path.join(tmpDir, "srs");
    fs.writeFileSync(binPath, script, { mode: 0o755 });
    process.env.PATH = `${tmpDir}${path.delimiter}${process.env.PATH ?? ""}`;
  }

  it("surfaces stderr instead of the generic 'no output' error on a non-zero exit with empty stdout", async () => {
    // This is exactly the srs-rust rename failure mode: `srs document-view
    // list` after the DocumentView->Composition rename exits 2 with clap's
    // usage text on stderr and nothing on stdout.
    installFakeSrs(
      "#!/bin/sh\necho \"error: unrecognized subcommand 'document-view'\" 1>&2\nexit 2\n",
    );
    const cli = new CliClient(fakeOutputChannel() as never);

    await assert.rejects(
      () => cli.run("/repo", ["document-view", "list"]),
      (err: unknown) => {
        assert.ok(err instanceof CliError, "expected a CliError");
        assert.match(err.message, /unrecognized subcommand 'document-view'/);
        assert.ok(
          err.diagnostics.some((d) => d.includes("unrecognized subcommand")),
          `expected diagnostics to include the stderr line, got: ${JSON.stringify(err.diagnostics)}`,
        );
        // Must NOT be the old generic message this replaces.
        assert.ok(!err.message.includes("srs produced no output"));
        return true;
      },
    );
  });

  it("still parses a valid ok:false envelope on a non-zero exit (unaffected by the stderr fallback)", async () => {
    // A command that legitimately fails validation (not a clap/argv error)
    // still exits non-zero in some cases but prints a well-formed envelope —
    // that path must keep working exactly as parseEnvelope always handled it.
    installFakeSrs(
      "#!/bin/sh\necho '{\"ok\":false,\"command\":\"note get\",\"version\":\"0.1.0\",\"diagnostics\":[\"not found\"]}'\nexit 1\n",
    );
    const cli = new CliClient(fakeOutputChannel() as never);

    const envelope = await cli.run("/repo", ["note", "get", "missing-id"]);
    assert.strictEqual(envelope.ok, false);
    if (!envelope.ok) {
      assert.deepStrictEqual(envelope.diagnostics, ["not found"]);
    }
  });

  it("still parses a valid ok:true envelope on a zero exit", async () => {
    installFakeSrs(
      "#!/bin/sh\necho '{\"ok\":true,\"command\":\"note list\",\"version\":\"0.1.0\",\"payload\":{\"notes\":[]}}'\nexit 0\n",
    );
    const cli = new CliClient(fakeOutputChannel() as never);

    const envelope = await cli.run<{ notes: unknown[] }>("/repo", ["note", "list"]);
    assert.strictEqual(envelope.ok, true);
  });
});
