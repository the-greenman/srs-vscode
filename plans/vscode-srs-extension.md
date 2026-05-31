# Plan: VS Code SRS Extension

## Summary

Build a VS Code extension for viewing, editing, validating, and navigating SRS repositories. The extension delegates all repository semantics to the `srs` CLI via JSON envelopes — it never reads or writes repository files directly. This design keeps the extension backend-agnostic: the same TypeScript code works against any storage backend the CLI supports (file, JSON store, or future SQL/remote).

The extension should feel like a repository workbench:

- A tree view for repository contents, populated entirely from CLI list commands.
- Detail views for notes, tags, fields, types, records, relations, extensions, and protocols.
- Validation diagnostics surfaced in VS Code's Problems panel via `repo validate`.
- Commands for create, update, delete, tag, validate, and refresh.
- Container attention: an active container scopes all list/create/delete commands.

## Design Principles

- **CLI-only:** The extension calls `srs` subprocesses and consumes JSON envelopes. It never reads or writes repository files directly. No `fs.readFile`, no `manifest.json` parsing in TypeScript, no path construction for entity files.
- **Backend-agnostic:** Because all access goes through the CLI, the extension works against any backend the CLI supports. File layout is an implementation detail the extension must not depend on.
- **Progressive enhancement:** Command-palette operations and tree browsing work first. Rich forms and custom editors arrive after the core plumbing is stable.
- **Recoverable edits:** Mutating commands send complete JSON payloads to the CLI via stdin. The CLI owns ID minting, validation, and manifest updates.
- **Container-aware attention:** The extension maintains an active container context per workspace. When set, `--container <id>` is passed to all content commands — making the container the operational scope.

## Architecture Decisions

| ADR | Decision | Status |
|---|---|---|
| [ADR-001](../../srs-rust/docs/adr/001-library-first-architecture.md) | Library crates are primary; CLI is one consumer — extension is another | accepted |
| [ADR-010](../../srs-rust/docs/adr/010-service-boundary-contract.md) | All service functions have explicit input/output structs; CLI is thin | accepted |

No new ADRs needed — this plan implements the extension side of ADR-001 and ADR-010.

---

## Scope

- TypeScript VS Code extension that drives all SRS operations via the `srs` CLI binary
- Tree view of repository entities populated from CLI list commands
- `SRS: Validate Repository` surfacing CLI diagnostics in the Problems panel
- CRUD commands for notes, tags, records, relations, containers, extensions, protocols
- Container attention (active container scoping via `--container`)
- JSON schema registration for editor affordances on SRS files

**Out of scope:**

- Direct filesystem access, file watching, or path-based navigation in the extension
- Bundled native binary or WASM runtime
- Full spec `AttentionState` (ext:addressability, Context Queries, Revision tracking)
- Side-by-side multi-repo tree views (internals are multi-root-aware, UI shows one active repo)

---

## Prerequisites

All CLI prerequisites are already shipped:

- Global `--repo <path>` and `--container <id>` flags
- `--store <file|json>` backend override
- Stable JSON envelopes: `{ ok, command, version, payload }` / `{ ok: false, diagnostics }`
- `repo map`, `repo validate`, `repo create`
- `note list/get/create/update/delete` + `note tag add/remove`
- `tag list/get/create/update/delete`
- `container list/get/create/update/delete/validate` + `container members` + `container roots`
- `field list/get/create`
- `type list/get`
- `record list/get/create/update/delete`
- `relation list/get/create/delete`
- `extension list/get/create/update/delete`
- `protocol list/get/create/update/delete/validate/export/import`
- `view list/get/create/update/delete`
- `document-view list/get/create/update/delete`
- `render document-view`
- `package list/create/update`

Open: CLI should add `envelopeVersion: 1` to the envelope before the extension ships write commands to end users.

---

## Extension Surface

### Activity Bar

One `SRS` container with:

- **Repository** — tree grouped by entity kind, populated from CLI list commands. Active container name shown in tree title when set.
- **Validation** — latest `repo validate` output; click entries to navigate to the relevant entity.

Status bar: `$(layers) <container-name>` or `$(layers) No container` — clicking opens `SRS: Set Active Container`.

### Commands

**Repository:**
```
SRS: Select Repository          — pick from discovered SRS roots in workspace folders
SRS: Refresh Repository         — re-run repo map + list commands; rebuild tree
SRS: Validate Repository        — run repo validate; populate Problems panel
SRS: Open Repository Map        — show repo map JSON in output channel
```

**Entity CRUD:**
```
SRS: Create Note
SRS: Create Tag Definition
SRS: Create Record              — prompts for type (namespace/name)
SRS: Create Relation
SRS: Create Extension Definition
SRS: Update Current SRS Entity  — reads entity kind from tree selection or active editor context
SRS: Delete Current SRS Entity
SRS: Add Tag To Note
SRS: Remove Tag From Note
```

**Container attention:**
```
SRS: Set Active Container       — quick pick from srs container list; stored in workspaceState
SRS: Clear Active Container     — removes scoping; subsequent commands are unscoped
SRS: Create Container           — prompts for title, optionally sets as active
SRS: Show Container Members     — lists members of the active container in output channel
```

When active container is set, `--container <id>` is passed to list/create/delete commands. The CLI enforces:
- List: returns only container members
- Create: adds the new instance to `memberInstanceIds`
- Delete: refused if instance is not a container member — extension surfaces this as an error, does not refresh tree on refused delete

**CLI:**
```
SRS: Show CLI Output            — reveal the CLI output channel
```

### CLI Contract

Every command:

```bash
srs --repo <repo-path> --format json <command>
```

With active container for create/list/delete:

```bash
srs --repo <repo-path> --container <container-id> note list
srs --repo <repo-path> --container <container-id> note create
srs --repo <repo-path> --container <container-id> note delete --id <id>
```

Without container for get/update:

```bash
srs --repo <repo-path> note get --id <id>
srs --repo <repo-path> note update --id <id>
```

Extension rejects any response where stdout is not valid JSON, `ok` is missing, or expected `payload` fields are absent.

---

## Components

- **`CliClient`** — finds and executes the `srs` binary; builds argv; sends stdin JSON; parses envelopes; normalizes errors. The only place in the extension that spawns subprocesses.
- **`RepositoryProvider`** — detects SRS roots by running `srs repo map` in each workspace folder (presence of a valid envelope = valid SRS root). Tracks the active repository. Runs on activation and on `SRS: Refresh Repository`.
- **`AttentionManager`** — stores active container ID/title in `workspaceState`. Emits change events. On activation, verifies stored ID via `srs container get <id>`; clears if not found.
- **`ContainerStatusBarItem`** — reflects `AttentionManager` state; clicking triggers `SRS: Set Active Container`.
- **`TreeDataProvider`** — top-level nodes come from `repo map` counts; children come from entity list commands called lazily on expand. No filesystem traversal.
- **`DiagnosticsProvider`** — calls `srs repo validate`; maps `diagnostics[]` entries to `vscode.Diagnostic`; associates with instance IDs (file-path association deferred until CLI exposes file locations in diagnostics).
- **`EntityCommands`** — implements all create/update/delete commands; reads `AttentionManager` for `--container`; sends payloads via stdin.
- **`SchemaProvider`** — registers bundled SRS JSON schemas with VS Code JSON language service for editing affordances only; CLI remains authoritative for validation.

## Data Model

Keep TypeScript types shallow — only what the CLI actually returns:

```ts
type SrsEnvelope<T> =
  | { ok: true; command: string; version: string; payload: T }
  | { ok: false; command: string; version: string; diagnostics: SrsDiagnostic[] };

type SrsDiagnostic = {
  severity: "error" | "warning" | "info";
  message: string;
  instanceId?: string;
};

type SrsTreeEntity = {
  id: string;
  label: string;
  kind: "note" | "tag" | "field" | "type" | "record" | "relation"
      | "extension" | "protocol" | "container" | "view" | "document-view";
  typeName?: string;
  tags?: string[];
  // No path field — entities are addressed by ID, not filesystem path
};

type SrsContainerSummary = {
  containerId: string;
  title: string;
  containerType?: string;
  // No path field — container location is an adapter detail
};

type AttentionState = {
  containerId: string;
  containerTitle: string;
};
```

`AttentionState` is the extension's own concept — `containerId` so `--container` can be passed. It is not the spec's `ext:addressability` `AttentionState`.

## Settings

```json
{
  "srs.cli.path": "srs",
  "srs.repository.path": null,
  "srs.validate.onSave": true,
  "srs.trace.cli": false
}
```

`srs.refresh.onFileChange` is removed — the extension does not watch repository files. Refresh is explicit (`SRS: Refresh Repository`) or triggered after successful mutations.

Active container is stored in `vscode.ExtensionContext.workspaceState`, not settings.

---

## Phases

### Phase 1: CLI Bridge and Repository Browser

**Goal:** Users can point VS Code at an SRS repository, browse all entity kinds in a tree, and run validation — all via CLI calls, no filesystem reads.

#### Tasks

- [ ] Scaffold VS Code extension: `package.json`, `tsconfig.json`, `src/extension.ts`, esbuild or `tsc` build.
- [ ] Add settings: `srs.cli.path`, `srs.repository.path`, `srs.trace.cli`.
- [ ] Implement `CliClient`: find binary, build argv, spawn subprocess, parse envelope, surface errors.
- [ ] Implement `RepositoryProvider`: detect SRS root by calling `srs repo map`; store active repo path; expose `repoPath` to other components.
- [ ] Implement `SRS: Select Repository`: scan workspace folders via `srs repo map`; present quick pick; update `RepositoryProvider`.
- [ ] Implement `SRS: Refresh Repository`: re-invoke list commands; fire tree refresh event.
- [ ] Implement `TreeDataProvider`: top-level nodes from `repo map` counts (Notes, Tags, Records, Relations, …); children from lazy `<entity> list` calls on expand; no filesystem access.
- [ ] Implement `SRS: Validate Repository`: call `srs repo validate`; write output to a dedicated output channel.
- [ ] Implement `SRS: Open Repository Map`: call `srs repo map --pretty`; show in output channel.
- [ ] On tree item click, call `srs <entity> get --id <id>` and show JSON in a read-only editor.

#### Acceptance Criteria

- [ ] Extension activates in a workspace where `srs repo map` returns `ok: true`.
- [ ] Missing or misconfigured CLI binary produces a clear, actionable setup notification — no crash.
- [ ] Tree is populated entirely from CLI list commands; no `fs.readFile` or path resolution in `TreeDataProvider`.
- [ ] `repo map` counts match tree group sizes.
- [ ] `repo validate` output appears in the output channel.
- [ ] Clicking a tree item opens the entity JSON from `<entity> get`, not from the filesystem.
- [ ] Failed CLI calls show error notifications without crashing the extension host.

#### Testing

Unit tests:
- `CliClient` parses `{ ok: true, payload }` and `{ ok: false, diagnostics }` envelopes correctly.
- `CliClient` rejects non-JSON stdout.
- `CliClient` builds argv with `--repo`, `--format json`, and optional `--container` correctly.
- `TreeDataProvider` maps `repo map` counts to correct top-level nodes.

Integration tests (stubbed CLI):
- `SRS: Select Repository` quick pick shows repos where `srs repo map` succeeds.
- Tree expands Notes node by calling `srs note list`.
- `SRS: Validate Repository` writes `repo validate` output to output channel.

#### Milestone gate

1. Verify all acceptance criteria above are met.
2. Confirm all listed unit and integration tests exist and pass.
3. Run: `npm test` (or equivalent test runner).
4. Update plan: mark completed task and acceptance criteria checkboxes `[x]`.
5. Commit.

---

### Phase 2: Mutation Commands and Container Attention

**Goal:** Users can create, update, and delete notes, tags, records, and containers through the extension; an active container scopes all content commands.

#### Tasks

- [ ] Implement `SRS: Create Note`: prompt for title; send `{ title, sections: [] }` to `srs note create` stdin.
- [ ] Implement `SRS: Create Tag Definition`: prompt for slug and label; send to `srs tag create` stdin.
- [ ] Implement `SRS: Create Record`: prompt for type (`namespace/name`); send field values to `srs record create --type <t>` stdin.
- [ ] Implement `SRS: Delete Current SRS Entity`: confirm prompt; call `srs <entity> delete --id <id>`.
- [ ] Refresh tree after each successful mutation (re-call relevant list command).
- [ ] Implement `AttentionManager`: `getActiveContainerId()`, `setActiveContainer(id, title)`, `clearActiveContainer()`; persisted in `workspaceState`; verify on activation via `srs container get <id>`.
- [ ] Implement `ContainerStatusBarItem`: reflects `AttentionManager` state; click triggers `SRS: Set Active Container`.
- [ ] Implement `SRS: Set Active Container`: quick pick from `srs container list`; updates `AttentionManager`.
- [ ] Implement `SRS: Clear Active Container`.
- [ ] Implement `SRS: Create Container`: prompt for title; call `srs container create` stdin; offer to set as active.
- [ ] Wire `--container` into all create/list/delete commands when `AttentionManager` has an active container.
- [ ] Add Containers group to tree from `srs container list`.
- [ ] Register bundled SRS JSON schemas with VS Code JSON language service (`SchemaProvider`).

#### Acceptance Criteria

- [ ] `SRS: Create Note` creates a note via CLI stdin; note appears in tree after refresh.
- [ ] `SRS: Delete Current SRS Entity` calls CLI delete; entity is absent from tree after refresh.
- [ ] No mutation command writes to repository files directly.
- [ ] Status bar shows active container name or "No container".
- [ ] With an active container, `note list` is called with `--container <id>`; tree shows only container members.
- [ ] `SRS: Create Note` with active container adds note to container membership (verified by `srs container members list`).
- [ ] Active container persists across VS Code sessions for the same workspace.
- [ ] Stale container ID is detected on activation and cleared.
- [ ] Schema completion works for known `$schema` values in SRS JSON files.

#### Milestone gate

1. Verify all acceptance criteria.
2. Confirm mutation integration tests pass with a real `srs` binary against a temp repository.
3. Run: `npm test`.
4. Update plan checkboxes.
5. Commit.

---

### Phase 3: Validation Diagnostics

**Goal:** `srs repo validate` output is mapped to VS Code Problems panel entries, not just an output channel.

#### Tasks

- [ ] Implement `DiagnosticsProvider`: call `srs repo validate`; parse `diagnostics[]` from envelope.
- [ ] Map diagnostics with `instanceId` to Problems entries (file association deferred until CLI exposes file paths in diagnostics; fall back to a synthetic "SRS Repository" document URI).
- [ ] Run validation on save of any file in the active repository when `srs.validate.onSave` is enabled (trigger is file save event, not file watch — extension calls CLI, does not parse the saved file itself).
- [ ] Clear stale diagnostics when validation returns clean.
- [ ] Show diagnostic count in status bar or tree toolbar.

#### Acceptance Criteria

- [ ] `srs repo validate` errors appear in the Problems panel.
- [ ] Saving a file in the repository triggers validation when `srs.validate.onSave` is true.
- [ ] Saving a fixed file clears stale diagnostics.
- [ ] Diagnostics do not require parsing repository files in TypeScript.

#### Milestone gate

1. Verify all acceptance criteria.
2. Run: `npm test`.
3. Update plan checkboxes.
4. Commit.

---

### Phase 4: Read-Only Previews

**Goal:** Users can inspect SRS entities in rendered form without reading raw JSON.

#### Tasks

- [ ] Note preview webview: render sections and tags from `srs note get` payload.
- [ ] Record preview webview: render field labels and values from `srs record get` payload + `srs type get` for field names.
- [ ] Tag definition preview.
- [ ] Container preview: show member list from `srs container members list`.
- [ ] Render preview: call `srs render document-view` and display output in a webview.

#### Acceptance Criteria

- [ ] All preview data comes from CLI `get` commands, not file reads.
- [ ] Previews are read-only — no writes.
- [ ] Preview commands available from tree item context menus.

#### Milestone gate

1. Verify all acceptance criteria.
2. Run: `npm test`.
3. Update plan checkboxes.
4. Commit.

---

### Phase 5: Form-Based Editing

**Goal:** Common SRS edits are ergonomic without losing CLI-backed correctness.

#### Tasks

- [ ] Note form editor: title, tags, sections; save via `srs note update` stdin.
- [ ] Tag definition form editor; save via `srs tag update` stdin.
- [ ] Generic record form generated from `srs type get` field definitions; save via `srs record update` stdin.
- [ ] Relation form: endpoint pickers populated from entity list commands; relation type choices from `srs relation-type list`.
- [ ] Show changed fields before overwriting; detect concurrent changes by re-fetching before save.

#### Acceptance Criteria

- [ ] Form save sends complete entity JSON to CLI via stdin — no direct file writes.
- [ ] Invalid field values show field-level errors from CLI diagnostics.
- [ ] Concurrent change (entity modified between open and save) is detected and surfaced before overwriting.

#### Milestone gate

1. Verify all acceptance criteria.
2. Run: `npm test`.
3. Update plan checkboxes.
4. Commit.

---

### Phase 6: Extension and Protocol Workflows

**Goal:** Higher-level package workflows (extensions, protocols, views) are accessible from the extension.

#### Tasks

- [ ] Extension enable/disable: `srs repo extensions enable/disable`.
- [ ] Extension definition CRUD via `srs extension` commands.
- [ ] Protocol browser, validation, export/import via `srs protocol` commands.
- [ ] View and document-view CRUD via `srs view` / `srs document-view` commands.
- [ ] Render document-view command from the command palette.

#### Acceptance Criteria

- [ ] `repo extensions` and `extension` commands are distinct in the UI.
- [ ] Protocol validation uses CLI diagnostics.
- [ ] Extension enable/disable triggers tree refresh.

#### Milestone gate

1. Verify all acceptance criteria.
2. Run: `npm test`.
3. Update plan checkboxes.
4. Commit.

---

## Final Acceptance

- [ ] `npm test` passes with no failures.
- [ ] No `fs.readFile`, `fs.writeFile`, or path construction for repository entities anywhere in `src/`.
- [ ] All entity data flows through `CliClient`.
- [ ] Extension works against both `--store file` and `--store json` backends without code changes.
- [ ] CLI binary path is configurable; missing binary produces a clear setup message.
- [ ] Container attention persists across VS Code sessions and verifies on activation.

## Coordination Rules

- Agents keep to their write scopes unless Lead Integrator explicitly expands them.
- Agents must not revert edits made by others.
- Workers return changed file paths and a short behavior summary when done.
- Lead Integrator owns final API naming and dependency boundaries.
- At the end of each phase: verify all acceptance criteria, confirm planned tests exist and pass, update the plan checkboxes, then commit.

## Decision Log

| Question | Decision |
|---|---|
| Extension location | Separate `srs-vscode/` directory |
| CLI installation | User installs `srs` binary; `srs.cli.path` setting points to it |
| Repository entity access | All entity data via CLI `get`/`list` commands — no filesystem reads |
| File watching | Not used — refresh is explicit or triggered after mutations |
| Rich editor writes | Complete JSON payload sent to CLI via stdin; CLI owns validation and manifest updates |
| Envelope compatibility | Accept `0.1.x` during development; add `envelopeVersion: 1` before shipping write commands |
| Multi-root workspaces | Multi-root-aware internals (detect roots via `srs repo map`); single active repo UI first |
| Schema source | Bundle pinned schemas for editor affordances; CLI `repo validate` is authoritative |
| Container attention storage | `workspaceState` (not settings); verified on activation; cleared if stale |
| `SrsTreeEntity.path` | Removed — entities addressed by ID only; path is an adapter detail |
| `SrsContainerSummary.path` | Removed — container location is adapter-private |
| `srs.refresh.onFileChange` | Removed — extension does not watch files |
| Container delete guard | CLI refuses delete if not a container member; extension surfaces as hard error, no tree refresh |
| `AttentionState` scope | Minimal: just `containerId` for `--container` flag; full spec `ext:addressability` deferred |
