import * as assert from "assert";
import { parseEnvelope, buildArgv, CliError } from "../../src/cli/envelope";
import { isCannotDeleteInUse } from "../../src/cli/errors";
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

  it("parses the structured errors[] alongside diagnostics on ok:false", () => {
    const envelope = parseEnvelope<never>(
      fixtures.ERR_CANNOT_DELETE_IN_USE,
      "theme delete",
    );
    assert.strictEqual(envelope.ok, false);
    if (!envelope.ok) {
      assert.strictEqual(envelope.errors?.[0].code, "cannot-delete-in-use");
      assert.strictEqual(envelope.errors?.[0].message, envelope.diagnostics[0]);
    }
  });
});

describe("isCannotDeleteInUse", () => {
  it("matches the structured cannot-delete-in-use code", () => {
    const envelope = parseEnvelope<never>(
      fixtures.ERR_CANNOT_DELETE_IN_USE,
      "theme delete",
    );
    assert.strictEqual(envelope.ok, false);
    const err = new CliError(
      "srs theme delete failed",
      !envelope.ok ? envelope.diagnostics : [],
      "theme delete",
      !envelope.ok ? envelope.errors : undefined,
    );
    assert.ok(isCannotDeleteInUse(err));
  });

  it("does not match on the real refusal text alone (no errors[])", () => {
    // Regression for srs-vscode#131: the engine's Display message says
    // "referenced by", never "used by" or "CannotDeleteInUse" — a substring
    // check on diagnostics never matched, even before errors[] existed.
    const err = new CliError(
      "srs theme delete failed",
      ["cannot delete theme 'theme-1': still referenced by [comp-1]"],
      "theme delete",
    );
    assert.strictEqual(isCannotDeleteInUse(err), false);
  });

  it("does not match an unrelated error", () => {
    const err = new CliError("srs note get failed", ["not found"], "note get", [
      { code: "note-not-found", message: "not found" },
    ]);
    assert.strictEqual(isCannotDeleteInUse(err), false);
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
