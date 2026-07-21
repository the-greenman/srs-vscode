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
const assert = __importStar(require("assert"));
const envelope_1 = require("../../src/cli/envelope");
const workdir_1 = require("../../src/archive/workdir");
describe("buildRawArgv", () => {
    it("prepends --format json and never injects --repo", () => {
        const args = (0, envelope_1.buildRawArgv)(["archive", "unpack", "/x/a.srs", "--target", "/w"]);
        assert.ok(!args.includes("--repo"));
        assert.strictEqual(args[0], "--format");
        assert.strictEqual(args[1], "json");
    });
    it("keeps subcommand args in order after the global flags", () => {
        const args = (0, envelope_1.buildRawArgv)(["archive", "unpack", "/x/a.srs", "--target", "/w"]);
        assert.deepStrictEqual(args.slice(2), [
            "archive",
            "unpack",
            "/x/a.srs",
            "--target",
            "/w",
        ]);
    });
    it("appends --pretty when requested", () => {
        const args = (0, envelope_1.buildRawArgv)(["archive", "pack"], { pretty: true });
        assert.ok(args.includes("--pretty"));
    });
    it("ignores containerId (raw commands have no container scope)", () => {
        const args = (0, envelope_1.buildRawArgv)(["archive", "unpack"], { containerId: "c-1" });
        assert.ok(!args.includes("--container"));
        assert.ok(!args.includes("c-1"));
    });
});
describe("archiveWorkdirName", () => {
    it("is deterministic for the same archive path", () => {
        assert.strictEqual((0, workdir_1.archiveWorkdirName)("/home/u/governance.srs"), (0, workdir_1.archiveWorkdirName)("/home/u/governance.srs"));
    });
    it("distinguishes same-basename archives in different directories", () => {
        assert.notStrictEqual((0, workdir_1.archiveWorkdirName)("/home/a/governance.srs"), (0, workdir_1.archiveWorkdirName)("/home/b/governance.srs"));
    });
    it("embeds the sanitised basename (without extension)", () => {
        assert.ok((0, workdir_1.archiveWorkdirName)("/home/u/governance.srs").startsWith("governance-"));
    });
    it("produces a filesystem-safe single segment", () => {
        const name = (0, workdir_1.archiveWorkdirName)("/home/u/my repo (v2).srs");
        assert.ok(!/[\\/\s]/.test(name), `expected no path separators/spaces: ${name}`);
        assert.match(name, /^[A-Za-z0-9._-]+$/);
    });
});
//# sourceMappingURL=archive.test.js.map