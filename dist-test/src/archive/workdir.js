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
exports.archiveWorkdirName = archiveWorkdirName;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
// Deterministic, filesystem-safe directory name for the working copy of a `.srs`
// archive. Keyed by the archive's absolute path so the same archive always maps
// to the same working copy (stable across sessions), while two archives that
// share a basename never collide. No vscode dependency — importable in unit tests.
//
// Shape: "<sanitised-basename>-<sha1(absPath)[0..12]>", e.g. "governance-1a2b3c4d5e6f".
function archiveWorkdirName(archivePath) {
    const abs = path.resolve(archivePath);
    const base = path.basename(abs, path.extname(abs));
    const safe = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40) || "archive";
    const hash = crypto.createHash("sha1").update(abs).digest("hex").slice(0, 12);
    return `${safe}-${hash}`;
}
//# sourceMappingURL=workdir.js.map