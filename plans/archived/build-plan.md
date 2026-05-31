# SRS VS Code Plugin Build Plan

**Status:** Planned  
**Goal:** Build a power-authoring VS Code extension for SRS, using a Rust-backed CLI as the only semantic engine.  
**Scope note:** This plan covers reusable SRS tooling only. It does not include Decision Logger implementation work.

---

## Design decisions

- SRS implementation is split into three products: `Rust core/library`, `CLI`, and `VS Code extension`.
- The VS Code extension communicates with SRS through CLI subprocess calls in v1.
- The extension is for power authoring, not just passive viewing.
- The extension prioritizes `Explorer + Forms` over a language-server-only approach.
- JSON files remain the source of truth; no editor-private persistence layer is introduced.
- The first concrete milestone is CLI inspection, validation, and indexing, not renderer-first or extension-first work.

---

## Build sequence

### 1. Define the Rust workspace split

Create the implementation boundary for SRS as an independent Rust workspace with clear crate responsibilities.

Target structure:

```text
srs/
  crates/
    srs-core/
    srs-repository/
    srs-cli/
    srs-projection/      # future
    srs-bindings/        # future
```

Required responsibilities:

- `srs-core`
  - canonical Rust types for SRS entities
  - shared validation primitives
  - ID/reference resolution helpers
  - compiled repository model types
- `srs-repository`
  - repository root detection
  - file loading and parsing
  - package resolution
  - manifest/index traversal
  - relations and source-document loading
- `srs-cli`
  - stable human and machine-facing command surface
  - JSON output contract
  - exit code handling
- `srs-projection`
  - reserved for later SQL/search/graph/database projections
- `srs-bindings`
  - reserved for later Python/Node/WASM bindings

Success criteria:

- The crate split is documented before implementation begins.
- Each crate has a single responsibility boundary.
- No VS Code logic leaks into Rust core crates.

### 2. Define the machine-facing CLI contract

The CLI is the only semantic interface the extension talks to in v1. Define the commands and JSON output shape before implementation.

Required commands:

```text
srs repo inspect <path> --json
srs repo validate <path> --json
srs repo index <path> --json
srs type inspect --repo <path> --type <namespace/name> --json
srs record create --repo <path> --type <namespace/name> --json
srs relation create --repo <path> --json
srs render document-view --repo <path> --view <id> --format <format> --json
```

Command intent:

- `repo inspect`
  - detect `.srs`
  - locate `manifest.json`
  - summarize repository metadata and conformance
- `repo validate`
  - return all semantic and structural diagnostics
- `repo index`
  - return a resolved repository summary for explorer population
- `type inspect`
  - return resolved field ordering, labels, lifecycle, and extension metadata
- `record create`
  - return a scaffold plan or scaffold payload for a new record of a given type
- `relation create`
  - return a scaffold payload for a relation
- `render document-view`
  - return rendered output or an output file contract for a document projection

CLI JSON contract defaults:

- top-level `ok: boolean`
- top-level `command: string`
- top-level `version: string`
- top-level `diagnostics: []`
- top-level command-specific payload such as `summary`, `repository`, `type`, `record`, `render`

Exit code rules:

- `0` means command completed successfully, even if diagnostics are present
- non-zero means command invocation or runtime failure
- semantic errors belong in JSON diagnostics, not only stderr text

Success criteria:

- Every command has a stable JSON contract written down before implementation.
- The extension does not need to parse human-readable CLI output.
- The command set is sufficient to build the first useful extension without direct bindings.

### 3. Define the compiled repository model

Use an internal compiled model, but keep it private to the Rust implementation. It is not a second public format.

Compilation layers:

```text
repository files
  -> raw structs
  -> resolved model
  -> compiled repository model
```

Layer meanings:

- raw
  - direct deserialization of manifest, package files, records, typed records, notes, relations, source docs
- resolved
  - IDs and references linked to their targets
  - package/type/field references checked for existence
  - effective type structures computed
- compiled
  - optimized indexes for validation, navigation, rendering, and explorer queries

The compiled repository model should expose:

- manifest summary
- resolved package summary
- instance map by `instanceId`
- grouped instance indexes by tier and type
- relations by `relationId`
- inbound/outbound relation indexes by instance
- source document map
- canonical file path map
- diagnostics and validation caches

The CLI should expose results derived from the compiled model, not the model itself as a public serialized standard.

Success criteria:

- The implementer knows what internal representation is needed.
- Python/TypeScript consumers depend only on CLI behavior, not internal structs.

### 4. Implement repository detection and indexing plan

Build repository loading around the SRS repository format.

Detection rules:

- a conformant repository root contains `.srs`
- a conformant repository root contains `manifest.json`
- repository loading starts from the root marker, not arbitrary file guessing

Repository indexing work:

- load `manifest.json`
- resolve `packageRef`
- load local package when `mode: "local"`
- traverse `instanceIndex`
- load relations from `relationsPath`
- load source documents from `sourceDocumentsPath` or sidecar/index metadata
- normalize canonical paths for every loaded artifact

Explorer-oriented index output must include:

- repository title
- repository path
- conformance string
- package summary
- counts by tier
- counts by type
- records grouped for display
- relation counts
- source document counts

Success criteria:

- The gallery example repository can be detected from root.
- The CLI can summarize and traverse the gallery example deterministically.
- All explorer data can be populated from `repo index --json`.

### 5. Implement semantic validation plan

Validation must combine schema checks with repository-wide semantic checks.

Validation layers:

- JSON/schema validation
  - manifest
  - package
  - field definitions
  - type definitions
  - note / typed-record / record
  - relations collection
  - source-document sidecars
- repository semantic validation
  - `.srs` and `manifest.json` presence
  - manifest index consistency
  - package completeness
  - `typeId`/`typeVersion` resolution
  - `fieldId` resolution
  - relation endpoint resolution
  - lifecycle state validity
  - local package invariants
  - extension-specific invariants when declared

CLI diagnostic shape:

```json
{
  "path": "records/decisions/decision-mounting-system.json",
  "line": 12,
  "column": 5,
  "severity": "error",
  "code": "record.unknown_field_id",
  "message": "fieldId does not resolve in the bound Type",
  "related": [
    {
      "path": "package/types/governance-decision.json",
      "line": 1,
      "column": 1,
      "message": "Bound Type definition"
    }
  ]
}
```

Diagnostic requirements:

- `path`
- `line`
- `column`
- `severity`
- `code`
- `message`
- optional related locations

Success criteria:

- Diagnostics are machine-readable and directly consumable by VS Code.
- Broken repositories produce actionable location-aware errors.
- Known-good repositories validate cleanly.

### 6. Define the VS Code extension scaffold

The extension is a thin client over the CLI and should use standard VS Code extension mechanics.

Core extension layers:

- workspace adapter
  - locate SRS repositories in the open workspace
  - track active repository context
- CLI bridge
  - locate `srs` binary
  - invoke subprocesses
  - parse JSON output
  - handle command failures and tracing
- UI layer
  - tree views
  - diagnostics
  - commands
  - webviews/forms
  - previews

Activation events:

- workspace contains `.srs`
- workspace contains `manifest.json`
- open files under known SRS repository paths
- explicit command invocation

Required extension settings:

- `srs.cliPath`
- `srs.autoValidate`
- `srs.renderFormat`
- `srs.trace.cli`

Behavior defaults:

- `srs.cliPath`
  - optional explicit override
- `srs.autoValidate`
  - default `onSave`
- `srs.renderFormat`
  - default `markdown`
- `srs.trace.cli`
  - default `false`

Success criteria:

- The extension can find an SRS repo in the workspace.
- The extension can invoke the CLI using either configured path or default discovery.

### 7. Build repository explorer UX

Use VS Code tree views to make the repository legible without manual path walking.

Required tree views:

- Repository
  - title
  - conformance
  - root path
- Package
  - fields
  - types
  - views
  - schemas
- Instances
  - Notes
  - Typed Records
  - Records grouped by type
- Relations
- Source Documents

Explorer data shape from `repo index` should include:

- repository summary
- package summary
- grouped instance counts
- grouped entries with labels and canonical paths
- relation summary
- source document summary

User actions:

- open item
- reveal related file
- refresh repository
- validate repository
- render selected document view

Success criteria:

- A user can browse the gallery example repository from tree views alone.
- Every explorer item resolves to a canonical file path.

### 8. Build diagnostics and navigation

Turn CLI semantics into first-class editor affordances.

Required VS Code features:

- `DiagnosticCollection`
  - populated by `srs repo validate --json`
- `DocumentLinkProvider`
  - link references such as `packageRef.path`, `relationsPath`, source-document paths
- `DefinitionProvider`
  - navigate from `typeId`, `fieldId`, and relation endpoints to canonical definitions or instance files
- `CodeActionProvider`
  - offer common repository fixes

Priority quick fixes:

- missing manifest index entry
- bad local package path
- unresolved `typeId`
- unresolved `fieldId`
- unresolved relation endpoint

Navigation targets:

- record -> type definition
- type -> field definition
- relation endpoint -> instance file
- manifest path references -> underlying file

Success criteria:

- Semantic errors surface inline inside VS Code.
- Cross-file SRS references are navigable like code symbols.

### 9. Build authoring commands and form editors

Reduce hand-written JSON for common authoring flows, but preserve raw files as the source of truth.

Required commands:

- create repository
- create field
- create type
- create note
- create typed record
- create record
- create relation
- add source document

Authoring approach:

- command invokes CLI scaffold/inspect command
- extension receives scaffold JSON
- extension writes or inserts the resulting file content through normal file editing flows
- diagnostics rerun after creation

Form editor scope:

- start with Tier 2 records and Type definitions
- use CLI inspection output to render ordered fields and metadata
- save back to the underlying JSON file

Form editor requirements:

- show resolved type metadata
- show required and optional fields
- show field labels and descriptions
- support lifecycle field display where relevant
- allow fallback to raw JSON editing at all times

Success criteria:

- Users can create common SRS entities without hand-writing every JSON structure.
- Form-based editing does not create an editor-private storage model.

### 10. Build document rendering preview

Use the CLI to power in-editor previews for document-shaped projections.

Primary command:

```text
srs render document-view --repo <path> --view <id> --format <markdown|html|text> --json
```

Preview contract:

- returns either inline content
- or returns a generated file path plus metadata

Preview JSON shape:

```json
{
  "ok": true,
  "render": {
    "viewId": "uuid-or-name",
    "format": "markdown",
    "mode": "inline",
    "content": "# Document title\n...",
    "contentPath": null
  },
  "diagnostics": []
}
```

or

```json
{
  "ok": true,
  "render": {
    "viewId": "uuid-or-name",
    "format": "html",
    "mode": "path",
    "content": null,
    "contentPath": "/tmp/srs-preview-123.html"
  },
  "diagnostics": []
}
```

Preview priorities:

- support at least one `DocumentView`
- work especially well for `ext:views-l2`
- refresh on demand
- surface rendering diagnostics clearly

Success criteria:

- The extension can preview a document projection from the current repository.
- Preview does not require a separate rendering engine in the extension.

### 11. Define packaging and distribution plan

Make runtime assumptions explicit so the extension is shippable in v1.

V1 packaging assumptions:

- the CLI binary is installed separately from the extension
- the extension discovers the CLI through:
  - explicit `srs.cliPath`
  - or standard shell/path lookup

The extension must:

- fail clearly when the CLI is missing
- show the expected binary path or lookup behavior
- trace subprocess invocation when `srs.trace.cli` is enabled

Out of scope for v1:

- bundling native binaries inside the extension
- shipping Node native bindings
- embedding Rust/WASM in the extension runtime

Success criteria:

- Extension runtime dependencies are explicit.
- Installation and failure modes are understandable to implementers and users.

### 12. Define future follow-ons

Name future expansions clearly so they are not accidentally pulled into v1.

Future work:

- Python bindings over Rust core
- Node or N-API bindings
- WASM validation/runtime for browser or webview contexts
- richer LSP features
- database or search projections
- graph visualizations
- multi-repository federation tooling

V1 boundary:

- CLI subprocess boundary remains the only required runtime integration path.
- All future work is explicitly out of scope for the first extension milestone.

Success criteria:

- Future directions are recorded.
- None of them are treated as blockers for v1.

---

## Required interfaces

### CLI diagnostics

All CLI commands that can return semantic issues must support:

- `path`
- `line`
- `column`
- `severity`
- `code`
- `message`
- optional related locations

### Explorer data

The repository index output must include:

- repository summary
- instance counts
- grouped entries
- canonical paths

### Extension settings

The extension must define:

- `srs.cliPath`
- `srs.autoValidate`
- `srs.renderFormat`
- `srs.trace.cli`

### Preview contract

Document rendering must return:

- either inline content
- or a file path plus metadata

---

## Acceptance criteria and test scenarios

### Gallery example validation

- The gallery example repository is detected from its `.srs` root.
- `repo inspect` returns valid repository summary information.
- `repo validate` succeeds on the known-good gallery repository.

### Broken repository diagnostics

- Intentionally broken records surface location-aware diagnostics.
- Intentionally broken relations surface unresolved endpoint diagnostics.
- Manifest/package mismatches produce machine-readable errors.

### Explorer population

- The extension builds the explorer from `manifest.json`, package contents, and relations.
- Grouped instance lists are populated without scanning arbitrary files outside repository rules.

### Navigation

- Record references navigate to bound Type definitions.
- Type field references navigate to Field definitions.
- Relation endpoints navigate to the referenced instance file.

### Authoring flows

- Record creation uses CLI-backed scaffolding.
- New entities appear in the explorer after creation.
- Raw JSON remains editable and authoritative after form-based edits.

### Document preview

- At least one `DocumentView` in the gallery example can be rendered and previewed from VS Code.
- Rendering diagnostics surface clearly when the view or repository is invalid.

---

## Assumptions and defaults

- This file is the single master plan, not a plan bundle.
- It lives directly under `docs/specifications/srs/plans/`.
- The gallery example repository is the first implementation and validation fixture.
- The plan is written as an execution handoff to an agent, with concrete steps and success checks.
- No code or docs outside this new plan document are changed in this phase.
