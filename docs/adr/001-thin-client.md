# ADR-001: srs-vscode is a thin CLI client — zero SRS semantics in TypeScript

- **Status:** accepted
- **Date:** 2026-06-26
- **Supersedes:** —
- **Superseded by:** —

## Context

srs-vscode is a VS Code extension for working with SRS repositories. The SRS semantic
engine — record creation, mutation, validation, relation management, lifecycle
transitions, querying, and rendering — is implemented in `srs-repository` (Rust) and
exposed through the `srs` CLI binary. A VS Code extension could alternatively
re-implement these operations in TypeScript.

This is the VS Code end of the ecosystem-wide default path documented in
`srs-rust/docs/architecture/capability-layering.md`: a capability is built once as a
`srs-repository` service, exposed through a stable interface (here, the CLI's JSON
payload contract), and the client consumes it and renders the result.

## Decision

srs-vscode holds **no SRS semantics in TypeScript**. All mutation, validation,
lifecycle, relation, querying, and rendering operations are performed exclusively by
shelling out to the `srs` CLI through `cli-bridge.ts`. The TypeScript layer is a
presentation client only: it builds CLI invocations, parses the JSON envelope, and
renders results. It does not construct or interpret SRS record structures, compute
filters, traverse relations, sort, or validate on its own.

Consequences of needing a new operation: add a `srs-repository` service and a `srs` CLI
command (with a named payload struct, per srs-rust ADR-011) **first**; the extension
then calls it. The extension cannot prototype semantics ahead of the engine.

## Consequences

**Positive:**
- Semantic correctness is guaranteed by the Rust implementation — no drift between the
  CLI engine and the extension.
- The CLI's JSON payload contract is a stable boundary; UI changes never risk corrupting
  the data model.
- TypeScript stays small and focused on editor/presentation concerns.

**Negative / trade-offs:**
- The extension depends on a working `srs` binary being resolvable at runtime.
- New CLI commands must land in srs-rust before the extension can expose new operations.

**Neutral:**
- TypeScript interfaces for CLI outputs are kept in sync with the payload schemas in
  `srs-rust/crates/srs-cli/schemas/payload/` (the same contract the schema mirror in
  this repo tracks — see `docs/schema-sync.md`).
- All subprocess communication is funnelled through `cli-bridge.ts`; no command handler
  shells out directly.
