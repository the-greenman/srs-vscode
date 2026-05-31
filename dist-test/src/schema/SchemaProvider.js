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
exports.SchemaProvider = void 0;
const vscode = __importStar(require("vscode"));
// Maps file glob patterns to their SRS JSON schema file (relative to extension root).
// The extension.ts will resolve these to absolute URIs and register them with vscode.
const SCHEMA_ASSOCIATIONS = [
    { glob: "**/manifest.json", schema: "schemas/2.0/manifest.json" },
    { glob: "**/records/*.json", schema: "schemas/2.0/record.json" },
    { glob: "**/records/*.srsj", schema: "schemas/2.0/record.json" },
    { glob: "**/notes/*.json", schema: "schemas/2.0/note.json" },
    { glob: "**/notes/*.srsj", schema: "schemas/2.0/note.json" },
    { glob: "**/typed-records/*.json", schema: "schemas/2.0/typed-record.json" },
    { glob: "**/package/fields/*.json", schema: "schemas/2.0/field.json" },
    { glob: "**/package/types/*.json", schema: "schemas/2.0/type.json" },
    { glob: "**/package/views/*.json", schema: "schemas/2.0/view.json" },
    { glob: "**/package/document-views/*.json", schema: "schemas/2.0/document-view.json" },
    { glob: "**/package/package.json", schema: "schemas/2.0/package-manifest.json" },
    { glob: "**/relations/relations.json", schema: "schemas/2.0/relations-collection.json" },
    { glob: "**/containers/*.json", schema: "schemas/2.0/container.json" },
    { glob: "**/*.meta.json", schema: "schemas/2.0/source-document-meta.json" },
];
class SchemaProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this._disposables = [];
        this._register();
    }
    _register() {
        const jsonConfig = vscode.workspace.getConfiguration("json");
        const existing = jsonConfig.get("schemas") ?? [];
        const toAdd = SCHEMA_ASSOCIATIONS.filter((assoc) => !existing.some((e) => e.fileMatch.includes(assoc.glob))).map((assoc) => ({
            fileMatch: [assoc.glob],
            url: vscode.Uri.joinPath(this.extensionUri, assoc.schema).toString(),
        }));
        if (toAdd.length === 0)
            return;
        jsonConfig.update("schemas", [...existing, ...toAdd], vscode.ConfigurationTarget.Workspace);
    }
    dispose() {
        this._disposables.forEach((d) => d.dispose());
    }
}
exports.SchemaProvider = SchemaProvider;
//# sourceMappingURL=SchemaProvider.js.map