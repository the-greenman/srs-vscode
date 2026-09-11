/**
 * Argv-vs-`--help` smoke test.
 *
 * Nothing else in this suite cross-checks the argv the extension actually
 * issues against the CLI clap grammar it targets — every other test mocks
 * CliClient. That gap is exactly how srs-vscode#119 happened: a rename on
 * the srs-rust side (`document-view` -> `composition`) went unnoticed here
 * until a user hit a silently-empty tree.
 *
 * This test statically extracts every `["<cmd>", "<subcommand>", ...]` argv
 * literal from src/ (the two leading string-literal tokens of an array —
 * dynamic first elements like `[kind, "get", id]` are skipped by
 * construction, since `kind` isn't a quoted literal) and asks the real `srs`
 * binary to resolve each (command, subcommand) pair via `--help`, which
 * clap answers before validating any other arguments or requiring a repo.
 *
 * Requires `srs` on PATH — CI installs the latest release binary for this
 * job (see .github/workflows/ci.yml); locally it uses whatever `srs` is
 * already on PATH. A genuinely absent binary is a different kind of gap
 * than a missing committed schema file (test/suite/payload-contracts.test.ts)
 * and skips rather than fails, with a clear message.
 */
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

function findSrsBinary(): string | undefined {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", ["srs"], { stdio: "pipe" });
    return "srs";
  } catch {
    return undefined;
  }
}

// Matches an array literal's first two elements when BOTH are lowercase-led
// string literals, e.g. `["composition", "list-for-container", containerId]`
// or `["note", "get", id]`. Deliberately excludes GROUP_ORDER-style label
// tuples (`["note", "Notes"]`) since those capitalize the second element.
const ARGV_HEAD_RE = /\[\s*"([a-z][a-z-]*)"\s*,\s*"([a-z][a-z-]*)"/g;

function extractArgvHeads(srcDir: string): Array<[string, string]> {
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const text = fs.readFileSync(full, "utf-8");
      let m: RegExpExecArray | null;
      ARGV_HEAD_RE.lastIndex = 0;
      while ((m = ARGV_HEAD_RE.exec(text))) {
        // Filter non-argv array literals that happen to match the shape:
        // `new Set([...])` kind-membership lists (e.g. PREVIEW_KINDS) and
        // `stdio: ["pipe", "pipe", "pipe"]` process options are not CLI argv.
        const before = text.slice(Math.max(0, m.index - 12), m.index);
        if (/Set\(\s*$/.test(before) || /stdio:\s*$/.test(before)) continue;

        const key = `${m[1]} ${m[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([m[1], m[2]]);
        }
      }
    }
  }

  walk(srcDir);
  return pairs;
}

describe("argv smoke test", () => {
  const srsBin = findSrsBinary();

  before(function () {
    if (!srsBin) {
      console.warn(
        "[argv-smoke] `srs` not found on PATH — skipping. Install srs (or run in CI, " +
          "which downloads the latest release binary) to exercise this test.",
      );
      this.skip();
    }
  });

  it("resolves every extracted (command, subcommand) argv head via --help", function () {
    this.timeout(30000);
    const srcDir = path.join(__dirname, "../../../src");
    const pairs = extractArgvHeads(srcDir);

    // A sanity floor — if this drops near zero, the extraction regex broke,
    // not the extension's argv (guards the guard).
    assert.ok(
      pairs.length > 15,
      `expected to statically extract a meaningful number of argv heads from src/, got ${pairs.length}`,
    );

    const failures: string[] = [];
    for (const [cmd, sub] of pairs) {
      try {
        execFileSync(srsBin!, [cmd, sub, "--help"], { stdio: "pipe" });
      } catch (err) {
        const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? String(err);
        failures.push(`${cmd} ${sub}: ${stderr.split("\n")[0]}`);
      }
    }

    assert.deepStrictEqual(
      failures,
      [],
      `unrecognized argv head(s) — a subcommand the extension issues no longer exists ` +
        `in the CLI:\n${failures.join("\n")}`,
    );
  });
});
