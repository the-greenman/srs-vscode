# CLAUDE.md

Guidance for Claude Code working in **srs-vscode** — the VS Code extension for the SRS
(Semantic Record System). It is a thin TypeScript client over the `srs` CLI binary
(`cli-bridge.ts`); it does not re-implement any SRS semantics. Part of the SemanticOps
monorepo (see the parent `srs-rust`/`srs` repos for the engine and spec).

## Project & priority management

Issues across the ecosystem are tracked on **Project #5 "SRS"** and prioritised **top-down from
user stories**. The authoritative process lives in the `srs-rust` repo:
**`docs/project-management.md`** (canonical).

Quick rules:
- **Never hand-set an implementation issue's priority.** It is derived from the user stories it
  serves (as native GitHub sub-issues): humans set **MoSCoW** on stories; `gh-project rollup`
  derives `priority: Pn` (Must→P0, Should→P1, Could→P2).
- **Bugs** floor at `priority: P1` (fixed ASAP, even without a story); **unlinked non-bug** work
  is flagged ("could get lost"), never dropped — link it to a story.
- Skills here: `/triage`, `/stories`, `/roadmap`. They fetch the released tool (works in an
  isolated checkout):
  `gh release download --repo the-greenman/srs-rust --pattern gh-project.mjs --output /tmp/gh-project.mjs --clobber`.
