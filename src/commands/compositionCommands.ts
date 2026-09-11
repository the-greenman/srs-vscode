// The composition document panel: one webview per composition, two modes.
//
// Document = the core's rendered artifact (`--view-format html|markdown|text|adoc`).
// Source   = the core's JSON projection, browsable, each record clicking through
//            to its own preview beside.
//
// `render composition` returns `rendered` OR `projection`, never both, and the
// rendered formats carry no instance ids — so the two are separate views rather
// than one fused clickable document. See docs/adr/002.
import * as vscode from "vscode";
import { CliClient, CliError } from "../cli/CliClient";
import { RepositoryProvider } from "../repository/RepositoryProvider";
import { PreviewPanel, wrapHtml, esc } from "../preview/PreviewPanel";
import { buildLabelMap, LabelInfo } from "../cli/labelMap";
import { resolveTypeFields, ResolvedField } from "../cli/typeFields";
import { renderFieldRow, openMarkdownPreview } from "./previewCommands";
import type {
  EntityKind,
  CompositionProjection,
  ProjectionRelation,
  ProjectionProperty,
  RecordListPayload,
  RenderCompositionPayload,
} from "../cli/types";

export type DocumentFormat = "html" | "markdown" | "text" | "adoc";

export interface OpenCompositionArgs {
  compositionId: string;
  title: string;
  containerId?: string;
}

interface PanelState extends OpenCompositionArgs {
  mode: "document" | "source";
  format: DocumentFormat;
  themeVariant?: string;
  instance?: string;
}

// Per-composition panel state, so re-opening a panel keeps the mode/format the
// user last chose. Keyed the same way PreviewPanel memoises its panels.
const PANEL_STATE = new Map<string, PanelState>();

export function registerCompositionCommands(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  compositionsProvider?: { refresh(): void },
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("srs.openComposition", (args: unknown) =>
      cmdOpenComposition(context, cli, repoProvider, args as OpenCompositionArgs),
    ),
    vscode.commands.registerCommand("srs.refreshCompositions", () =>
      compositionsProvider?.refresh(),
    ),
  );
}

async function cmdOpenComposition(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoProvider: RepositoryProvider,
  args: OpenCompositionArgs,
): Promise<void> {
  const repo = repoProvider.active;
  if (!repo || !args?.compositionId) return;

  const existing = PANEL_STATE.get(args.compositionId);
  const state: PanelState = existing
    ? { ...existing, ...args }
    : { ...args, mode: "document", format: "html" };
  PANEL_STATE.set(args.compositionId, state);

  await renderPanel(context, cli, repo.rootPath, state);
}

// ---- Render ----

async function renderPanel(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  state: PanelState,
): Promise<void> {
  let payload: RenderCompositionPayload;
  try {
    payload = await cli.runOk<RenderCompositionPayload>(repoPath, renderArgs(state));
  } catch (err) {
    const msg = err instanceof CliError ? err.message : String(err);
    vscode.window.showErrorMessage(`SRS: Render failed: ${msg}`);
    return;
  }

  const body =
    state.mode === "source"
      ? await sourceBodyHtml(cli, repoPath, payload.projection)
      : documentBodyHtml(state, payload.rendered);

  const html = wrapHtml(
    state.title,
    `${toolbarHtml(state)}
    ${diagnosticsHtml(payload.diagnostics ?? [])}
    ${body}
    ${PANEL_CSS}
    <script>
      const vscode = acquireVsCodeApi();
      function post(msg) { vscode.postMessage(msg); }
      document.querySelectorAll('[data-mode]').forEach(function (el) {
        el.addEventListener('click', function () { post({ type: 'mode', mode: el.dataset.mode }); });
      });
      document.querySelectorAll('[data-act]').forEach(function (el) {
        el.addEventListener('click', function () { post({ type: el.dataset.act }); });
      });
      const fmt = document.getElementById('srs-format');
      if (fmt) fmt.addEventListener('change', function () { post({ type: 'format', format: fmt.value }); });
      document.querySelectorAll('.rec-link').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          post({ type: 'openEntity', id: el.dataset.id, kind: el.dataset.kind });
        });
      });
    </script>`,
    { enableScripts: true },
  );

  PreviewPanel.show(context, `composition:${state.compositionId}`, state.title, html, {
    enableScripts: true,
    onMessage: (msg: unknown) =>
      handleMessage(context, cli, repoPath, state, msg).catch((err: unknown) => {
        const m = err instanceof CliError ? err.message : String(err);
        vscode.window.showErrorMessage(`SRS: ${m}`);
      }),
  });
}

function renderArgs(state: PanelState): string[] {
  const args = [
    "render",
    "composition",
    "--view",
    state.compositionId,
    "--view-format",
    state.mode === "source" ? "json" : state.format,
  ];
  if (state.containerId) args.push("--container", state.containerId);
  if (state.themeVariant) args.push("--theme-variant", state.themeVariant);
  if (state.instance) args.push("--instance", state.instance);
  return args;
}

async function handleMessage(
  context: vscode.ExtensionContext,
  cli: CliClient,
  repoPath: string,
  state: PanelState,
  msg: unknown,
): Promise<void> {
  const m = msg as { type?: string; mode?: string; format?: string; id?: string; kind?: string };
  switch (m.type) {
    case "mode":
      state.mode = m.mode === "source" ? "source" : "document";
      return renderPanel(context, cli, repoPath, state);
    case "format":
      state.mode = "document";
      state.format = (m.format ?? "html") as DocumentFormat;
      return renderPanel(context, cli, repoPath, state);
    case "theme": {
      const value = await vscode.window.showInputBox({
        prompt: "Theme variant defined on this Composition (empty to clear)",
        value: state.themeVariant ?? "",
      });
      if (value === undefined) return;
      state.themeVariant = value || undefined;
      return renderPanel(context, cli, repoPath, state);
    }
    case "instance": {
      const picked = await pickInstance(cli, repoPath);
      if (picked === undefined) return;
      state.instance = picked || undefined;
      return renderPanel(context, cli, repoPath, state);
    }
    case "markdown": {
      // Escape hatch: the same document in VS Code's own markdown preview.
      const payload = await cli.runOk<RenderCompositionPayload>(
        repoPath,
        renderArgs({ ...state, mode: "document", format: "markdown" }),
      );
      await openMarkdownPreview(payload.rendered, state.title);
      return;
    }
    case "openEntity":
      if (m.id && m.kind) {
        await vscode.commands.executeCommand("srs.openEntityById", m.id, m.kind, repoPath);
      }
      return;
  }
}

/** Pick the `--instance` scope (per-record export) from the repository's records. */
async function pickInstance(cli: CliClient, repoPath: string): Promise<string | undefined> {
  const payload = await cli.runOk<RecordListPayload>(repoPath, ["record", "list"]);
  const items = [
    { label: "$(clear-all) No instance scope", id: "" },
    ...payload.records.map((r) => ({
      label: r.displayLabel,
      description: `${r.record.typeNamespace}/${r.record.typeName}`,
      detail: r.instanceId,
      id: r.instanceId,
    })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Scope this document to a single record",
    matchOnDetail: true,
  });
  return picked?.id;
}

// ---- Document mode ----

function documentBodyHtml(state: PanelState, rendered: string): string {
  if (!rendered) return '<p class="empty">This composition rendered no content.</p>';
  // The HTML fragment comes from the core's own renderer (tables, themed
  // srs-* classes) — embed it verbatim rather than re-rendering markdown here.
  return state.format === "html"
    ? `<div class="srs-document-host">${rendered}</div>`
    : `<pre class="srs-document-raw">${esc(rendered)}</pre>`;
}

// ---- Source mode ----

export interface SourceRecordModel {
  instanceId: string;
  heading: string;
  /** From the shared label map (note vs record) — what the preview must open. */
  kind: EntityKind;
  typeLabel?: string;
  typeId?: string;
  typeVersion?: number;
  fields: Record<string, unknown>;
  orderedFieldKeys: string[];
  relations: ProjectionRelation[];
  properties: ProjectionProperty[];
}

export interface SourceSectionModel {
  sectionId: string;
  heading: string;
  records: SourceRecordModel[];
}

/**
 * Projection → source model. Every label here comes from the payload: the
 * section's own `title`, the core-resolved `recordHeading`, or the shared label
 * map. Nothing is re-derived from field values (ADR-001).
 */
export function mapProjection(
  projection: CompositionProjection | undefined,
  labels: Map<string, LabelInfo>,
): SourceSectionModel[] {
  if (!projection) return [];
  return [...projection.sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      sectionId: s.sectionId,
      // An untitled section is legal (guide-body-view) — fall back to its id,
      // which is what the rendered document shows too.
      heading: s.title ?? s.sectionId,
      records: (s.records ?? []).map((r) => {
        const known = labels.get(r.instanceId);
        return {
          instanceId: r.instanceId,
          heading: r.recordHeading ?? known?.label ?? `${r.instanceId.slice(0, 8)}…`,
          // A tier-0 member carries no typeId; it is a note, and `record get`
          // would fail on it.
          kind: known?.kind ?? (r.typeId ? "record" : "note"),
          typeLabel:
            r.typeNamespace && r.typeName ? `${r.typeNamespace}/${r.typeName}` : undefined,
          typeId: r.typeId,
          typeVersion: r.typeVersion,
          fields: r.fields ?? {},
          orderedFieldKeys: r.orderedFieldKeys ?? Object.keys(r.fields ?? {}),
          relations: r.relations ?? [],
          properties: r.properties ?? [],
        };
      }),
    }));
}

async function sourceBodyHtml(
  cli: CliClient,
  repoPath: string,
  projection: CompositionProjection | undefined,
): Promise<string> {
  // Whole-repo and uncached — fetch once per render and pass it down.
  const labels = await buildLabelMap(cli, repoPath);
  const sections = mapProjection(projection, labels);
  if (sections.length === 0) return '<p class="empty">This composition has no sections.</p>';

  // One `type schema` call per distinct typeId@typeVersion in the projection.
  const fieldSets = new Map<string, ResolvedField[]>();
  for (const rec of sections.flatMap((s) => s.records)) {
    const key = typeKey(rec);
    if (!key || fieldSets.has(key)) continue;
    try {
      fieldSets.set(key, await resolveTypeFields(cli, repoPath, rec.typeId!, rec.typeVersion));
    } catch {
      fieldSets.set(key, []);
    }
  }

  return sections
    .map(
      (s) => `<h2>${esc(s.heading)}</h2>
      ${
        s.records.length === 0
          ? '<p class="empty">No records in this section.</p>'
          : s.records.map((r) => recordHtml(r, fieldSets.get(typeKey(r) ?? "") ?? [])).join("")
      }`,
    )
    .join("");
}

function typeKey(rec: SourceRecordModel): string | undefined {
  return rec.typeId ? `${rec.typeId}@${rec.typeVersion ?? ""}` : undefined;
}

function recordHtml(rec: SourceRecordModel, fields: ResolvedField[]): string {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const rows = rec.orderedFieldKeys
    .filter((k) => rec.fields[k] !== undefined && rec.fields[k] !== null)
    .map((k) =>
      renderFieldRow(
        byName.get(k) ?? { name: k, displayLabel: k, order: 0, required: false, kind: "scalar" },
        rec.fields[k],
      ),
    )
    .join("");

  const props = rec.properties
    .map((p) => `<span class="tag">${esc(p.label)}: ${esc(String(p.value ?? ""))}</span>`)
    .join("");

  const relations = rec.relations
    .map(
      (rel) => `<div class="relation-row">
        <span class="rel-arrow">${rel.direction === "inverse" ? "←" : "→"}</span>
        <span class="rel-type">${esc(rel.label || rel.relationType)}</span>
        <span>${rel.targets
          .map(
            (t) =>
              `<a class="rel-link rec-link" href="#" data-id="${esc(t.instanceId)}" data-kind="record" title="${esc(t.instanceId)}">${esc(t.displayLabel)}</a>`,
          )
          .join(", ")}</span>
      </div>`,
    )
    .join("");

  return `<div class="src-record">
    <div class="src-record-head">
      <a class="rec-link src-heading" href="#" data-id="${esc(rec.instanceId)}" data-kind="${rec.kind}" title="${esc(rec.instanceId)}">${esc(rec.heading)}</a>
      ${rec.typeLabel ? `<span class="src-type">${esc(rec.typeLabel)}</span>` : ""}
      ${props}
    </div>
    ${relations}
    ${rows ? `<details><summary>Fields</summary>${rows}</details>` : ""}
  </div>`;
}

// ---- Chrome ----

function toolbarHtml(state: PanelState): string {
  const modeBtn = (mode: string, label: string) =>
    `<button data-mode="${mode}"${state.mode === mode ? ' class="active"' : ""}>${label}</button>`;
  const formats: DocumentFormat[] = ["html", "markdown", "text", "adoc"];
  const options = formats
    .map((f) => `<option value="${f}"${state.format === f ? " selected" : ""}>${f}</option>`)
    .join("");
  const scope = [
    state.containerId ? "container" : "",
    state.themeVariant ? `theme: ${state.themeVariant}` : "",
    state.instance ? "single instance" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<div class="toolbar">
    ${modeBtn("document", "Document")}
    ${modeBtn("source", "Source")}
    <select id="srs-format"${state.mode === "source" ? " disabled" : ""}>${options}</select>
    <button data-act="theme">Theme variant…</button>
    <button data-act="instance">Instance…</button>
    <button data-act="markdown">Open raw markdown</button>
    ${scope ? `<span class="meta toolbar-scope">${esc(scope)}</span>` : ""}
  </div>`;
}

function diagnosticsHtml(diagnostics: string[]): string {
  if (diagnostics.length === 0) return "";
  return `<details class="diagnostics">
    <summary>${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}</summary>
    <ul>${diagnostics.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
  </details>`;
}

const PANEL_CSS = `<style>
  .toolbar { display: flex; align-items: center; gap: 0.4em; flex-wrap: wrap; margin-bottom: 1em;
             padding-bottom: 0.6em; border-bottom: 1px solid var(--vscode-panel-border); }
  .toolbar button, .toolbar select { font-family: inherit; font-size: 0.85em; padding: 0.25em 0.7em;
             color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
             background: var(--vscode-button-secondaryBackground, transparent);
             border: 1px solid var(--vscode-panel-border); border-radius: 3px; cursor: pointer; }
  .toolbar button.active { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .toolbar-scope { margin: 0 0 0 auto; }
  .diagnostics { border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700);
                 padding: 0.3em 0 0.3em 0.8em; margin-bottom: 1em; font-size: 0.9em; }
  .diagnostics ul { margin: 0.4em 0 0; padding-left: 1.2em; }
  .src-record { padding: 0.5em 0; border-bottom: 1px solid var(--vscode-panel-border); }
  .src-record-head { display: flex; align-items: baseline; gap: 0.6em; flex-wrap: wrap; }
  .src-heading { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; font-weight: 600; }
  .src-heading:hover { text-decoration: underline; }
  .src-type { font-size: 0.8em; color: var(--vscode-descriptionForeground); }
  .src-record details { margin-top: 0.4em; }
  .src-record summary { font-size: 0.85em; color: var(--vscode-descriptionForeground); cursor: pointer; }
  .srs-document-host table { border-collapse: collapse; margin: 0.6em 0; }
  .srs-document-host th, .srs-document-host td { padding: 0.3em 0.6em; border: 1px solid var(--vscode-panel-border); text-align: left; }
  .srs-document-host .srs-record { margin: 0.8em 0; }
  .srs-document-host .srs-field-label { color: var(--vscode-descriptionForeground); }
  .srs-document-raw { white-space: pre-wrap; }
</style>`;
