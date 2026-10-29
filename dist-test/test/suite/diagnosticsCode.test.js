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
const vscode = __importStar(require("vscode"));
const DiagnosticsProvider_1 = require("../../src/diagnostics/DiagnosticsProvider");
// srs-vscode#155: the engine's stable rule code (srs-rust#1264) is set on
// vscode.Diagnostic.code when present; an older binary that emits none is
// unchanged. The code is never parsed out of the message.
function makeProvider(diagnostics) {
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
    const provider = new DiagnosticsProvider_1.DiagnosticsProvider(cli, repoProvider);
    const collection = vscode.languages.lastCollection;
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
//# sourceMappingURL=diagnosticsCode.test.js.map