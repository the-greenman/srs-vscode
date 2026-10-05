# SRS Repository Browser (srs-vscode)

Repositories in your workspace, with views for navigating them: a VS Code extension for browsing, validating and editing SRS repositories directly in the editor.

SRS (pronounced "source") is an open standard for portable semantic documents that people and AI can both understand and use. [semanticops.com](https://semanticops.com) explains it (agents start at [`/llms.txt`](https://semanticops.com/llms.txt)); [srs.semanticops.com](https://srs.semanticops.com) hosts the specification and schemas.

It is a **thin extension** over the `srs` binary, with tree and navigator views, validation on save, preview, and a relation graph. It carries zero SRS semantics of its own: every record, type, relation, container, lifecycle, validation, query, and rendering operation is delegated to the Rust `srs` engine by shelling out to the CLI (ADR-001). The TypeScript layer only builds CLI invocations, parses the JSON envelopes they return, and renders the results.

## The SemanticOps projects

| Project | Kind | In one line |
|---|---|---|
| [srs](https://github.com/the-greenman/srs) | Open standard | The specification, authored as its own data. |
| [srs-rust](https://github.com/the-greenman/srs-rust) | Reference engine | One core behind a CLI, WebAssembly bindings and an MCP server. |
| [srs-web](https://github.com/the-greenman/srs-web) | Browser editor | Edit SRS repositories entirely client-side, on storage you own. |
| [srs-vscode](https://github.com/the-greenman/srs-vscode) (this repo) | VS Code extension | Repositories in your workspace, with views for navigating them. |

muDemocracy is the first consumer of SRS, covering decision practice. See [semanticops.com/projects](https://semanticops.com/projects/) for each project in context.

## Requirements

The extension **does not bundle a binary**: it needs the `srs` CLI available at runtime:

- Install it from [`srs-rust`](https://github.com/the-greenman/srs-rust) (a prebuilt `srs` is attached to each release, or run `cargo install --path crates/srs-cli` from a checkout), or
- Point the extension at an explicit path via the `srs.cli.path` setting (default: `srs`, resolved from `PATH`).

The extension activates when a workspace contains a `.srs/` directory, a `manifest.json`, or any `*.srsj` or `*.srs` file.

## Features

Contributes commands (all under the `srs.*` namespace) and **explorer tree views** (gated on an active SRS repository):

- **Repository**: select / refresh / validate the active repository; open a repository map.
- **Trees**: an `SRS Repository` tree, an `SRS Navigator` tree (relations, compositions, containers) and an `SRS Compositions` tree, with toolbar actions.
- **Entities**: create notes, records, and relations; edit and delete entities; manage relation types; author views, compositions, and themes; open an entity's raw JSON or a rendered preview / composition.
- **Containers**: set / clear the active container (persisted per workspace) and create containers; list/create/delete operations can be scoped to the active container.
- **Archives and attachments**: open, save, and export a `.srs` archive; add, list, and export attachments.
- **Graph**: a relation graph webview.
- **Guides**: a blueprint-schema-driven guide-editor webview.

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `srs.cli.path` | `"srs"` | Path to the `srs` executable (resolved from `PATH` by default) |
| `srs.repository.path` | `null` | Explicit repository root; auto-detected from the workspace when unset |
| `srs.validate.onSave` | `true` | Validate the repository and surface diagnostics on save |
| `srs.trace.cli` | `false` | Log each CLI invocation + raw stdout to the "SRS" output channel |

## How it talks to the CLI

`src/cli/CliClient.ts` (the "cli-bridge" of the architecture docs) spawns the binary via `child_process.spawn` with a normalized argv: `--repo <path> --format json [--pretty] [--container <id>] <subcommand…>`, optionally piping a JSON payload on stdin. `src/cli/envelope.ts` builds the argv and parses the `{ ok, payload }` envelope, raising a `CliError` (with a "check `srs.cli.path`" hint) on any malformed or non-JSON output.

## Getting started

```bash
npm install
npm run build      # bundle src/extension.ts -> dist/extension.js via esbuild
npm run watch      # rebuild on change
npm test           # compile-tests + Mocha runner (uses a hand-rolled vscode mock; no VS Code download)
```

Then press **F5** in VS Code to launch an Extension Development Host, or install the packaged extension. Enable `srs.trace.cli` to watch the exact CLI calls in the "SRS" output channel while developing.

## Project structure (`src/`)

```
extension.ts          activation entry point: wires up all command groups + views
archive/              .srs archive manager + status bar item
cli/                  CliClient, envelope (argv build + envelope parse), errors, types
repository/           active-repo detection + change events
container/            active-container state (workspaceState) + status-bar item
schema/               schema provider
tree/                 SrsTreeDataProvider, NavigatorTreeDataProvider, tree nodes
commands/             repository, preview, edit, mutation, container, composition, graph, navigator, archive, attachment
preview/  graph/      preview + relation-graph webview panels
webview/              entity editor + forms; guides/ (blueprint-driven guide editor)
provider/             virtual `srs:` document provider (raw JSON views)
diagnostics/          validate-on-save diagnostics
```

## Schema mirror

`schemas/2.0/` is a **read-only mirror** of [`srs/docs/schema/2.0/`](https://github.com/the-greenman/srs/tree/master/docs/schema/2.0) (kept honest by `scripts/check-schema-drift.sh`). Never edit it directly; sync it from the spec when schemas change. See [`docs/schema-sync.md`](docs/schema-sync.md).

## Tech stack

TypeScript (^5.3) targeting `@types/vscode` ^1.85 · **esbuild** bundler (`esbuild.js`) · **Mocha** tests with a vscode mock · `ajv` for schema/payload-contract validation.

## Documentation

- [`docs/adr/001-thin-client.md`](docs/adr/001-thin-client.md): the "no SRS semantics in TypeScript" decision.
- [`docs/schema-sync.md`](docs/schema-sync.md): how the schema mirror stays in sync.
- [`CLAUDE.md`](CLAUDE.md): contributor guidance.

## Licence

The SRS VS Code extension is released under the [Apache License 2.0](LICENSE).

Contributions to this repository are made under the terms of the [Developer Certificate of Origin](CONTRIBUTING.md#developer-certificate-of-origin). By submitting a pull request, you certify that you have the right to submit that work under the Apache License 2.0 by signing off your commits with `git commit -s`.
