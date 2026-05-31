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
    tagDefinitions: [
      { instanceId: "tag-001", slug: "foundation", label: "Foundation" },
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

export const MALFORMED_NOT_JSON = "this is not json { at all";
export const EMPTY_STDOUT = "";
export const MISSING_OK_FIELD = JSON.stringify({
  command: "repo map",
  version: "0.1.0",
  payload: {},
});
