# Plan: Webview Form Editors for SRS Entities

## Summary

The current `srs.editEntity` command uses sequential `showInputBox` prompts — one field at a time, no ability to see all fields simultaneously, no multi-line text editing, and no inline validation feedback. This plan replaces those flows with webview panel editors that show all fields at once, support multi-line content (textareas for note sections and record fields), display CLI validation errors inline without closing the form, and save back via the existing CLI stdin contract. The external interface (`srs.editEntity` command, CLI calls, tree refresh) is unchanged.

## Agent Assignments

| Role | Agent |
|---|---|
| Lead Integrator | — |
| Implementation | — |
| Verification | — |

## Architecture Decisions

No new ADRs needed — this plan extends existing patterns (`PreviewPanel`, `CliClient` stdin) without changing architectural boundaries.

---

## Scope

- Webview form editors for **Note**, **Tag**, and **Record** entities
- Each editor: loads current entity, renders a form with all fields visible, accepts edits, saves via `srs <entity> update <id>` stdin
- Concurrent-change detection: re-fetch before save, warn on conflict
- CLI validation errors surfaced inline in the form (no close on error)
- Same `srs.editEntity` command entry point — implementation swap only

**Out of scope:**
- Relation create form (QuickPick is adequate — endpoint selection is a picker, not free-text)
- Container edit form (title/type are single-line; InputBox remains)
- `vscode.CustomEditorProvider` — too heavy, not needed
- Rich text or WYSIWYG markdown preview inside the form

---

## Prerequisites

All existing — no CLI changes needed:
- `srs note get <id>` / `srs note update <id>` (stdin)
- `srs tag get <id>` / `srs tag update <id>` (stdin)
- `srs record get <id>` / `srs type get <id>` / `srs record update <id>` (stdin)

---

## Key Files

| File | Change |
|---|---|
| `src/webview/EntityEditorPanel.ts` | **New** — webview panel host; message bridge; save/error logic |
| `src/webview/forms.ts` | **New** — HTML form builders: `buildNoteForm`, `buildTagForm`, `buildRecordForm`, `formWrapHtml` |
| `src/commands/editCommands.ts` | **Modify** — replace three InputBox functions with webview calls |
| `src/preview/PreviewPanel.ts` | Reference only — follow same dedup pattern |
| `src/cli/CliClient.ts` | No changes |
| `src/cli/types.ts` | No changes |
| `src/extension.ts` | No changes — `registerEditCommands` already wired |

---

## Phases

### Phase 1: EntityEditorPanel and form builders

**Goal:** Reusable webview panel infrastructure and HTML form generators are in place; no command changes yet.

**Agent:** Implementation

#### Tasks

- [ ] Create `src/webview/EntityEditorPanel.ts`
  - Class `EntityEditorPanel implements vscode.Disposable`
  - Static registry: `Map<string, EntityEditorPanel>` — same dedup as `PreviewPanel`
  - Static `show(context, id, title, html, onSave: (data: unknown) => Promise<void>): EntityEditorPanel`
    - If panel with `id` exists: `reveal()`, update html, return existing
    - If new: create `vscode.WebviewPanel` with `{ enableScripts: true, localResourceRoots: [] }`
  - `webview.onDidReceiveMessage` handles:
    - `{ type: "save", data: unknown }` → call `onSave(data)`; on success close panel; on `CliError` post `{ type: "error", messages: err.diagnostics }` back to webview
    - `{ type: "cancel" }` → dispose panel
  - On panel dispose: remove from registry

- [ ] Create `src/webview/forms.ts`
  - `formWrapHtml(title: string, body: string): string`
    - DOCTYPE + `<meta charset>` + CSP: `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'`
    - VS Code CSS variables (same palette as `PreviewPanel`)
    - Shared form CSS: layout, label/input styling, error banner, button row
    - Shared inline JS: `window.addEventListener("message", ...)` handler for `{ type: "error" }` — shows `#error-banner` with message text
    - `acquireVsCodeApi()` call; form `onsubmit` posts `{ type: "save", data: collectFormData() }`; cancel button posts `{ type: "cancel" }`
  - `buildNoteForm(note: NotePayload["note"]): string`
    - Hidden inputs: `instanceId`, `createdAt`
    - `<input name="title" required>` pre-filled
    - `<input name="tags">` comma-separated, pre-filled
    - For each section: `<label>` (section.label ?? section.name) + `<textarea name="section_content_N" rows="6">` pre-filled; hidden `<input name="section_name_N">` and `<input name="section_label_N">`
    - `collectFormData()` returns: `{ instanceId, title, tags: string[], sections: [{name, label?, content}], createdAt }`
  - `buildTagForm(tag: TagPayload["tagDefinition"]): string`
    - Hidden: `instanceId`, `createdAt`
    - `<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*">` pre-filled
    - `<input name="label">` optional, pre-filled
    - `collectFormData()` returns: `{ instanceId, slug, label?, createdAt }`
  - `buildRecordForm(record: RecordPayload["record"], fields: TypePayload["type"]["fields"]): string`
    - Hidden: `instanceId`, `typeId`, `typeName`, `typeNamespace`, `typeVersion`, `createdAt`
    - For each field sorted by `order`: label (`displayLabel ?? fieldId[:8]` + "(required)") + `<textarea name="field_value_N" rows="3">` pre-filled from `fieldValues`; hidden `<input name="field_id_N">` with fieldId UUID
    - `collectFormData()` returns: `{ instanceId, typeId, ..., fieldValues: [{fieldId, value}] }`

#### Acceptance Criteria

- [ ] `EntityEditorPanel.show()` called twice with same id focuses existing panel (no duplicate)
- [ ] Form renders with VS Code theme CSS variables (foreground, background, border)
- [ ] Save button triggers `{ type: "save", data }` postMessage
- [ ] Cancel button triggers `{ type: "cancel" }` and panel closes
- [ ] `onSave` throwing `CliError` causes `#error-banner` to appear with diagnostic text; form stays open

#### Testing

```bash
node esbuild.js   # must produce no errors
npm test          # 22 tests must pass
```

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Commit

---

### Phase 2: Note and Tag webview editors

**Goal:** `srs.editEntity` on a note or tag opens a webview form instead of InputBox prompts.

**Agent:** Implementation

#### Tasks

- [ ] In `src/commands/editCommands.ts`, replace `editNote()`:
  - Signature: `editNote(context, cli, repoPath, id, treeProvider)`
  - Fetch note: `cli.runOk<NotePayload>(repoPath, ["note", "get", id])`
  - Build HTML: `formWrapHtml(note.title, buildNoteForm(note))`
  - `onSave` callback:
    1. Re-fetch note; if `refetch.note.title !== note.title` post `{ type: "confirm", message: "..." }` — for simplicity, use a `vscode.window.showWarningMessage` modal (the webview stays open); if user denies return without saving
    2. Reconstruct note object from `data`: `{ instanceId, title, tags, sections, createdAt }`
    3. `cli.runOk(repoPath, ["note", "update", id], { stdin: JSON.stringify(updated) })`
    4. On success: `treeProvider.refresh()`, panel closes (resolved promise signals success to `EntityEditorPanel`)
    5. On `CliError`: throw — `EntityEditorPanel` catches and posts error back to webview
  - Call `EntityEditorPanel.show(context, "note:" + id, note.title, html, onSave)`

- [ ] In `src/commands/editCommands.ts`, replace `editTag()` — same pattern
  - Concurrent guard: compare `refetch.tagDefinition.slug !== tag.slug`

- [ ] Thread `context: vscode.ExtensionContext` into `editNote` and `editTag` (already available in `cmdEditEntity` — pass it down)

- [ ] Update `cmdEditEntity` to pass `context` to the edit functions

#### Acceptance Criteria

- [ ] Right-click note → Edit Entity: webview opens pre-filled with current title, tags, and section textareas
- [ ] Editing title + saving: note updated in CLI; tree refreshes; panel closes
- [ ] CLI error from update: error banner appears in form; form stays open
- [ ] Cancel: panel closes, no CLI call made
- [ ] Re-opening same note: existing panel focused, not a new one

#### Testing

```bash
node esbuild.js
npm test
```

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Commit

---

### Phase 3: Record webview editor

**Goal:** `srs.editEntity` on a record opens a field-by-field webview form driven by the type definition.

**Agent:** Implementation

#### Tasks

- [ ] In `src/commands/editCommands.ts`, replace `editRecord()`:
  - Fetch record: `cli.runOk<RecordPayload>(repoPath, ["record", "get", id])`
  - Fetch type: `cli.runOk<TypePayload>(repoPath, ["type", "get", record.typeId])`
  - Sort fields by `order`
  - Title: `${record.typeNamespace}/${record.typeName} v${record.typeVersion}`
  - Build HTML: `formWrapHtml(title, buildRecordForm(record, sortedFields))`
  - `onSave` callback:
    1. Re-fetch record; if `refetch.record.fieldValues.length !== record.fieldValues.length` → warn modal
    2. Reconstruct `fieldValues` from `data.fieldValues` (array of `{fieldId, value}`)
    3. `cli.runOk(repoPath, ["record", "update", id], { stdin: JSON.stringify(updated) })`
    4. On success: `treeProvider.refresh()`, panel closes
    5. On `CliError`: throw — panel posts error to form
  - Call `EntityEditorPanel.show(context, "record:" + id, title, html, onSave)`

#### Acceptance Criteria

- [ ] Right-click record → Edit Entity: webview shows all fields pre-filled with current values, using displayLabels
- [ ] Required fields indicated; save blocked when required field is empty (HTML5 validation)
- [ ] Saving updates record via CLI; tree refreshes; panel closes
- [ ] CLI error (e.g. invalid value) shown inline in form without closing

#### Testing

```bash
node esbuild.js
npm test
```

#### Milestone gate

1. Verify acceptance criteria
2. `npm test` passes
3. Update all plan checkboxes
4. Commit

---

## Final Acceptance

- [ ] `npm test` passes (22 tests minimum — no regressions)
- [ ] `node esbuild.js` produces no errors
- [ ] No `fs.readFile` or direct file writes in new code
- [ ] All saves go through `CliClient.runOk()` with stdin JSON
- [ ] Re-opening the same entity form focuses the existing panel — no duplicate tabs
- [ ] CLI validation errors are shown inline in the form without closing it
- [ ] Cancelling never makes a CLI call

## Coordination Rules

- Keep to write scopes: `src/webview/` (new files) and `src/commands/editCommands.ts` (modifications only)
- Do not modify `PreviewPanel.ts`, `CliClient.ts`, `extension.ts`, or `package.json`
- Return changed file paths and a short behaviour summary when done
- At the end of each phase: verify acceptance criteria, run `npm test`, update checkboxes, commit

## Assumptions

- VS Code webview `postMessage` API is available — `acquireVsCodeApi()` in the webview JS
- `enableScripts: true` is safe here because all JS is inline and authored by us; no external content loaded
- HTML5 form validation (`required`, `pattern`) is sufficient for client-side feedback; CLI is authoritative for semantic validation
