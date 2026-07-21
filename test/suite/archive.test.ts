import * as assert from "assert";
import { buildRawArgv } from "../../src/cli/envelope";
import { archiveWorkdirName } from "../../src/archive/workdir";

describe("buildRawArgv", () => {
  it("prepends --format json and never injects --repo", () => {
    const args = buildRawArgv(["archive", "unpack", "/x/a.srs", "--target", "/w"]);
    assert.ok(!args.includes("--repo"));
    assert.strictEqual(args[0], "--format");
    assert.strictEqual(args[1], "json");
  });

  it("keeps subcommand args in order after the global flags", () => {
    const args = buildRawArgv(["archive", "unpack", "/x/a.srs", "--target", "/w"]);
    assert.deepStrictEqual(args.slice(2), [
      "archive",
      "unpack",
      "/x/a.srs",
      "--target",
      "/w",
    ]);
  });

  it("appends --pretty when requested", () => {
    const args = buildRawArgv(["archive", "pack"], { pretty: true });
    assert.ok(args.includes("--pretty"));
  });

  it("ignores containerId (raw commands have no container scope)", () => {
    const args = buildRawArgv(["archive", "unpack"], { containerId: "c-1" });
    assert.ok(!args.includes("--container"));
    assert.ok(!args.includes("c-1"));
  });
});

describe("archiveWorkdirName", () => {
  it("is deterministic for the same archive path", () => {
    assert.strictEqual(
      archiveWorkdirName("/home/u/governance.srs"),
      archiveWorkdirName("/home/u/governance.srs"),
    );
  });

  it("distinguishes same-basename archives in different directories", () => {
    assert.notStrictEqual(
      archiveWorkdirName("/home/a/governance.srs"),
      archiveWorkdirName("/home/b/governance.srs"),
    );
  });

  it("embeds the sanitised basename (without extension)", () => {
    assert.ok(archiveWorkdirName("/home/u/governance.srs").startsWith("governance-"));
  });

  it("produces a filesystem-safe single segment", () => {
    const name = archiveWorkdirName("/home/u/my repo (v2).srs");
    assert.ok(!/[\\/\s]/.test(name), `expected no path separators/spaces: ${name}`);
    assert.match(name, /^[A-Za-z0-9._-]+$/);
  });
});
