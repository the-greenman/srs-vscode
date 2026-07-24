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

export interface RecordData {
  instanceId: string;
  typeId: string;
  typeName: string;
  typeNamespace: string;
  typeVersion: number;
  createdAt?: string;
  fieldValues: Array<{ fieldId: string; value: unknown; entries?: Array<{ value: unknown }> }>;
}

export interface TypeFieldData {
  fieldId: string;
  displayLabel?: string;
  order: number;
  required: boolean;
  repeatable?: boolean;
  minItems?: number;
  maxItems?: number;
}

// ---- Shared JS for dynamic repeat-entry lists ----
// Relies on CSS classes .repeat-list, .repeat-entry, .repeat-value, .btn-remove-entry,
// .btn-add-entry (all defined in FORM_CSS). Include once per webview.
export const REPEAT_ENTRY_JS = `
  function wireRemoveEntry(btn) {
    btn.addEventListener('click', function() {
      btn.closest('[data-repeat-entry]').remove();
    });
  }
  function addEntry(listId, rows) {
    var list = document.getElementById(listId);
    var entry = document.createElement('div');
    entry.className = 'repeat-entry';
    entry.setAttribute('data-repeat-entry', '');
    entry.innerHTML = '<textarea class="repeat-value" rows="' + (rows || 2) + '"></textarea>' +
      '<button type="button" class="btn-remove-entry" title="Remove">\\u2715</button>';
    list.appendChild(entry);
    entry.querySelector('.repeat-value').focus();
    wireRemoveEntry(entry.querySelector('.btn-remove-entry'));
  }
  document.querySelectorAll('.btn-remove-entry').forEach(wireRemoveEntry);
  document.querySelectorAll('.btn-add-entry[data-target]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      addEntry(btn.getAttribute('data-target'), parseInt(btn.getAttribute('data-rows') || '2', 10));
    });
  });
`;

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
    .repeat-list { display: flex; flex-direction: column; gap: 0.4em; margin-bottom: 0.4em; }
    .repeat-entry { display: flex; gap: 0.5em; align-items: flex-start; }
    .repeat-entry .repeat-value { flex: 1; }
    .btn-remove-entry {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .btn-remove-entry:hover { opacity: 0.7; }
    .btn-add-entry {
      padding: 3px 10px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .btn-add-entry:hover { border-color: var(--vscode-focusBorder); }
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

// ---- Record form ----

export function buildRecordForm(
  record: RecordData,
  fields: TypeFieldData[],
): string {
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  // Build maps for scalar values and entries arrays from current fieldValues
  const currentScalar = new Map<string, string>();
  const currentEntries = new Map<string, string[]>();
  for (const fv of record.fieldValues) {
    if (fv.entries && fv.entries.length > 0) {
      currentEntries.set(
        fv.fieldId,
        fv.entries.map((e) => (typeof e.value === "string" ? e.value : JSON.stringify(e.value))),
      );
    } else {
      currentScalar.set(
        fv.fieldId,
        typeof fv.value === "string" ? fv.value : JSON.stringify(fv.value),
      );
    }
  }

  const fieldHtml = sorted.map((f, i) => {
    const label = f.displayLabel ?? f.fieldId.slice(0, 8);
    const requiredMark = f.required ? ` <span class="required-mark">*</span>` : "";
    const minHint = f.minItems != null ? ` min ${f.minItems}` : "";
    const maxHint = f.maxItems != null ? ` max ${f.maxItems}` : "";
    const repeatHint = (minHint || maxHint) ? `<div class="hint">Repeatable${minHint}${maxHint}</div>` : "";

    if (f.repeatable) {
      const entries = currentEntries.get(f.fieldId) ?? (currentScalar.has(f.fieldId) ? [currentScalar.get(f.fieldId)!] : [""]);
      const entryInputs = entries.map((v) => `
        <div class="repeat-entry" data-repeat-entry>
          <textarea class="repeat-value" rows="2">${escText(v)}</textarea>
          <button type="button" class="btn-remove-entry" title="Remove">✕</button>
        </div>`).join("");
      return `
    <div class="field" data-field-index="${i}" data-repeatable>
      <label>${esc(label)}${requiredMark}</label>
      <div class="repeat-list" id="repeat-list-${i}">${entryInputs}</div>
      <button type="button" class="btn-add-entry" data-target="repeat-list-${i}">+ Add value</button>
      ${repeatHint}
      <input type="hidden" name="field_id_${i}" value="${escAttr(f.fieldId)}">
    </div>`;
    } else {
      const value = currentScalar.get(f.fieldId) ?? "";
      const required = f.required ? ` required` : "";
      return `
    <div class="field" data-field-index="${i}">
      <label>${esc(label)}${requiredMark}</label>
      <textarea name="field_value_${i}" rows="2"${required}>${escText(value)}</textarea>
      <input type="hidden" name="field_id_${i}" value="${escAttr(f.fieldId)}">
    </div>`;
    }
  }).join("");

  const fieldCount = sorted.length;
  // Encode which field indices are repeatable so collectFormData can branch
  const repeatableIndices = sorted
    .map((f, i) => (f.repeatable ? i : -1))
    .filter((i) => i >= 0);

  const collectJs = `
  <script>
    var repeatableIndices = ${JSON.stringify(repeatableIndices)};

    function collectFormData() {
      var form = document.getElementById('editor-form');
      var instanceId = form.querySelector('[name="instanceId"]').value;
      var typeId = form.querySelector('[name="typeId"]').value;
      var typeName = form.querySelector('[name="typeName"]').value;
      var typeNamespace = form.querySelector('[name="typeNamespace"]').value;
      var typeVersion = parseInt(form.querySelector('[name="typeVersion"]').value, 10);
      var createdAt = form.querySelector('[name="createdAt"]').value || undefined;
      var fieldCount = parseInt(form.querySelector('[name="fieldCount"]').value, 10);
      var fieldValues = [];
      for (var i = 0; i < fieldCount; i++) {
        var fieldId = form.querySelector('[name="field_id_' + i + '"]').value;
        if (repeatableIndices.indexOf(i) >= 0) {
          var list = form.querySelector('#repeat-list-' + i);
          var entries = [];
          list.querySelectorAll('[data-repeat-entry] .repeat-value').forEach(function(ta) {
            var v = ta.value.trim();
            if (v) entries.push({ value: v });
          });
          // Always include repeatable fields (even if empty, for min-items validation)
          fieldValues.push({ fieldId: fieldId, value: '', entries: entries });
        } else {
          var value = form.querySelector('[name="field_value_' + i + '"]').value;
          if (value.trim()) {
            fieldValues.push({ fieldId: fieldId, value: value.trim() });
          }
        }
      }
      return { instanceId: instanceId, typeId: typeId, typeName: typeName,
               typeNamespace: typeNamespace, typeVersion: typeVersion,
               createdAt: createdAt, fieldValues: fieldValues };
    }

    ${REPEAT_ENTRY_JS.trim()}
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
