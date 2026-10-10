# CLAUDE.md

Guidance for Claude Code working in **srs-vscode** — the VS Code extension for the SRS
(Semantic Record System). It is a thin TypeScript client over the `srs` CLI binary
(`cli-bridge.ts`); it does not re-implement any SRS semantics. Part of the SemanticOps
monorepo (see the parent `srs-rust`/`srs` repos for the engine and spec).

## Project & priority management

Programme, queue, board and priority tooling live in **the-greenman/clerk** (`docs/tools.md`; locally `~/dev/semanticops/clerk`): `clerk board` (story-driven priority on Project #6; stories and epics in `the-greenman/semanticops.com`), `clerk roadmap` (derives epic priority from the srs-programme period ranking; the only writer of epic priority), `clerk queue`. The slash commands `/triage`, `/stories`, `/roadmap` are canonical in clerk `.claude/commands/`. Programme data (roadmap, problems, sessions) is **the-greenman/srs-programme**.

Rules that still hold here:
- **Never hand-set an implementation issue's priority**; it is derived from the stories it serves. Epic priority is never set by hand.
- **File issues linked**: parent every new implementation issue under the story or epic it serves (`clerk board link <parent-repo>#<n> <child-repo>#<n>`).
- **Bugs** floor at `priority: P1`; unlinked non-bug work is flagged, never dropped.

## Branch & PR hygiene

Every branch must trace to a GitHub issue, and every PR must link its issue. This is how the ecosystem avoids the recurring failure mode where an issue is marked closed but its fix survives only on an unmerged, abandoned branch.

- **Naming** — human-created branches use `type/<issue#>-slug` (e.g. `feat/242-cross-field-rules`, `docs/432-migrate-identity`). Cloud-agent branches (`claude/<name>-<hash>`) are exempt from the scheme but their PR **must** carry `Closes #N`.
- **Linking** — every PR body includes `Closes #N` (or `Refs #N` if it should not auto-close). No PR without an issue reference. See `.github/pull_request_template.md`.
- **Merged branches auto-delete** — the repo has `deleteBranchOnMerge` enabled; a branch is removed automatically once its PR merges. Don't recreate deleted merged branches.
- **Abandoning work** — if a PR is closed **without merging** and the work is still wanted, reopen/flag the linked issue with a pointer to the branch **before** walking away. Otherwise the issue looks done while the fix lives only on a dead branch.
- **Automated safety net** — the weekly **SRS Branch Auditor** cloud routine reports merged-but-undeleted branches and reopens any issue whose fix survives only on an unmerged branch.
