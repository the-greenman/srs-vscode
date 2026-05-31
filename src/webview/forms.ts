// HTML form builders for SRS entity editors.
// No vscode dependency — pure string generation.

// ---- Local payload type mirrors (avoid importing from cli/types to keep this dep-free) ----

interface NoteSection {
  name: string;
  label?: string;
  content: string;
  tags?: string[];
}

export interface NoteData {
  instanceId: string;
  title: string;
  tags?: string[];
  createdAt?: string;
  sections?: NoteSection[];
}

export interface TagData {
  instanceId: string;
  slug: string;
  label?: string;
  createdAt?: string;
}

export interface RecordData {
  instanceId: string;
  typeId: string;
  typeName: string;
  typeNamespace: string;
  typeVersion: number;
  createdAt?: string;
  fieldValues: Array<{ fieldId: string; value: unknown }>;
}

export interface TypeFieldData {
  fieldId: string;
  displayLabel?: string;
  order: number;
  required: boolean;
}

// ---- HTML escape ----

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s: string): string {
  return esc(s);
}

function escText(s: string): string {
  // For textarea content — only escape < and & (not quotes)
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

// ---- Shared CSS + JS wrapper ----

const FORM_CSS = `
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 1.5em 2em;
      max-width: 800px;
    }
    h1 { font-size: 1.2em; margin-bottom: 1.2em; }
    .field { margin-bottom: 1.2em; }
    label {
      display: block;
      font-size: 0.85em;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 0.3em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    label .required-mark { color: var(--vscode-errorForeground); margin-left: 2px; }
    input[type="text"], textarea {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
    }
    input[type="text"]:focus, textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    textarea { line-height: 1.5; }
    .section-group {
      border-left: 2px solid var(--vscode-panel-border);
      padding-left: 1em;
      margin-bottom: 1.5em;
    }
    .section-group .field:last-child { margin-bottom: 0; }
    .section-header {
      display: flex;
      gap: 0.5em;
      margin-bottom: 0.4em;
      align-items: center;
    }
    .section-name-input {
      flex: 1;
      font-weight: 600;
    }
    .section-label-input { flex: 1; }
    .btn-remove-section {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
      flex-shrink: 0;
    }
    .btn-remove-section:hover { opacity: 0.7; }
    .hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 0.2em; }
    .button-row { display: flex; gap: 0.75em; margin-top: 1.5em; }
    button {
      padding: 5px 16px;
      border: none;
      border-radius: 2px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      cursor: pointer;
    }
    button[type="submit"] {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button[type="submit"]:hover { background: var(--vscode-button-hoverBackground); }
    button[type="button"] {
      background: var(--vscode-button-secondaryBackground, var(--vscode-panel-border));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
    #error-banner {
      display: none;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 0.6em 1em;
      margin-bottom: 1em;
      border-radius: 2px;
      font-size: 0.9em;
    }
    #error-banner.visible { display: block; }
  </style>
`;

// Inline JS: vscode API acquisition, form submit handler, and error message listener.
// collectFormData() is entity-specific and injected per form via data-form-type.
const FORM_JS = `
  <script>
    const vscode = acquireVsCodeApi();

    document.getElementById('editor-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const data = collectFormData();
      vscode.postMessage({ type: 'save', data });
    });

    document.getElementById('btn-cancel').addEventListener('click', function() {
      vscode.postMessage({ type: 'cancel' });
    });

    window.addEventListener('message', function(event) {
      const msg = event.data;
      if (msg.type === 'error') {
        const banner = document.getElementById('error-banner');
        banner.textContent = msg.messages.join('\\n');
        banner.classList.add('visible');
      }
    });
  </script>
`;

const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">`;

export function formWrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  ${CSP}
  ${FORM_CSS}
  <title>${esc(title)}</title>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div id="error-banner"></div>
  <form id="editor-form" novalidate>
    ${body}
    <div class="button-row">
      <button type="submit">Save</button>
      <button type="button" id="btn-cancel">Cancel</button>
    </div>
  </form>
  ${FORM_JS}
</body>
</html>`;
}

// ---- Note form ----

export function buildNoteForm(note: NoteData): string {
  const sections = note.sections ?? [];
  const tagsValue = (note.tags ?? []).join(", ");

  const sectionHtml = sections.map((s) => `
    <div class="section-group" data-section>
      <div class="field">
        <div class="section-header">
          <input type="text" class="section-name-input" placeholder="Section name (e.g. body)" value="${escAttr(s.name)}" required>
          <input type="text" class="section-label-input" placeholder="Label (optional)" value="${escAttr(s.label ?? "")}">
          <button type="button" class="btn-remove-section" title="Remove section">✕</button>
        </div>
        <textarea class="section-content-input" rows="6">${escText(s.content)}</textarea>
      </div>
    </div>`).join("");

  const collectJs = `
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const title = form.querySelector('[name="title"]').value;
      const tagsRaw = form.querySelector('[name="tags"]').value;
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      const sections = [];
      form.querySelectorAll('[data-section]').forEach(function(group) {
        const name = group.querySelector('.section-name-input').value.trim();
        const labelRaw = group.querySelector('.section-label-input').value.trim();
        const content = group.querySelector('.section-content-input').value;
        if (name) {
          sections.push({ name, label: labelRaw || undefined, content });
        }
      });
      return { instanceId, title, tags, sections, createdAt };
    }

    function addSection() {
      const container = document.getElementById('sections-container');
      const group = document.createElement('div');
      group.className = 'section-group';
      group.setAttribute('data-section', '');
      group.innerHTML =
        '<div class="field">' +
          '<div class="section-header">' +
            '<input type="text" class="section-name-input" placeholder="Section name (e.g. body)" required>' +
            '<input type="text" class="section-label-input" placeholder="Label (optional)">' +
            '<button type="button" class="btn-remove-section" title="Remove section">\\u2715</button>' +
          '</div>' +
          '<textarea class="section-content-input" rows="6"></textarea>' +
        '</div>';
      container.appendChild(group);
      group.querySelector('.section-name-input').focus();
      wireRemoveButton(group.querySelector('.btn-remove-section'));
    }

    function wireRemoveButton(btn) {
      btn.addEventListener('click', function() {
        btn.closest('[data-section]').remove();
      });
    }

    document.querySelectorAll('.btn-remove-section').forEach(wireRemoveButton);
    document.getElementById('btn-add-section').addEventListener('click', addSection);
  </script>`;

  return `
    <div class="field">
      <label>Title <span class="required-mark">*</span></label>
      <input type="text" name="title" value="${escAttr(note.title)}" required autofocus>
    </div>
    <div class="field">
      <label>Tags</label>
      <input type="text" name="tags" value="${escAttr(tagsValue)}">
      <div class="hint">Comma-separated slugs, e.g. purpose, origin</div>
    </div>
    <div id="sections-container">
      ${sectionHtml}
    </div>
    <div class="field">
      <button type="button" id="btn-add-section">+ Add Section</button>
    </div>
    <input type="hidden" name="instanceId" value="${escAttr(note.instanceId)}">
    <input type="hidden" name="createdAt" value="${escAttr(note.createdAt ?? "")}">
    ${collectJs}`;
}

// ---- Tag form ----

export function buildTagForm(tag: TagData): string {
  const collectJs = `
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const slug = form.querySelector('[name="slug"]').value.trim();
      const labelRaw = form.querySelector('[name="label"]').value.trim();
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      return { instanceId, slug, label: labelRaw || undefined, createdAt };
    }
  </script>`;

  return `
    <div class="field">
      <label>Slug <span class="required-mark">*</span></label>
      <input type="text" name="slug" value="${escAttr(tag.slug)}" required
             pattern="[a-z0-9]+(-[a-z0-9]+)*" autofocus>
      <div class="hint">Kebab-case, e.g. needs-review</div>
    </div>
    <div class="field">
      <label>Display Label</label>
      <input type="text" name="label" value="${escAttr(tag.label ?? "")}">
    </div>
    <input type="hidden" name="instanceId" value="${escAttr(tag.instanceId)}">
    <input type="hidden" name="createdAt" value="${escAttr(tag.createdAt ?? "")}">
    ${collectJs}`;
}

// ---- Record form ----

export function buildRecordForm(
  record: RecordData,
  fields: TypeFieldData[],
): string {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const currentValues = new Map<string, string>(
    record.fieldValues.map((fv) => [
      fv.fieldId,
      typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value),
    ]),
  );

  const fieldHtml = sorted.map((f, i) => {
    const label = f.displayLabel ?? f.fieldId.slice(0, 8);
    const value = currentValues.get(f.fieldId) ?? "";
    const required = f.required ? ` required` : "";
    const requiredMark = f.required
      ? ` <span class="required-mark">*</span>`
      : "";
    return `
    <div class="field">
      <label>${esc(label)}${requiredMark}</label>
      <textarea name="field_value_${i}" rows="2"${required}>${escText(value)}</textarea>
      <input type="hidden" name="field_id_${i}" value="${escAttr(f.fieldId)}">
    </div>`;
  }).join("");

  const fieldCount = sorted.length;

  const collectJs = `
  <script>
    function collectFormData() {
      const form = document.getElementById('editor-form');
      const instanceId = form.querySelector('[name="instanceId"]').value;
      const typeId = form.querySelector('[name="typeId"]').value;
      const typeName = form.querySelector('[name="typeName"]').value;
      const typeNamespace = form.querySelector('[name="typeNamespace"]').value;
      const typeVersion = parseInt(form.querySelector('[name="typeVersion"]').value, 10);
      const createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      const fieldCount = parseInt(form.querySelector('[name="fieldCount"]').value, 10);
      const fieldValues = [];
      for (let i = 0; i < fieldCount; i++) {
        const fieldId = form.querySelector('[name="field_id_' + i + '"]').value;
        const value = form.querySelector('[name="field_value_' + i + '"]').value;
        if (value.trim()) {
          fieldValues.push({ fieldId, value: value.trim() });
        }
      }
      return { instanceId, typeId, typeName, typeNamespace, typeVersion, createdAt, fieldValues };
    }
  </script>`;

  return `
    ${fieldHtml}
    <input type="hidden" name="instanceId" value="${escAttr(record.instanceId)}">
    <input type="hidden" name="typeId" value="${escAttr(record.typeId)}">
    <input type="hidden" name="typeName" value="${escAttr(record.typeName)}">
    <input type="hidden" name="typeNamespace" value="${escAttr(record.typeNamespace)}">
    <input type="hidden" name="typeVersion" value="${escAttr(String(record.typeVersion))}">
    <input type="hidden" name="createdAt" value="${escAttr(record.createdAt ?? "")}">
    <input type="hidden" name="fieldCount" value="${fieldCount}">
    ${collectJs}`;
}
