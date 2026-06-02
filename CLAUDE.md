# CLAUDE.md — srs-vscode

VS Code extension for SRS. A thin TypeScript client over the `srs` CLI binary. The extension does not implement any SRS logic — it delegates everything to the CLI via subprocess.

The top-level `semanticops/CLAUDE.md` contains the full SRS data model and CLI reference. The `semanticops/srs-usage.md` file contains the rules for working with SRS repositories — the extension enforces these same patterns for users.

## Commands

```bash
npm install
npm run build                    # esbuild bundle
npm run watch                    # incremental build
npm test                         # run test suite (spawns extension host)
```

## Architecture

**`cli-bridge.ts`** is the single subprocess boundary. All CLI invocations go through it. Do not add direct filesystem access to SRS data anywhere else in the extension — if the CLI cannot express the operation, the extension cannot perform it either.

The extension has no knowledge of SRS file layout, JSON structure, or manifest format. It knows CLI commands and their JSON envelope output shapes.

## CLI Output Contract

Payload shapes are defined by the Rust structs in `srs-rust/crates/srs-cli/src/payload.rs` and the golden JSON Schema files in `srs-rust/crates/srs-cli/schemas/payload/`. The TypeScript interfaces in `src/cli/types.ts` are manually maintained to match. CI validates this via AJV against the golden schemas.

If a payload shape changes in `srs-rust`, update `src/cli/types.ts` to match, then update `test/fixtures/envelopes.ts` to include a valid fixture for the new shape.

## Adding a New Command Surface

1. Add the CLI invocation in `cli-bridge.ts` — one function per logical operation.
2. Add the TypeScript interface in `src/cli/types.ts` matching the payload struct.
3. Add a fixture envelope in `test/fixtures/envelopes.ts` for the new payload.
4. Run `npm test` — the AJV payload contract tests must pass.

Do not parse CLI output outside of `cli-bridge.ts`. Do not construct SRS JSON manually to pass to the CLI — use stdin as the CLI commands expect.

## Settings

Relevant extension settings: `srs.cliPath`, `srs.autoValidate`, `srs.renderFormat`, `srs.trace.cli`. If `srs.cliPath` is not set, the extension resolves `srs` from PATH.

## Schema Files

`schemas/2.0/` mirrors the entity JSON schemas from `srs/docs/schema/2.0/`. These are generated — do not edit them here. Sync them from the canonical source with the sync script:

```bash
# from srs-rust/
bash scripts/check-schema-sync.sh
```
