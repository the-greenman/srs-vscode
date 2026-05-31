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
exports.EntityDocumentProvider = exports.ENTITY_SCHEME = void 0;
exports.entityUri = entityUri;
exports.parseEntityUri = parseEntityUri;
const vscode = __importStar(require("vscode"));
const CliClient_1 = require("../cli/CliClient");
exports.ENTITY_SCHEME = "srs-entity";
/**
 * URI format: srs-entity://<repositoryId>/<kind>/<entityId>
 *
 * The repositoryId in the authority anchors the document to a specific repo so
 * that if the active repo changes, previously-opened tabs remain valid (they
 * just re-fetch from the same repo path they were opened with).
 */
function entityUri(repositoryId, kind, entityId) {
    return vscode.Uri.from({
        scheme: exports.ENTITY_SCHEME,
        authority: repositoryId,
        path: `/${kind}/${entityId}`,
    });
}
function parseEntityUri(uri) {
    const parts = uri.path.replace(/^\//, "").split("/");
    return {
        repositoryId: uri.authority,
        kind: parts[0] ?? "",
        entityId: parts[1] ?? "",
    };
}
class EntityDocumentProvider {
    constructor(cli, repoProvider) {
        this.cli = cli;
        this.repoProvider = repoProvider;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeEmitter = this._onDidChange;
        this.onDidChange = this._onDidChange.event;
    }
    async provideTextDocumentContent(uri) {
        const { kind, entityId } = parseEntityUri(uri);
        const repo = this.repoProvider.active;
        if (!repo) {
            return JSON.stringify({ error: "No active SRS repository" }, null, 2);
        }
        const getArgs = getArgsFor(kind, entityId);
        if (!getArgs) {
            return JSON.stringify({ error: `Unknown entity kind: ${kind}` }, null, 2);
        }
        try {
            const payload = await this.cli.runOk(repo.rootPath, getArgs, {
                pretty: true,
            });
            return JSON.stringify(payload, null, 2);
        }
        catch (err) {
            const msg = err instanceof CliClient_1.CliError ? err.message : String(err);
            return JSON.stringify({ error: msg }, null, 2);
        }
    }
    // Call this to force a refresh of an already-open entity document.
    refresh(uri) {
        this._onDidChange.fire(uri);
    }
    dispose() {
        this._onDidChange.dispose();
    }
}
exports.EntityDocumentProvider = EntityDocumentProvider;
function getArgsFor(kind, entityId) {
    switch (kind) {
        case "note": return ["note", "get", entityId];
        case "tag": return ["tag", "get", entityId];
        case "record": return ["record", "get", entityId];
        case "relation": return ["relation", "get", entityId];
        case "container": return ["container", "get", entityId];
        case "field": return ["field", "get", entityId];
        case "type": return ["type", "get", entityId];
        case "extension": return ["extension", "get", entityId];
        case "protocol": return ["protocol", "get", entityId];
        case "view": return ["view", "get", entityId];
        case "document-view": return ["document-view", "get", entityId];
        case "relation-type": return ["relation-type", "get", entityId];
        default: return undefined;
    }
}
//# sourceMappingURL=EntityDocumentProvider.js.map