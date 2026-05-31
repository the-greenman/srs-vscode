# Plan: VS Code SRS Extension

## Summary

A VS Code extension for browsing, creating, validating, and navigating SRS repositories. The extension delegates all repository semantics to the `srs` CLI via JSON envelopes — it never reads or writes repository files directly. This keeps the extension backend-agnostic: the same TypeScript code works against any storage backend the CLI supports.

## Design Principles

- **CLI-only:** The extension calls `srs` subprocesses and consumes JSON envelopes. No `fs.readFile`, no `manifest.json` parsing, no path construction for entity files.
- **Backend-agnostic:** All access goes through the CLI. File layout is an implementation detail the extension must not depend on.
- **Progressive enhancement:** Tree browsing and command-palette operations work first. Rich forms and custom editors arrive after core plumbing is stable.
- **Container-aware:** The extension maintains an active container per workspace. When set, `--container <id>` is passed to all list/create/delete commands.

## Architecture Decisions

| Decision | Rationale |
|---|---|
| CLI subprocess boundary | Keeps extension decoupled from storage backend; one integration path |
| `srs-entity://` URI scheme | Stable document identity so VS Code deduplicates tabs across repeated opens |
| `workspaceState` for attention | Container context survives session restart; verified against CLI on activation |
| No file watching | Extension does not observe the filesystem; refresh is explicit or post-mutation |
| Bundle JSON schemas | Editor affordances only; CLI `repo validate` is authoritative |
| Positional IDs in CLI | All `get`/`delete` subcommands take positional `<ID>` argument, not `--id` flag |

---

## Current State

### What is built and working (Phases 1–2)

**CLI bridge (`src/cli/`)**
- `CliClient` — spawns `srs` binary, builds argv, sends stdin JSON, parses envelopes, normalises errors
- `envelope.ts` — pure `parseEnvelope` / `buildArgv` (no vscode dep; unit-testable)
- `errors.ts` — `CliError` with `diagnostics[]` and `command` fields
- `types.ts` — `SrsEnvelope<T>` union + payload DTOs for all entity list/get commands

**Repository detection (`src/repository/`)**
- `RepositoryProvider` — probes workspace folders via `srs repo map`; tracks active repo; emits `onDidChangeActive`

**Tree view (`src/tree/`)**
- `SrsTreeDataProvider` — 12 entity kinds; `GroupNode` root items from repo map counts; `EntityNode` children lazy-loaded from list commands; passes `--container` when attention is set
- All list calls use positional IDs; `ENTITY_SPECS` table drives list/get args

**Entity documents (`src/provider/`)**
- `EntityDocumentProvider` — `TextDocumentContentProvider` for `srs-entity://<repoId>/<kind>/<entityId>`; VS Code deduplicates by URI so the same node re-focuses its existing tab; fetches content on demand via `srs <entity> get <id>`

**Container attention (`src/container/`)**
- `AttentionManager` — persists `{ containerId, title }` in `workspaceState`; verifies on restore via `srs container get <id>`; clears silently if stale; fires `onDidChange`
- `ContainerStatusBarItem` — reflects attention state; click triggers `SRS: Set Active Container`

**Commands**
- `repositoryCommands.ts`: Select Repository, Refresh Repository, Validate Repository, Open Repository Map, Open Entity
- `containerCommands.ts`: Set Active Container (QuickPick with clear option), Clear Active Container, Create Container
- `mutationCommands.ts`: Create Note, Create Tag, Create Record (type picker), Delete Entity (confirmation modal), `addToContainer`/`removeFromContainer` helpers

**Schemas (`schemas/2.0/`)**
- 17 JSON schema files copied from `srs-rust/crates/srs-schema/schemas/2.0/`
- `SchemaProvider` registers them with VS Code JSON language service via workspace settings

**Tests**
- 22 unit tests covering `parseEnvelope`, `buildArgv`, `GroupNode`, `EntityNode`
- Test runner uses `Module._resolveFilename` hook to stub `vscode` module — no extension host required

---

## Remaining Phases

### Phase 3: Validation Diagnostics

**Goal:** `srs repo validate` output appears in VS Code's Problems panel, not just the output channel.

#### Tasks

- [ ] Implement `DiagnosticsProvider`: call `srs repo validate`; parse `diagnostics[]` from envelope
- [ ] Map diagnostics to `vscode.DiagnosticCollection` entries. Associate with `instanceId` where present; fall back to a synthetic repo-level URI until CLI exposes file paths in diagnostics
- [ ] Trigger validation on save of any file in the active repository when `srs.validate.onSave` is enabled (file save event → CLI call; extension does not parse the saved file)
- [ ] Clear stale diagnostics when validation returns clean
- [ ] Wire `DiagnosticsProvider` into `extension.ts`; subscribe to `onDidSaveTextDocument`

#### Acceptance Criteria

- [ ] `srs repo validate` errors appear in the Problems panel
- [ ] Saving a file in the repository triggers validation when `srs.validate.onSave` is true
- [ ] Saving a fixed file clears stale diagnostics
- [ ] No repository file parsing in TypeScript — all data from CLI

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Update plan checkboxes
4. Commit

---

### Phase 4: Read-Only Previews

**Goal:** Entities open in a rendered webview panel, not raw JSON, for the most common entity kinds.

#### Tasks

- [ ] Note preview webview: render title, tags, and sections from `srs note get` payload
- [ ] Record preview webview: render field labels + values from `srs record get` + `srs type get`
- [ ] Container preview: show member list from `srs container members list`
- [ ] Render preview: call `srs render document-view` and display output in a webview
- [ ] Add preview command to tree item context menus alongside the existing JSON open

#### Acceptance Criteria

- [ ] All preview data comes from CLI `get` commands only
- [ ] Previews are read-only
- [ ] Raw JSON view remains accessible alongside the preview

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Update plan checkboxes
4. Commit

---

### Phase 5: Form-Based Editing

**Goal:** Common edits are ergonomic without requiring hand-written JSON.

#### Tasks

- [ ] Note form editor: title, tags, sections; save via `srs note update` stdin
- [ ] Tag definition form editor: slug, label; save via `srs tag update` stdin
- [ ] Generic record form generated from `srs type get` field definitions; save via `srs record update` stdin
- [ ] Relation form: endpoint pickers from entity list commands; type choices from `srs relation-type list`
- [ ] Detect concurrent change by re-fetching entity before save; surface conflict before overwriting

#### Acceptance Criteria

- [ ] Form save sends complete entity JSON to CLI via stdin — no direct file writes
- [ ] Invalid field values surface CLI diagnostics at field level
- [ ] Concurrent modification is detected and surfaced before overwriting

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Update plan checkboxes
4. Commit

---

### Phase 6: Extension and Protocol Workflows

**Goal:** Higher-level package workflows (extensions, protocols, views) are accessible from the UI.

#### Tasks

- [ ] Extension enable/disable: `srs repo extensions enable/disable`
- [ ] Protocol browser, validation, export/import via `srs protocol` commands
- [ ] View and document-view CRUD via `srs view` / `srs document-view` commands
- [ ] Render document-view from command palette

#### Acceptance Criteria

- [ ] `repo extensions` and `extension` commands are distinct in the UI
- [ ] Protocol validation uses CLI diagnostics
- [ ] Extension enable/disable triggers tree refresh

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Update plan checkboxes
4. Commit

---

## Final Acceptance

- [ ] `npm test` passes with no failures
- [ ] No `fs.readFile`, `fs.writeFile`, or path construction for repository entities in `src/`
- [ ] All entity data flows through `CliClient`
- [ ] Extension works against both `--store file` and `--store json` backends without code changes
- [ ] CLI binary path is configurable; missing binary produces a clear setup message
- [ ] Container attention persists across VS Code sessions and verifies on activation

## Settings

```json
{
  "srs.cli.path": "srs",
  "srs.repository.path": null,
  "srs.validate.onSave": true,
  "srs.trace.cli": false
}
```

Active container is stored in `vscode.ExtensionContext.workspaceState`, not settings.
