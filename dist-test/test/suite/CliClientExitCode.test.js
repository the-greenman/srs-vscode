"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
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
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const CliClient_1 = require("../../src/cli/CliClient");
const errors_1 = require("../../src/cli/errors");
function fakeOutputChannel() {
    return { appendLine: () => { } };
}
describe("CliClient — exit code / stderr surfacing", () => {
    let tmpDir;
    let originalPath;
    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "srs-vscode-clitest-"));
        originalPath = process.env.PATH;
    });
    afterEach(() => {
        process.env.PATH = originalPath;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
    function installFakeSrs(script) {
        const binPath = path.join(tmpDir, "srs");
        fs.writeFileSync(binPath, script, { mode: 0o755 });
        process.env.PATH = `${tmpDir}${path.delimiter}${process.env.PATH ?? ""}`;
    }
    it("surfaces stderr instead of the generic 'no output' error on a non-zero exit with empty stdout", async () => {
        // This is exactly the srs-rust rename failure mode: `srs document-view
        // list` after the DocumentView->Composition rename exits 2 with clap's
        // usage text on stderr and nothing on stdout.
        installFakeSrs("#!/bin/sh\necho \"error: unrecognized subcommand 'document-view'\" 1>&2\nexit 2\n");
        const cli = new CliClient_1.CliClient(fakeOutputChannel());
        await assert.rejects(() => cli.run("/repo", ["document-view", "list"]), (err) => {
            assert.ok(err instanceof errors_1.CliError, "expected a CliError");
            assert.match(err.message, /unrecognized subcommand 'document-view'/);
            assert.ok(err.diagnostics.some((d) => d.includes("unrecognized subcommand")), `expected diagnostics to include the stderr line, got: ${JSON.stringify(err.diagnostics)}`);
            // Must NOT be the old generic message this replaces.
            assert.ok(!err.message.includes("srs produced no output"));
            return true;
        });
    });
    it("still parses a valid ok:false envelope on a non-zero exit (unaffected by the stderr fallback)", async () => {
        // A command that legitimately fails validation (not a clap/argv error)
        // still exits non-zero in some cases but prints a well-formed envelope —
        // that path must keep working exactly as parseEnvelope always handled it.
        installFakeSrs("#!/bin/sh\necho '{\"ok\":false,\"command\":\"note get\",\"version\":\"0.1.0\",\"diagnostics\":[\"not found\"]}'\nexit 1\n");
        const cli = new CliClient_1.CliClient(fakeOutputChannel());
        const envelope = await cli.run("/repo", ["note", "get", "missing-id"]);
        assert.strictEqual(envelope.ok, false);
        if (!envelope.ok) {
            assert.deepStrictEqual(envelope.diagnostics, ["not found"]);
        }
    });
    it("still parses a valid ok:true envelope on a zero exit", async () => {
        installFakeSrs("#!/bin/sh\necho '{\"ok\":true,\"command\":\"note list\",\"version\":\"0.1.0\",\"payload\":{\"notes\":[]}}'\nexit 0\n");
        const cli = new CliClient_1.CliClient(fakeOutputChannel());
        const envelope = await cli.run("/repo", ["note", "list"]);
        assert.strictEqual(envelope.ok, true);
    });
});
//# sourceMappingURL=CliClientExitCode.test.js.map