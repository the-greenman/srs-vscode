"use strict";
// HTML form builders for SRS entity editors.
// No vscode dependency — pure string generation.
Object.defineProperty(exports, "__esModule", { value: true });
exports.formWrapHtml = formWrapHtml;
exports.buildNoteForm = buildNoteForm;
exports.buildTagForm = buildTagForm;
exports.buildRecordForm = buildRecordForm;
// ---- HTML escape ----
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function escAttr(s) {
    return esc(s);
}
function escText(s) {
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
    .group-entries { display: flex; flex-direction: column; gap: 0.8em; margin-bottom: 0.6em; }
    .group-entry { border-left: 2px solid var(--vscode-panel-border); padding-left: 1em; }
    .btn-remove-group-entry {
      padding: 2px 8px;
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
      border-radius: 2px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .btn-remove-group-entry:hover { opacity: 0.7; }
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
function formWrapHtml(title, body) {
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
function buildNoteForm(note) {
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
function buildTagForm(tag) {
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
// ---- Record form (RFC-039 recursive carrier) ----
//
// Each field renders as `<div class="field" data-field="NAME" data-kind="KIND">`, where
// NAME is the fieldValues carrier key and KIND drives both rendering and client-side
// collection. Composite/list-composite fields nest the same field-div shape one level
// deeper, so a single recursive collector (collectContainer in the injected JS) rebuilds
// the whole fieldValues object regardless of nesting depth — no per-field bookkeeping.
function fmtScalar(value) {
    if (value === undefined || value === null)
        return "";
    return typeof value === "string" ? value : JSON.stringify(value);
}
function renderField(f, value) {
    const label = f.displayLabel;
    const requiredMark = f.required ? ` <span class="required-mark">*</span>` : "";
    const hint = (f.minItems != null || f.maxItems != null)
        ? `<div class="hint">Repeatable${f.minItems != null ? ` min ${f.minItems}` : ""}${f.maxItems != null ? ` max ${f.maxItems}` : ""}</div>`
        : "";
    let body;
    switch (f.kind) {
        case "enum": {
            const current = fmtScalar(value);
            const knownValues = f.enumValues ?? [];
            // A leading blank option is REQUIRED: without one, a field with no current value
            // has no <option selected>, so the browser silently auto-selects the first real
            // option — which then gets submitted as if the user chose it, corrupting an
            // unset optional field into an arbitrary one (RFC-039 "absence = unset").
            const options = [`<option value=""${current === "" ? " selected" : ""}></option>`]
                .concat(knownValues.map((v) => `<option value="${escAttr(v)}"${v === current ? " selected" : ""}>${esc(v)}</option>`))
                // A stored value outside the current enum (e.g. vocabulary drifted since this
                // record was written) would otherwise match no <option>, so the browser falls
                // back to the blank one and the value is silently dropped on save. Surface it
                // as its own selected option instead of losing it.
                .concat(current !== "" && !knownValues.includes(current)
                ? [`<option value="${escAttr(current)}" selected>${esc(current)} (not in current vocabulary)</option>`]
                : [])
                .join("");
            body = `<select class="scalar-input" data-scalar-type="string"${f.required ? " required" : ""}>${options}</select>`;
            break;
        }
        case "scalar": {
            const required = f.required ? ` required` : "";
            body = `<textarea class="scalar-input" data-scalar-type="${escAttr(f.scalarType ?? "string")}" rows="2"${required}>${escText(fmtScalar(value))}</textarea>`;
            break;
        }
        case "list-scalar": {
            const values = Array.isArray(value) ? value.map(fmtScalar) : [];
            const entries = values.map((v) => `
        <div class="repeat-entry" data-repeat-entry>
          <textarea class="repeat-value" rows="2">${escText(v)}</textarea>
          <button type="button" class="btn-remove-entry" title="Remove">✕</button>
        </div>`).join("");
            body = `
        <div class="repeat-list">${entries}</div>
        <button type="button" class="btn-add-entry" data-add="value">+ Add value</button>
        ${hint}`;
            break;
        }
        case "composite": {
            const obj = (value && typeof value === "object" && !Array.isArray(value)) ? value : {};
            const childrenHtml = (f.children ?? [])
                .map((c) => renderField(c, obj[c.name]))
                .join("");
            body = `<div class="composite-body section-group">${childrenHtml}</div>`;
            break;
        }
        case "list-composite": {
            const items = Array.isArray(value) ? value : [];
            const renderEntry = (entryValue) => `
        <div class="entry group-entry" data-entry>
          ${(f.children ?? []).map((c) => renderField(c, entryValue[c.name])).join("")}
          <button type="button" class="btn-remove-group-entry" title="Remove entry">✕ Remove</button>
        </div>`;
            const entriesHtml = items
                .map((it) => renderEntry((it && typeof it === "object") ? it : {}))
                .join("");
            // No id/data-target scheme here: a cloned <template> entry's own nested fields
            // (e.g. a repeatable child inside a repeated entry) would otherwise share ids
            // with every other clone, so every "+ Add" click resolves to the FIRST clone
            // via getElementById. Scoping is done relative to the clicked button's parent
            // field element instead (see RECORD_FORM_JS) — correct at any nesting depth and
            // for any number of clones.
            body = `
        <div class="entries group-entries">${entriesHtml}</div>
        <button type="button" class="btn-add-entry" data-add="entry">+ Add ${esc(label)}</button>
        ${hint}
        <template>${renderEntry({})}</template>`;
            break;
        }
    }
    return `
    <div class="field" data-field="${escAttr(f.name)}" data-kind="${f.kind}" data-scalar-type="${escAttr(f.scalarType ?? "string")}">
      <label>${esc(label)}${requiredMark}</label>
      ${body}
    </div>`;
}
const RECORD_FORM_JS = `
  <script>
    function directChildrenWithAttr(el, attr) {
      return Array.prototype.filter.call(el.children, function(c) { return c.hasAttribute(attr); });
    }
    // "Blank" for an object built by collectContainer means every value in it is
    // trivially empty — an empty string/array/object, or nested all the way down to
    // one. A plain key-count check misses this: a blank list-composite entry whose
    // nested list-scalar child always self-includes (see 'list-scalar' below) still
    // has a key, just an empty-array one.
    function isEffectivelyEmpty(v) {
      if (v === undefined || v === null || v === '') return true;
      if (Array.isArray(v)) return v.every(isEffectivelyEmpty);
      if (typeof v === 'object') return Object.keys(v).every(function(k) { return isEffectivelyEmpty(v[k]); });
      return false;
    }
    function coerceScalar(raw, type) {
      var trimmed = raw.trim();
      if (trimmed === '') return undefined;
      if (type === 'number' || type === 'integer') {
        var n = Number(trimmed);
        return isFinite(n) ? n : trimmed;
      }
      if (type === 'boolean') {
        // Compare against the trimmed value — every scalar renders as a plain
        // multi-line <textarea> (no dedicated checkbox widget), so a boolean field's
        // input can pick up a trailing newline/space that would otherwise defeat an
        // exact-match comparison against the untrimmed raw string.
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
      }
      if (type === 'json') {
        // A field whose value is structured (map datatype, or an inline-composite
        // that failed to expand) but has no per-field inputs — round-trip through
        // parse/stringify rather than sending the display string back as a plain
        // string, which would silently corrupt the stored object.
        try { return JSON.parse(trimmed); } catch (e) { return raw; }
      }
      // Plain string: trim leading/trailing whitespace (matches the pre-RFC-039
      // editor's behavior) — internal newlines/formatting in multi-line prose are
      // untouched, only the edges are. An untrimmed save would otherwise pick up
      // stray whitespace from the textarea and, via the concurrent-edit guard's
      // exact-value deepEqual, could even trigger a spurious "modified since you
      // opened it" warning on a later edit.
      return trimmed;
    }
    // Per-list-item coercion. Deliberately NOT coerceScalar: a blank ENTRY in a list
    // is a real value at that position (e.g. a deliberately empty table cell,
    // cells: ["Yes", "", "See note"]) — coerceScalar's "blank means unset" collapses
    // to undefined, which would have to be filtered, silently shifting every later
    // entry left and misaligning positional data. Only number/boolean/json entries
    // get type coercion; blank entries of any type are kept as-is, at their position.
    function coerceListItem(raw, type) {
      if (type === 'number' || type === 'integer') {
        var n = Number(raw.trim());
        return isFinite(n) ? n : raw;
      }
      if (type === 'boolean') {
        var t = raw.trim();
        if (t === 'true') return true;
        if (t === 'false') return false;
        return raw;
      }
      if (type === 'json') {
        var t2 = raw.trim();
        if (t2 === '') return '';
        try { return JSON.parse(t2); } catch (e) { return raw; }
      }
      return raw.trim();
    }
    function collectFieldValue(fieldEl, kind) {
      if (kind === 'scalar' || kind === 'enum') {
        var input = fieldEl.querySelector('.scalar-input');
        return coerceScalar(input.value, input.getAttribute('data-scalar-type'));
      }
      if (kind === 'list-scalar') {
        // Unlike a scalar textarea, an empty list is a meaningful, distinct value
        // (not "unset") — always send it so the CLI's own min-items validation runs,
        // and so a legitimately-empty list already on the record survives untouched.
        var itemType = fieldEl.getAttribute('data-scalar-type');
        var vals = [];
        fieldEl.querySelectorAll('.repeat-list [data-repeat-entry] .repeat-value').forEach(function(ta) {
          vals.push(coerceListItem(ta.value, itemType));
        });
        return vals;
      }
      if (kind === 'composite') {
        // Unlike a list, a single composite has no "legitimately empty but present"
        // reading — an optional composite the user left entirely blank means unset,
        // same as a blank scalar, so it must be omitted (RFC-039 absence=unset) rather
        // than sent as {}. (A required composite left blank still surfaces a real
        // validation error either way — omission just produces the clearer one.)
        var obj = collectContainer(fieldEl.querySelector('.composite-body'));
        return isEffectivelyEmpty(obj) ? undefined : obj;
      }
      if (kind === 'list-composite') {
        // Drop entries left entirely blank — e.g. "+ Add" clicked then Save without
        // filling anything in (or the per-entry Remove button not used). Without this,
        // a stray {} (or a partial object missing every field) gets submitted as a
        // real entry.
        var out = [];
        var entriesEl = fieldEl.querySelector('.entries');
        directChildrenWithAttr(entriesEl, 'data-entry').forEach(function(entryEl) {
          var obj = collectContainer(entryEl);
          if (!isEffectivelyEmpty(obj)) out.push(obj);
        });
        return out;
      }
    }
    function collectContainer(container) {
      var obj = {};
      directChildrenWithAttr(container, 'data-field').forEach(function(fieldEl) {
        var name = fieldEl.getAttribute('data-field');
        var kind = fieldEl.getAttribute('data-kind');
        var val = collectFieldValue(fieldEl, kind);
        if (val !== undefined) obj[name] = val;
      });
      return obj;
    }

    document.getElementById('editor-form').addEventListener('click', function(ev) {
      var removeEntryBtn = ev.target.closest('.btn-remove-entry');
      if (removeEntryBtn) { removeEntryBtn.closest('[data-repeat-entry]').remove(); return; }

      var removeGroupBtn = ev.target.closest('.btn-remove-group-entry');
      if (removeGroupBtn) { removeGroupBtn.closest('[data-entry]').remove(); return; }

      // Scoped relative to the clicked button's own field element, never by id — a
      // cloned entry's nested fields share no unique id with their template origin,
      // so getElementById would always resolve to the first-ever-rendered clone.
      var addRepeatBtn = ev.target.closest('.btn-add-entry[data-add="value"]');
      if (addRepeatBtn) {
        var list = addRepeatBtn.parentElement.querySelector('.repeat-list');
        var entry = document.createElement('div');
        entry.className = 'repeat-entry';
        entry.setAttribute('data-repeat-entry', '');
        entry.innerHTML = '<textarea class="repeat-value" rows="2"></textarea>' +
          '<button type="button" class="btn-remove-entry" title="Remove">\\u2715</button>';
        list.appendChild(entry);
        entry.querySelector('.repeat-value').focus();
        return;
      }

      var addEntriesBtn = ev.target.closest('.btn-add-entry[data-add="entry"]');
      if (addEntriesBtn) {
        var container = addEntriesBtn.parentElement.querySelector('.entries');
        // Direct-child only: a live existing entry may itself contain a nested
        // list-composite field with its OWN <template> deeper in the tree, which a
        // plain (descendant) querySelector('template') would find first.
        var template = addEntriesBtn.parentElement.querySelector(':scope > template');
        container.appendChild(template.content.cloneNode(true));
        return;
      }
    });

    function collectFormData() {
      var form = document.getElementById('editor-form');
      return {
        instanceId: form.querySelector('[name="instanceId"]').value,
        typeId: form.querySelector('[name="typeId"]').value,
        typeName: form.querySelector('[name="typeName"]').value,
        typeNamespace: form.querySelector('[name="typeNamespace"]').value,
        typeVersion: parseInt(form.querySelector('[name="typeVersion"]').value, 10),
        createdAt: form.querySelector('[name="createdAt"]').value || undefined,
        fieldValues: collectContainer(document.getElementById('fields-root')),
      };
    }
  </script>`;
function buildRecordForm(record, fields) {
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    const fieldsHtml = sorted.map((f) => renderField(f, record.fieldValues[f.name])).join("");
    return `
    <div id="fields-root">${fieldsHtml}</div>
    <input type="hidden" name="instanceId" value="${escAttr(record.instanceId)}">
    <input type="hidden" name="typeId" value="${escAttr(record.typeId)}">
    <input type="hidden" name="typeName" value="${escAttr(record.typeName)}">
    <input type="hidden" name="typeNamespace" value="${escAttr(record.typeNamespace)}">
    <input type="hidden" name="typeVersion" value="${escAttr(String(record.typeVersion))}">
    <input type="hidden" name="createdAt" value="${escAttr(record.createdAt ?? "")}">
    ${RECORD_FORM_JS}`;
}
//# sourceMappingURL=forms.js.map