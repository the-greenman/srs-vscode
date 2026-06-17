# CLAUDE.md — srs-vscode

VS Code extension that browses and validates SRS repositories via the `srs` CLI binary. It is part of a monorepo (`srs`, `srs-rust`, `srs-vscode`, `srs-web`) — when using Claude Code on the web, each repo is accessed independently.

## Commands

```bash
npm run build              # bundle with esbuild (single pass)
npm run watch              # bundle with watch mode
npm test                   # compile tests + run mocha (no extension host required)
npm run check-schema-drift # verify schemas/2.0/ matches sibling srs repo
```

## Architecture — CLI bridge

The extension never re-implements SRS logic. All operations go through the `srs` binary:

- **`src/cli/CliClient.ts`** — spawns `srs --repo <path> --format json <subcommand>`, captures stdout, returns parsed envelope
- **`src/cli/envelope.ts`** — pure parsing functions; no vscode dependency; fully testable
- **`src/cli/types.ts`** — TypeScript interfaces mirroring Rust CLI payload structs
- **`src/cli/errors.ts`** — `CliError` with diagnostics array

**`src/extension.ts`** — activation entry point; wires providers and registers 7 command groups (repository, container, mutation, preview, edit, graph, navigator/guide).

**Providers:**
- `RepositoryProvider` — detects SRS repos in workspace, maintains active repo
- `SrsTreeDataProvider` — sidebar tree (records, notes, relations, containers)
- `NavigatorTreeDataProvider` — secondary tree for relations / document-views / containers
- `DiagnosticsProvider` — runs `srs repo validate` on save, publishes VS Code diagnostics

**Webviews:** `EntityEditorPanel` (forms), `PreviewPanel`, `GraphPanel` (relation graph), guide editor.

## Payload contract

`src/cli/types.ts` must mirror the Rust payload structs. When srs-rust changes a payload struct:

1. srs-rust regenerates `crates/srs-cli/schemas/payload/`
2. srs-vscode updates `src/cli/types.ts` to match
3. CI validates via `npm run check-schema-drift`

The `schemas/2.0/` directory mirrors `srs/docs/schema/2.0/` — keep them in sync. Run `npm run check-schema-drift` before pushing. The schema-drift CI job checks against srs's main branch on every push/PR.

## Configuration

```
srs.cli.path          // default: "srs" (resolved from PATH)
srs.repository.path   // default: null (auto-detect from workspace)
srs.validate.onSave   // default: true
srs.trace.cli         // default: false
```

## SRS data model (reference)

**Field** — atomic semantic unit. UUID `id`, `namespace`, `name` (snake_case), `version` (integer), `valueType` (string|text|number|boolean|date|url|select|multiselect).

**Type** — named, versioned composition of Fields via FieldAssignments: `{ fieldId, order, required, displayLabel? }`.

**Record tiers:**
- **Tier 0 (Note)**: free text, no type binding
- **Tier 1 (TypedRecord)**: named fields with values, no Type binding
- **Tier 2 (Record)**: instantiated Type via `typeId` + `typeVersion`; `fieldValues[]` maps `fieldId → value`

**Relation** — typed edge between two instance UUIDs. Canonical types: `contains`, `depends-on`, `supersedes`, `precedes`, etc.

**Container** — lightweight grouping boundary distinct from instance IDs.

**CLI envelope:** all commands return `{ "ok": true/false, "command": "...", "version": "...", "payload": { ... } }`. Exit code 0 means command ran; check `payload.diagnostics` for validation errors.

## Git commit signing (local CLI use)

All commits use an SSH signing key. Before committing:

```bash
ssh-add -l | grep -q "SHA256:vHuO6si5w3RLL4IJZofWbyvEi42WA2fYX7bM" || echo "SIGNING KEY NOT LOADED"
```

If missing, stop — do not bypass signing.
