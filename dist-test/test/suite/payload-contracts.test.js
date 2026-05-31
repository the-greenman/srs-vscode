"use strict";
/**
 * Payload contract validation tests.
 *
 * Loads JSON Schema golden files from srs-rust/crates/srs-cli/schemas/payload/
 * and validates fixture CLI payloads against them using AJV.
 *
 * These tests catch TypeScript fixture drift against the authoritative Rust
 * payload definitions. If a schema file is missing or the golden schema
 * directory cannot be found (e.g. srs-rust is not co-located), the suite
 * logs a warning and skips rather than failing.
 *
 * When a contract test fails:
 *   1. Check whether the fixture payload needs updating, OR
 *   2. Whether the Rust payload struct was changed — run
 *      `cargo run --bin generate-schemas` in srs-rust/ to regenerate.
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ajv_1 = __importDefault(require("ajv"));
// Golden schema files are in the sibling srs-rust workspace.
// From dist-test/test/suite/ go up 4 levels to reach semanticops/.
const SCHEMA_DIR = path.resolve(__dirname, "../../../../srs-rust/crates/srs-cli/schemas/payload");
const schemaDirExists = fs.existsSync(SCHEMA_DIR);
function loadSchema(name) {
    const schemaPath = path.join(SCHEMA_DIR, `${name}.json`);
    if (!fs.existsSync(schemaPath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
}
function makeValidator(schemaName) {
    if (!schemaDirExists) {
        return null;
    }
    const schema = loadSchema(schemaName);
    if (!schema) {
        return null;
    }
    const ajv = new ajv_1.default({ strict: false, formats: { uint: true, int64: true } });
    const validate = ajv.compile(schema);
    return (payload) => {
        const valid = validate(payload);
        if (!valid) {
            const errors = validate.errors
                ?.map((e) => `${e.instancePath} ${e.message}`)
                .join("; ");
            assert.fail(`Payload does not match schema '${schemaName}': ${errors}\n` +
                `Payload: ${JSON.stringify(payload, null, 2)}`);
        }
    };
}
describe("payload contracts", () => {
    before(function () {
        if (!schemaDirExists) {
            console.warn(`[payload-contracts] WARN: Schema directory not found at ${SCHEMA_DIR}. ` +
                `Co-locate srs-rust/ with srs-vscode/ to enable contract validation. Skipping.`);
            this.skip();
        }
    });
    // ── note list ──────────────────────────────────────────────────────────────
    it("validates note-list payload against golden schema", () => {
        const check = makeValidator("note-list");
        if (!check) {
            return;
        }
        // Valid payload: notes array with instanceId and title
        check({ notes: [{ instanceId: "note-001", title: "First Note" }] });
        check({ notes: [] });
    });
    it("rejects note-list payload missing required 'notes' key", () => {
        const schema = loadSchema("note-list");
        if (!schema) {
            return;
        }
        const ajv = new ajv_1.default({ strict: false, formats: { uint: true, int64: true } });
        const validate = ajv.compile(schema);
        assert.strictEqual(validate({ notez: [] }), false, "Expected validation to fail for wrong key name");
    });
    // ── repo validate ──────────────────────────────────────────────────────────
    it("validates repo-validate payload (clean) against golden schema", () => {
        const check = makeValidator("repo-validate");
        if (!check) {
            return;
        }
        check({
            summary: { checked: 100, errors: 0, warnings: 0 },
            diagnostics: [],
        });
    });
    it("validates repo-validate payload (with errors) against golden schema", () => {
        const check = makeValidator("repo-validate");
        if (!check) {
            return;
        }
        check({
            summary: { checked: 50, errors: 2, warnings: 1 },
            diagnostics: [
                { severity: "error", path: "records/foo.json", message: "invalid field value" },
            ],
        });
    });
    it("rejects repo-validate payload missing summary.checked", () => {
        const schema = loadSchema("repo-validate");
        if (!schema) {
            return;
        }
        const ajv = new ajv_1.default({ strict: false, formats: { uint: true, int64: true } });
        const validate = ajv.compile(schema);
        // summary.checked is required by RepoValidateSummary
        assert.strictEqual(validate({ summary: { errors: 0, warnings: 0 }, diagnostics: [] }), false, "Expected validation to fail for missing summary.checked");
    });
    // ── note tag list ──────────────────────────────────────────────────────────
    it("validates note-tag-list payload against golden schema", () => {
        const check = makeValidator("note-tag-list");
        if (!check) {
            return;
        }
        check({
            totalNotes: 10,
            tags: [{ tag: "foundation", noteCount: 3 }],
        });
        check({ totalNotes: 0, tags: [] });
    });
    // ── tag list ───────────────────────────────────────────────────────────────
    it("validates tag-list payload against golden schema", () => {
        const check = makeValidator("tag-list");
        if (!check) {
            return;
        }
        // tagDefinitions is an array of any (external type, validated at runtime)
        check({
            tagDefinitions: [{ instanceId: "tag-001", slug: "foundation" }],
        });
        check({ tagDefinitions: [] });
    });
    // ── render document-view ───────────────────────────────────────────────────
    it("validates render-document-view payload against golden schema", () => {
        const check = makeValidator("render-document-view");
        if (!check) {
            return;
        }
        check({ rendered: "# My Document\n...", diagnostics: [] });
        check({ rendered: "", diagnostics: ["warning: empty view"] });
    });
    // ── package list ───────────────────────────────────────────────────────────
    it("validates package-list payload against golden schema", () => {
        const check = makeValidator("package-list");
        if (!check) {
            return;
        }
        check({
            packages: [
                {
                    id: "pkg-001",
                    namespace: "com.example",
                    name: "my-package",
                    version: "1.0.0",
                    boundaryPath: null,
                    fieldCount: 5,
                    typeCount: 2,
                },
            ],
        });
    });
});
//# sourceMappingURL=payload-contracts.test.js.map