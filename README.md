# SRS Repository Browser (srs-vscode)

A VS Code extension for browsing, validating, and editing **SRS (Semantic Record System)** repositories directly in the editor.

It is a **thin client**: it carries zero SRS semantics of its own. Every record, type, relation, container, lifecycle, validation, query, and rendering operation is delegated to the Rust `srs` engine by shelling out to the CLI (ADR-001). The TypeScript layer only builds CLI invocations, parses the JSON envelopes they return, and renders the results.

## The ecosystem

Part of the SemanticOps monorepo — four independent git repos under a shared parent:

| Repo | Role |
|------|------|
| [`srs`](../srs) | Canonical spec: RFCs, JSON schemas, spec-as-records |
| [`srs-rust`](../srs-rust) | Reference implementation — the `srs` CLI engine + WASM bindings |
| **srs-vscode** (this repo) | VS Code extension (thin client over the `srs` CLI) |
| [`srs-web`](../srs-web) | Governance web editor (thin client over the WASM bindings) |

## Requirements

The extension **does not bundle a binary** — it needs the `srs` CLI available at runtime:

- Install it from [`srs-rust`](../srs-rust): `cargo install --path crates/srs-cli`, or
- Point the extension at an explicit path via the `srs.cli.path` setting (default: `srs`, resolved from `PATH`).

The extension activates when a workspace contains a `.srs/` directory, a `manifest.json`, or any `*.srsj` file.

## Features

Contributes **26 commands** (all under the `srs.*` namespace) and **two explorer tree views** (gated on an active SRS repository):

- **Repository** — select / refresh / validate the active repository; open a repository map.
- **Trees** — an `SRS Repository` tree and an `SRS Navigator` tree (relations, document views, containers) with toolbar actions.
- **Entities** — create notes, tags, records, and relations; edit and delete entities; manage relation types; open an entity's raw JSON or a rendered preview / document view.
- **Containers** — set / clear the active container (persisted per workspace) and create containers; list/create/delete operations can be scoped to the active container.
- **Graph** — a relation graph webview.
- **Guides** — a blueprint-schema-driven guide-editor webview.

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `srs.cli.path` | `"srs"` | Path to the `srs` executable (resolved from `PATH` by default) |
| `srs.repository.path` | `null` | Explicit repository root; auto-detected from the workspace when unset |
| `srs.validate.onSave` | `true` | Validate the repository and surface diagnostics on save |
| `srs.trace.cli` | `false` | Log each CLI invocation + raw stdout to the "SRS" output channel |

## How it talks to the CLI

`src/cli/CliClient.ts` (the "cli-bridge" of the architecture docs) spawns the binary via `child_process.spawn` with a normalized argv — `--repo <path> --format json [--pretty] [--container <id>] <subcommand…>` — optionally piping a JSON payload on stdin. `src/cli/envelope.ts` builds the argv and parses the `{ ok, payload }` envelope, raising a `CliError` (with a "check `srs.cli.path`" hint) on any malformed or non-JSON output.

## Getting started

```bash
npm install
npm run build      # bundle src/extension.ts -> dist/extension.js via esbuild
npm run watch      # rebuild on change
npm test           # compile-tests + Mocha runner (uses a hand-rolled vscode mock; no VS Code download)
```

Then press **F5** in VS Code to launch an Extension Development Host, or install the packaged extension. Enable `srs.trace.cli` to watch the exact CLI calls in the "SRS" output channel while developing.

## Project structure (`src/`, ~30 files)

```
extension.ts          activation entry point — wires up all command groups + views
cli/                  CliClient, envelope (argv build + envelope parse), errors, types
repository/           active-repo detection + change events
container/            active-container state (workspaceState) + status-bar item
schema/               schema provider
tree/                 SrsTreeDataProvider, NavigatorTreeDataProvider, tree nodes
commands/             repository, preview, edit, mutation, container, graph, navigator
preview/  graph/      preview + relation-graph webview panels
webview/              entity editor + forms; guides/ (blueprint-driven guide editor)
provider/             virtual `srs:` document provider (raw JSON views)
diagnostics/          validate-on-save diagnostics
```

## Schema mirror

`schemas/2.0/` is a **read-only mirror** of `../srs/docs/schema/2.0/` (kept honest by `scripts/check-schema-drift.sh`). Never edit it directly; sync it from the spec when schemas change. See [`docs/schema-sync.md`](docs/schema-sync.md).

## Tech stack

TypeScript (^5.3) targeting `@types/vscode` ^1.85 · **esbuild** bundler (`esbuild.js`) · **Mocha** tests with a vscode mock · `ajv` for schema/payload-contract validation.

## Documentation

- [`docs/adr/001-thin-client.md`](docs/adr/001-thin-client.md) — the "no SRS semantics in TypeScript" decision.
- [`docs/schema-sync.md`](docs/schema-sync.md) — how the schema mirror stays in sync.
- [`CLAUDE.md`](CLAUDE.md) — contributor guidance.
