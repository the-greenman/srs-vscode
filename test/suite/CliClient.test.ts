import * as assert from "assert";
import { parseEnvelope, buildArgv, CliError } from "../../src/cli/envelope";
import { hasErrorCode } from "../../src/cli/errors";
import * as fixtures from "../fixtures/envelopes";

describe("parseEnvelope", () => {
  it("parses ok:true envelope and returns typed result", () => {
    const envelope = parseEnvelope<{ repoMap: unknown }>(
      fixtures.OK_REPO_MAP,
      "repo map",
    );
    assert.strictEqual(envelope.ok, true);
    if (envelope.ok) {
      assert.ok(envelope.payload.repoMap);
      assert.strictEqual(envelope.version, "0.1.0");
    }
  });

  it("parses ok:false envelope and returns diagnostics", () => {
    const envelope = parseEnvelope<never>(fixtures.ERR_NOTE_GET, "note get");
    assert.strictEqual(envelope.ok, false);
    if (!envelope.ok) {
      assert.ok(Array.isArray(envelope.diagnostics));
      assert.ok(envelope.diagnostics[0].includes("not found"));
    }
  });

  it("throws CliError on non-JSON stdout", () => {
    assert.throws(
      () => parseEnvelope(fixtures.MALFORMED_NOT_JSON, "repo map"),
      (err: unknown) => {
        assert.ok(err instanceof CliError);
        assert.ok(err.message.includes("not valid JSON"));
        return true;
      },
    );
  });

  it("throws CliError on empty stdout", () => {
    assert.throws(
      () => parseEnvelope(fixtures.EMPTY_STDOUT, "repo map"),
      (err: unknown) => {
        assert.ok(err instanceof CliError);
        assert.ok(err.message.includes("no output"));
        return true;
      },
    );
  });

  it("throws CliError when envelope is missing ok field", () => {
    assert.throws(
      () => parseEnvelope(fixtures.MISSING_OK_FIELD, "repo map"),
      (err: unknown) => {
        assert.ok(err instanceof CliError);
        assert.ok(err.message.includes("'ok'"));
        return true;
      },
    );
  });

  it("CliError carries the command hint", () => {
    try {
      parseEnvelope(fixtures.EMPTY_STDOUT, "note get");
      assert.fail("Should have thrown");
    } catch (err) {
      assert.ok(err instanceof CliError);
      assert.strictEqual(err.command, "note get");
    }
  });

  it("parses the structured errors[] array alongside diagnostics (srs-vscode#131)", () => {
    const envelope = parseEnvelope<never>(
      fixtures.ERR_DELETE_IN_USE,
      "type delete",
    );
    assert.strictEqual(envelope.ok, false);
    if (!envelope.ok) {
      assert.strictEqual(envelope.errors?.[0].code, "cannot-delete-in-use");
    }
  });
});

describe("hasErrorCode (srs-vscode#131)", () => {
  it("matches on the structured code, not message substrings", () => {
    // Real srs-rust Display text post-ADR-053 ("still referenced by […]") contains
    // neither "CannotDeleteInUse" nor "used by" — the old substring check this
    // replaces would silently miss it and fall through to the generic error path.
    const err = new CliError(
      "srs type delete failed: cannot delete type 'x': still referenced by [a]",
      ["cannot delete type 'x': still referenced by [a]"],
      "type delete",
      [{ code: "cannot-delete-in-use", message: "cannot delete type 'x': still referenced by [a]" }],
    );
    assert.ok(!err.diagnostics.some((d) => d.includes("CannotDeleteInUse") || d.includes("used by")));
    assert.ok(hasErrorCode(err, "cannot-delete-in-use"));
  });

  it("is false when the code does not match", () => {
    const err = new CliError("boom", ["boom"], "note delete", [
      { code: "instance-not-found", message: "boom" },
    ]);
    assert.ok(!hasErrorCode(err, "cannot-delete-in-use"));
  });

  it("is false when the envelope carried no errors[] (older CLI binary)", () => {
    const err = new CliError("boom", ["boom"], "note delete");
    assert.ok(!hasErrorCode(err, "cannot-delete-in-use"));
  });

  it("is false for a non-CliError value", () => {
    assert.ok(!hasErrorCode(new Error("boom"), "cannot-delete-in-use"));
  });
});

describe("buildArgv", () => {
  it("always includes --repo, --format, json", () => {
    const args = buildArgv("/my/repo", ["note", "list"]);
    assert.ok(args.includes("--repo"));
    assert.ok(args.includes("/my/repo"));
    assert.ok(args.includes("--format"));
    assert.ok(args.includes("json"));
  });

  it("appends subcommand args after global flags", () => {
    const args = buildArgv("/repo", ["note", "list"]);
    const noteIdx = args.indexOf("note");
    const listIdx = args.indexOf("list");
    assert.ok(noteIdx > 0);
    assert.strictEqual(listIdx, noteIdx + 1);
  });

  it("appends --pretty when options.pretty is true", () => {
    const args = buildArgv("/repo", ["repo", "map"], { pretty: true });
    assert.ok(args.includes("--pretty"));
  });

  it("does not include --pretty when options.pretty is false", () => {
    const args = buildArgv("/repo", ["repo", "map"], { pretty: false });
    assert.ok(!args.includes("--pretty"));
  });

  it("appends --container <id> when containerId is set", () => {
    const args = buildArgv("/repo", ["note", "list"], {
      containerId: "c-abc-123",
    });
    assert.ok(args.includes("--container"));
    assert.ok(args.includes("c-abc-123"));
    const containerIdx = args.indexOf("--container");
    assert.strictEqual(args[containerIdx + 1], "c-abc-123");
  });

  it("does not include --container when containerId is undefined", () => {
    const args = buildArgv("/repo", ["note", "list"]);
    assert.ok(!args.includes("--container"));
  });

  it("places --container before subcommand args", () => {
    const args = buildArgv("/repo", ["note", "list"], {
      containerId: "c-xyz",
    });
    const containerIdx = args.indexOf("--container");
    const noteIdx = args.indexOf("note");
    assert.ok(containerIdx < noteIdx);
  });
});
