// Canned CLI envelope strings matching real srs output shapes.
// Used in unit tests to avoid spawning a real subprocess.

export const OK_REPO_MAP = JSON.stringify({
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

export const OK_NOTE_LIST = JSON.stringify({
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

export const OK_TAG_LIST = JSON.stringify({
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

export const OK_REPO_VALIDATE_CLEAN = JSON.stringify({
  command: "repo validate",
  ok: true,
  version: "0.1.0",
  payload: {
    summary: { checked: 100, errors: 0, warnings: 0 },
    diagnostics: [],
  },
});

export const OK_REPO_VALIDATE_WITH_ERRORS = JSON.stringify({
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

export const ERR_NOTE_GET = JSON.stringify({
  command: "note get",
  ok: false,
  version: "0.1.0",
  diagnostics: ["Note with id 'bad-id' not found"],
});

// Matches real srs-rust output post-ADR-053: the Display text drops the old
// "CannotDeleteInUse"/"used by" wording entirely, and the structured code is
// carried in errors[] (srs-rust#1338, srs-vscode#131).
export const ERR_DELETE_IN_USE = JSON.stringify({
  command: "type delete",
  ok: false,
  version: "0.1.0",
  diagnostics: [
    "cannot delete type 'com.example/widget': still referenced by [rec-001, rec-002]",
  ],
  errors: [
    {
      code: "cannot-delete-in-use",
      message:
        "cannot delete type 'com.example/widget': still referenced by [rec-001, rec-002]",
      details: {
        entityType: "type",
        id: "com.example/widget",
        usedBy: ["rec-001", "rec-002"],
      },
    },
  ],
});

export const MALFORMED_NOT_JSON = "this is not json { at all";
export const EMPTY_STDOUT = "";
export const MISSING_OK_FIELD = JSON.stringify({
  command: "repo map",
  version: "0.1.0",
  payload: {},
});
