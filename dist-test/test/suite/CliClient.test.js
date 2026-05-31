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
const fixtures = __importStar(require("../fixtures/envelopes"));
describe("parseEnvelope", () => {
    it("parses ok:true envelope and returns typed result", () => {
        const envelope = (0, envelope_1.parseEnvelope)(fixtures.OK_REPO_MAP, "repo map");
        assert.strictEqual(envelope.ok, true);
        if (envelope.ok) {
            assert.ok(envelope.payload.repoMap);
            assert.strictEqual(envelope.version, "0.1.0");
        }
    });
    it("parses ok:false envelope and returns diagnostics", () => {
        const envelope = (0, envelope_1.parseEnvelope)(fixtures.ERR_NOTE_GET, "note get");
        assert.strictEqual(envelope.ok, false);
        if (!envelope.ok) {
            assert.ok(Array.isArray(envelope.diagnostics));
            assert.ok(envelope.diagnostics[0].includes("not found"));
        }
    });
    it("throws CliError on non-JSON stdout", () => {
        assert.throws(() => (0, envelope_1.parseEnvelope)(fixtures.MALFORMED_NOT_JSON, "repo map"), (err) => {
            assert.ok(err instanceof envelope_1.CliError);
            assert.ok(err.message.includes("not valid JSON"));
            return true;
        });
    });
    it("throws CliError on empty stdout", () => {
        assert.throws(() => (0, envelope_1.parseEnvelope)(fixtures.EMPTY_STDOUT, "repo map"), (err) => {
            assert.ok(err instanceof envelope_1.CliError);
            assert.ok(err.message.includes("no output"));
            return true;
        });
    });
    it("throws CliError when envelope is missing ok field", () => {
        assert.throws(() => (0, envelope_1.parseEnvelope)(fixtures.MISSING_OK_FIELD, "repo map"), (err) => {
            assert.ok(err instanceof envelope_1.CliError);
            assert.ok(err.message.includes("'ok'"));
            return true;
        });
    });
    it("CliError carries the command hint", () => {
        try {
            (0, envelope_1.parseEnvelope)(fixtures.EMPTY_STDOUT, "note get");
            assert.fail("Should have thrown");
        }
        catch (err) {
            assert.ok(err instanceof envelope_1.CliError);
            assert.strictEqual(err.command, "note get");
        }
    });
});
describe("buildArgv", () => {
    it("always includes --repo, --format, json", () => {
        const args = (0, envelope_1.buildArgv)("/my/repo", ["note", "list"]);
        assert.ok(args.includes("--repo"));
        assert.ok(args.includes("/my/repo"));
        assert.ok(args.includes("--format"));
        assert.ok(args.includes("json"));
    });
    it("appends subcommand args after global flags", () => {
        const args = (0, envelope_1.buildArgv)("/repo", ["note", "list"]);
        const noteIdx = args.indexOf("note");
        const listIdx = args.indexOf("list");
        assert.ok(noteIdx > 0);
        assert.strictEqual(listIdx, noteIdx + 1);
    });
    it("appends --pretty when options.pretty is true", () => {
        const args = (0, envelope_1.buildArgv)("/repo", ["repo", "map"], { pretty: true });
        assert.ok(args.includes("--pretty"));
    });
    it("does not include --pretty when options.pretty is false", () => {
        const args = (0, envelope_1.buildArgv)("/repo", ["repo", "map"], { pretty: false });
        assert.ok(!args.includes("--pretty"));
    });
    it("appends --container <id> when containerId is set", () => {
        const args = (0, envelope_1.buildArgv)("/repo", ["note", "list"], {
            containerId: "c-abc-123",
        });
        assert.ok(args.includes("--container"));
        assert.ok(args.includes("c-abc-123"));
        const containerIdx = args.indexOf("--container");
        assert.strictEqual(args[containerIdx + 1], "c-abc-123");
    });
    it("does not include --container when containerId is undefined", () => {
        const args = (0, envelope_1.buildArgv)("/repo", ["note", "list"]);
        assert.ok(!args.includes("--container"));
    });
    it("places --container before subcommand args", () => {
        const args = (0, envelope_1.buildArgv)("/repo", ["note", "list"], {
            containerId: "c-xyz",
        });
        const containerIdx = args.indexOf("--container");
        const noteIdx = args.indexOf("note");
        assert.ok(containerIdx < noteIdx);
    });
});
//# sourceMappingURL=CliClient.test.js.map