import * as vscode from "vscode";

/**
 * A single, reusable webview panel keyed by a stable string id.
 * Calling PreviewPanel.show() with the same id brings the existing panel
 * to the foreground rather than opening a duplicate.
 */
export class PreviewPanel implements vscode.Disposable {
  private static readonly _panels = new Map<string, PreviewPanel>();

  static show(
    context: vscode.ExtensionContext,
    id: string,
    title: string,
    html: string,
  ): PreviewPanel {
    const existing = PreviewPanel._panels.get(id);
    if (existing) {
      existing._panel.reveal(vscode.ViewColumn.Active);
      existing._panel.title = title;
      existing._update(html);
      return existing;
    }
    const panel = new PreviewPanel(context, id, title, html);
    PreviewPanel._panels.set(id, panel);
    return panel;
  }

  private readonly _panel: vscode.WebviewPanel;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly _id: string,
    title: string,
    html: string,
  ) {
    this._panel = vscode.window.createWebviewPanel(
      "srsPreview",
      title,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: false,
        localResourceRoots: [],
      },
    );

    this._update(html);

    this._panel.onDidDispose(() => {
      PreviewPanel._panels.delete(this._id);
    });
  }

  private _update(html: string): void {
    this._panel.webview.html = html;
  }

  dispose(): void {
    this._panel.dispose();
  }
}

// ---- HTML helpers ----

const CSS = `
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
           color: var(--vscode-foreground); background: var(--vscode-editor-background);
           padding: 1.5em 2em; max-width: 900px; line-height: 1.6; }
    h1 { font-size: 1.4em; margin-bottom: 0.25em; }
    h2 { font-size: 1.15em; margin-top: 1.5em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.2em; }
    h3 { font-size: 1em; margin-top: 1em; color: var(--vscode-descriptionForeground); }
    .meta { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 1.5em; }
    .tag { display: inline-block; background: var(--vscode-badge-background);
           color: var(--vscode-badge-foreground); border-radius: 3px;
           padding: 0 6px; font-size: 0.8em; margin: 0 2px; }
    .field-row { display: flex; gap: 1em; margin: 0.4em 0; }
    .field-label { width: 160px; flex-shrink: 0; font-weight: 600; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .field-value { flex: 1; word-break: break-word; }
    .section { margin-top: 1.2em; }
    .section-name { font-size: 0.8em; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.05em; color: var(--vscode-descriptionForeground); margin-bottom: 0.3em; }
    .member-row { padding: 0.2em 0; border-bottom: 1px solid var(--vscode-panel-border); font-size: 0.9em; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 0.8em; border-radius: 4px;
          overflow-x: auto; font-size: 0.9em; white-space: pre-wrap; }
    .empty { color: var(--vscode-descriptionForeground); font-style: italic; }
    .rendered-markdown h1 { font-size: 1.6em; }
    .rendered-markdown h2 { font-size: 1.3em; }
    .rendered-markdown h3 { font-size: 1.1em; }
    .rendered-markdown code { background: var(--vscode-textCodeBlock-background); padding: 0 4px; border-radius: 3px; }
  </style>
`;

export function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${CSS}<title>${esc(title)}</title></head><body>${body}</body></html>`;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert markdown to very basic HTML (headings, bold, code, paragraphs).
 *  Full markdown parsing is out of scope — this covers what SRS renders produce. */
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inPre = false;

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inPre) { out.push("</pre>"); inPre = false; }
      else { out.push("<pre>"); inPre = true; }
      continue;
    }
    if (inPre) { out.push(esc(raw)); continue; }

    let line = raw;
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inlineMarkdown(h[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }
    if (line.trim() === "") { out.push("<br>"); continue; }
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  return out.join("\n");
}

function inlineMarkdown(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
