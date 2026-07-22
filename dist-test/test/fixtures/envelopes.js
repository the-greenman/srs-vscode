"use strict";
// Canned CLI envelope strings matching real srs output shapes.
// Used in unit tests to avoid spawning a real subprocess.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MISSING_OK_FIELD = exports.EMPTY_STDOUT = exports.MALFORMED_NOT_JSON = exports.ERR_NOTE_GET = exports.OK_REPO_VALIDATE_WITH_ERRORS = exports.OK_REPO_VALIDATE_CLEAN = exports.OK_TAG_LIST = exports.OK_NOTE_LIST = exports.OK_REPO_MAP = void 0;
exports.OK_REPO_MAP = JSON.stringify({
    command: "repo map",
    ok: true,
    version: "0.1.0",
    payload: {
        repoMap: {
            counts: { notes: 5, records: 10, totalInstances: 15 },
            repository: { repositoryId: "abc-123", title: "Test Repo" },
        },
    },
});
exports.OK_NOTE_LIST = JSON.stringify({
    command: "note list",
    ok: true,
    version: "0.1.0",
    payload: {
        notes: [
            { instanceId: "note-001", title: "First Note" },
            { instanceId: "note-002", title: "Second Note" },
        ],
    },
});
exports.OK_TAG_LIST = JSON.stringify({
    command: "tag list",
    ok: true,
    version: "0.1.0",
    payload: {
        terms: [
            {
                id: "b5db2773-cf71-454f-a4a6-ceada8fc8602",
                version: 1,
                namespace: "com.example.spec",
                key: "topic:foundation",
                label: "Foundation",
                roles: ["topic"],
            },
        ],
    },
});
exports.OK_REPO_VALIDATE_CLEAN = JSON.stringify({
    command: "repo validate",
    ok: true,
    version: "0.1.0",
    payload: {
        summary: { checked: 100, errors: 0, warnings: 0 },
        diagnostics: [],
    },
});
exports.OK_REPO_VALIDATE_WITH_ERRORS = JSON.stringify({
    command: "repo validate",
    ok: true,
    version: "0.1.0",
    payload: {
        summary: { checked: 50, errors: 2, warnings: 1 },
        diagnostics: [
            {
                severity: "error",
                message: "fieldValue type mismatch",
                instanceId: "rec-001",
            },
            {
                severity: "warning",
                message: "unknown field in extra",
                instanceId: "rec-002",
            },
        ],
    },
});
exports.ERR_NOTE_GET = JSON.stringify({
    command: "note get",
    ok: false,
    version: "0.1.0",
    diagnostics: ["Note with id 'bad-id' not found"],
});
exports.MALFORMED_NOT_JSON = "this is not json { at all";
exports.EMPTY_STDOUT = "";
exports.MISSING_OK_FIELD = JSON.stringify({
    command: "repo map",
    version: "0.1.0",
    payload: {},
});
//# sourceMappingURL=envelopes.js.map