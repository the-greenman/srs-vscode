import { formWrapHtml } from "../forms";
import { GuideDoc, GuideTableBlock, SectionDoc, SectionType } from "./guideTypes";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s: string): string { return esc(s); }
function escText(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

// ---- Section type label ----

const TYPE_LABEL: Record<SectionType, string> = {
  text:  "text",
  list:  "list",
  table: "table",
};

// ---- Field group renderers ----

function textField(
  label: string,
  name: string,
  value: string,
  opts: { required?: boolean; rows?: number; hint?: string } = {},
): string {
  const req = opts.required ? ` <span class="required-mark">*</span>` : "";
  const reqAttr = opts.required ? " required" : "";
  const rows = opts.rows ?? 2;
  const hint = opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : "";
  return `
    <div class="field">
      <label>${esc(label)}${req}</label>
      <textarea name="${escAttr(name)}" rows="${rows}"${reqAttr}>${escText(value)}</textarea>
      ${hint}
    </div>`;
}

function inputField(
  label: string,
  name: string,
  value: string,
  opts: { required?: boolean } = {},
): string {
  const req = opts.required ? ` <span class="required-mark">*</span>` : "";
  const reqAttr = opts.required ? " required" : "";
  return `
    <div class="field">
      <label>${esc(label)}${req}</label>
      <input type="text" name="${escAttr(name)}" value="${escAttr(value)}"${reqAttr}>
    </div>`;
}

// ---- Section-type-specific fields ----

function textSectionFields(s: SectionDoc, i: number): string {
  return [
    textField("Body", `s_${i}_body`, s.body ?? "", { required: true, rows: 5 }),
    textField("Callout", `s_${i}_callout`, s.callout ?? "", { rows: 2 }),
  ].join("");
}

function listSectionFields(s: SectionDoc, i: number): string {
  return [
    textField("Body", `s_${i}_body`, s.body ?? "", { rows: 3 }),
    textField("Items", `s_${i}_listItems`, s.listItems ?? "", {
      required: true,
      rows: 4,
      hint: "One item per line",
    }),
    textField("Outro", `s_${i}_outro`, s.outro ?? "", { rows: 2 }),
  ].join("");
}

function itemEntryHtml(term: string, body: string): string {
  return `
    <div class="section-group" data-item-entry>
      <div class="section-header">
        <span style="flex:1;font-size:0.8em;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.05em">Item</span>
        <button type="button" class="btn-remove-section" title="Remove item">✕</button>
      </div>
      <div class="field">
        <label>Term <span style="font-weight:400;text-transform:none">(optional)</span></label>
        <input type="text" class="item-term" placeholder="e.g. Why" value="${escAttr(term)}">
      </div>
      <div class="field">
        <label>Body</label>
        <textarea class="item-body" rows="3">${escText(body)}</textarea>
      </div>
    </div>`;
}

function tableBlockHtml(t: GuideTableBlock, si: number, ti: number): string {
  const cols = t.columns ?? [];
  const colCount = cols.length > 0 ? cols.length : (t.rows.length > 0 ? t.rows[0].length : 2);
  const headerHtml = cols.length > 0
    ? `<thead><tr>${cols.map((c) => `<th><input type="text" class="te-col-header" value="${escAttr(c)}" placeholder="Header"></th>`).join("")}<th class="te-action-col"></th></tr></thead>`
    : "";
  const bodyHtml = (t.rows ?? []).map((row) =>
    `<tr>${row.map((cell) => `<td><input type="text" class="te-cell" value="${escAttr(cell)}"></td>`).join("")}<td class="te-action-col"><button type="button" class="btn-remove-row" title="Remove row">✕</button></td></tr>`,
  ).join("");
  return `
    <div class="table-block" data-table-section="${si}" data-table-idx="${ti}" data-col-count="${colCount}">
      <div class="table-block-meta">
        <div class="field">
          <label>Subheading <span style="font-weight:400;text-transform:none">(optional)</span></label>
          <input type="text" class="te-subheading" value="${escAttr(t.subheading ?? "")}">
        </div>
        <div class="field">
          <label>Label <span style="font-weight:400;text-transform:none">(optional, shown above the table)</span></label>
          <textarea class="te-label" rows="2">${escText(t.label ?? "")}</textarea>
        </div>
      </div>
      <div class="te-table-wrap">
        <table class="te-table">
          ${headerHtml}
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
      <button type="button" class="btn-add-row">+ Add row</button>
    </div>`;
}

function tableSectionFields(s: SectionDoc, i: number): string {
  const tables = s.tables ?? [];
  const tableBlocksHtml = tables.map((t, ti) => tableBlockHtml(t, i, ti)).join("");
  const items = s.items ?? [];
  const itemEntries = items.map((item) => itemEntryHtml(item.term ?? "", item.body)).join("");
  const itemBlock = `
    <div class="field">
      <label>Items</label>
      <div id="items-list-${i}">${itemEntries}</div>
      <button type="button" class="btn-add-entry" data-items-section="${i}">+ Add item</button>
    </div>`;
  return [
    textField("Body", `s_${i}_body`, s.body ?? "", { rows: 3 }),
    `<div class="field"><label>Tables</label><div class="table-blocks" id="table-blocks-${i}">${tableBlocksHtml}</div><button type="button" class="btn-add-entry btn-add-table" data-table-section="${i}">+ Add table</button></div>`,
    itemBlock,
    textField("Outro", `s_${i}_outro`, s.outro ?? "", { rows: 2 }),
  ].join("");
}

// ---- Section block ----

function sectionBlock(s: SectionDoc, i: number): string {
  const typeLabel = TYPE_LABEL[s.type];

  let typeFields = "";
  if (s.type === "text")       typeFields = textSectionFields(s, i);
  else if (s.type === "list")  typeFields = listSectionFields(s, i);
  else if (s.type === "table") typeFields = tableSectionFields(s, i);

  return `
    <div class="section-block" data-section-index="${i}">
      <div class="section-block-header">
        <span class="section-type-badge">${esc(typeLabel)}</span>
      </div>
      ${inputField("Heading", `s_${i}_heading`, s.heading, { required: true })}
      ${inputField("Slug (id)", `s_${i}_slug`, s.slug)}
      ${typeFields}
      <input type="hidden" name="s_${i}_instanceId" value="${escAttr(s.instanceId)}">
      <input type="hidden" name="s_${i}_typeId" value="${escAttr(s.typeId)}">
      <input type="hidden" name="s_${i}_typeVersion" value="${escAttr(String(s.typeVersion))}">
      <input type="hidden" name="s_${i}_type" value="${escAttr(s.type)}">
    </div>`;
}

// ---- collectFormData + dynamic wiring JS ----

const GUIDE_JS = `
<script>
function collectFormData() {
  var form = document.getElementById('editor-form');
  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }

  var guide = {
    containerId: val('containerId'),
    guideInstanceId: val('guideInstanceId'),
    guideTypeId: val('guideTypeId'),
    guideTypeVersion: parseInt(val('guideTypeVersion'), 10),
    slug: val('guide_slug'),
    title: val('guide_title'),
    subtitle: val('guide_subtitle'),
    body: val('guide_body'),
    sections: [],
  };

  var sectionCount = parseInt(val('sectionCount'), 10);
  for (var i = 0; i < sectionCount; i++) {
    var type = val('s_' + i + '_type');
    var section = {
      instanceId: val('s_' + i + '_instanceId'),
      typeId: val('s_' + i + '_typeId'),
      typeVersion: parseInt(val('s_' + i + '_typeVersion'), 10),
      type: type,
      heading: val('s_' + i + '_heading'),
      slug: val('s_' + i + '_slug'),
    };
    if (type === 'text') {
      section.body = val('s_' + i + '_body');
      section.callout = val('s_' + i + '_callout');
    } else if (type === 'list') {
      section.body = val('s_' + i + '_body');
      section.listItems = val('s_' + i + '_listItems');
      section.outro = val('s_' + i + '_outro');
    } else if (type === 'table') {
      section.body = val('s_' + i + '_body');
      section.outro = val('s_' + i + '_outro');
      section.tables = [];
      document.querySelectorAll('[data-table-section="' + i + '"]').forEach(function(tb) {
        var subheading = tb.querySelector('.te-subheading').value.trim();
        var label = tb.querySelector('.te-label').value.trim();
        var columns = [];
        tb.querySelectorAll('thead .te-col-header').forEach(function(inp) { columns.push(inp.value); });
        var rows = [];
        tb.querySelectorAll('tbody tr').forEach(function(tr) {
          var row = [];
          tr.querySelectorAll('.te-cell').forEach(function(inp) { row.push(inp.value); });
          rows.push(row);
        });
        var tbl = { columns: columns, rows: rows };
        if (subheading) tbl.subheading = subheading;
        if (label) tbl.label = label;
        section.tables.push(tbl);
      });
      section.items = [];
      var itemsList = document.getElementById('items-list-' + i);
      itemsList.querySelectorAll('[data-item-entry]').forEach(function(entry) {
        var body = entry.querySelector('.item-body').value.trim();
        if (!body) return;
        var term = entry.querySelector('.item-term').value.trim();
        section.items.push({ term: term || undefined, body: body });
      });
    }
    guide.sections.push(section);
  }
  return guide;
}

// Wire existing item remove buttons
document.querySelectorAll('[data-item-entry] .btn-remove-section').forEach(function(btn) {
  btn.addEventListener('click', function() { btn.closest('[data-item-entry]').remove(); });
});

// Wire item add buttons
document.querySelectorAll('.btn-add-entry[data-items-section]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var si = btn.getAttribute('data-items-section');
    var list = document.getElementById('items-list-' + si);
    var div = document.createElement('div');
    div.className = 'section-group';
    div.setAttribute('data-item-entry', '');
    div.innerHTML =
      '<div class="section-header">' +
        '<span style="flex:1;font-size:0.8em;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:0.05em">Item</span>' +
        '<button type="button" class="btn-remove-section" title="Remove item">\\u2715</button>' +
      '</div>' +
      '<div class="field"><label>Term <span style="font-weight:400;text-transform:none">(optional)</span></label>' +
        '<input type="text" class="item-term" placeholder="e.g. Why"></div>' +
      '<div class="field"><label>Body</label><textarea class="item-body" rows="3"></textarea></div>';
    list.appendChild(div);
    div.querySelector('.item-term').focus();
    div.querySelector('.btn-remove-section').addEventListener('click', function() { div.remove(); });
  });
});

// Table editor — event delegation handles all table buttons, including on dynamically added rows/tables
document.addEventListener('click', function(e) {
  var btn = e.target;
  if (!btn || btn.tagName !== 'BUTTON') return;
  if (btn.classList.contains('btn-remove-row')) {
    btn.closest('tr').remove();
  } else if (btn.classList.contains('btn-add-row')) {
    var addTb = btn.closest('[data-table-section]');
    var cols = addTb.querySelectorAll('thead .te-col-header').length;
    if (!cols) {
      var fr = addTb.querySelector('tbody tr');
      if (fr) cols = fr.querySelectorAll('.te-cell').length;
    }
    if (!cols) cols = 2;
    var addBody = addTb.querySelector('tbody');
    var newTr = document.createElement('tr');
    for (var c = 0; c < cols; c++) {
      var newTd = document.createElement('td');
      var newInp = document.createElement('input');
      newInp.type = 'text';
      newInp.className = 'te-cell';
      newTd.appendChild(newInp);
      newTr.appendChild(newTd);
    }
    var actTd = document.createElement('td');
    actTd.className = 'te-action-col';
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-remove-row';
    delBtn.title = 'Remove row';
    delBtn.textContent = '\\u2715';
    actTd.appendChild(delBtn);
    newTr.appendChild(actTd);
    addBody.appendChild(newTr);
    newTr.querySelector('.te-cell').focus();
  } else if (btn.classList.contains('btn-add-table')) {
    var tsi = btn.getAttribute('data-table-section');
    var tblContainer = document.getElementById('table-blocks-' + tsi);
    var newTi = tblContainer.querySelectorAll('[data-table-section]').length;
    var newBlock = document.createElement('div');
    newBlock.className = 'table-block';
    newBlock.setAttribute('data-table-section', tsi);
    newBlock.setAttribute('data-table-idx', String(newTi));
    newBlock.setAttribute('data-col-count', '2');
    newBlock.innerHTML =
      '<div class="table-block-meta">' +
        '<div class="field"><label>Subheading <span style="font-weight:400;text-transform:none">(optional)</span></label>' +
          '<input type="text" class="te-subheading"></div>' +
        '<div class="field"><label>Label <span style="font-weight:400;text-transform:none">(optional, shown above the table)</span></label>' +
          '<textarea class="te-label" rows="2"></textarea></div>' +
      '</div>' +
      '<div class="te-table-wrap"><table class="te-table">' +
        '<thead><tr>' +
          '<th><input type="text" class="te-col-header" placeholder="Header"></th>' +
          '<th><input type="text" class="te-col-header" placeholder="Header"></th>' +
          '<th class="te-action-col"></th>' +
        '</tr></thead>' +
        '<tbody><tr>' +
          '<td><input type="text" class="te-cell"></td>' +
          '<td><input type="text" class="te-cell"></td>' +
          '<td class="te-action-col"><button type="button" class="btn-remove-row" title="Remove row">\\u2715</button></td>' +
        '</tr></tbody>' +
      '</table></div>' +
      '<button type="button" class="btn-add-row">+ Add row</button>';
    tblContainer.appendChild(newBlock);
    newBlock.querySelector('.te-col-header').focus();
  }
});


</script>`;

// ---- Extra CSS for section blocks ----

const GUIDE_CSS = `
<style>
  .guide-meta { margin-bottom: 2em; }
  .guide-meta h2 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em; }
  .sections-list { display: flex; flex-direction: column; gap: 1.5em; }
  .section-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 1em;
  }
  .section-block-header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.8em;
  }
  .section-type-badge {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    padding: 1px 6px;
  }
  .sections-heading {
    font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em;
  }
  .table-blocks { display: flex; flex-direction: column; gap: 0.8em; }
  .table-block {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    padding: 0.8em;
  }
  .table-block-meta {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 0 0.8em;
    margin-bottom: 0.6em;
  }
  .table-block-meta .field { margin-bottom: 0.6em; }
  .te-table-wrap { overflow-x: auto; margin-bottom: 0.5em; }
  .te-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .te-table th, .te-table td {
    border: 1px solid var(--vscode-panel-border);
    padding: 1px;
    vertical-align: middle;
  }
  .te-table th {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.07));
  }
  .te-table .te-col-header,
  .te-table .te-cell {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 3px 6px !important;
    outline: none !important;
    min-width: 80px;
    width: 100%;
  }
  .te-table .te-col-header { font-weight: 600; }
  .te-table .te-col-header:focus,
  .te-table .te-cell:focus {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.1)) !important;
  }
  .te-action-col {
    width: 24px;
    min-width: 24px;
    padding: 0 !important;
    text-align: center;
    border-left: none !important;
  }
  .btn-remove-row {
    background: none;
    border: none;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    padding: 2px 4px;
    opacity: 0.45;
    font-size: 0.75em;
    line-height: 1;
  }
  .btn-remove-row:hover { opacity: 1; }
  .btn-add-row {
    background: none;
    border: 1px dashed var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 3px 10px;
    border-radius: 2px;
    font-size: 0.8em;
    width: 100%;
    text-align: left;
  }
  .btn-add-row:hover {
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-foreground);
  }
</style>`;

// ---- Main form builder ----

export function buildGuideForm(guide: GuideDoc): string {
  const sectionsHtml = guide.sections.map((s, i) => sectionBlock(s, i)).join("");

  const body = `
    ${GUIDE_CSS}
    <div class="guide-meta">
      <h2>Guide</h2>
      ${inputField("Title", "guide_title", guide.title, { required: true })}
      ${inputField("Subtitle", "guide_subtitle", guide.subtitle)}
      ${textField("Body", "guide_body", guide.body, { rows: 4 })}
    </div>
    <p class="sections-heading">Sections (${guide.sections.length})</p>
    <div class="sections-list">
      ${sectionsHtml}
    </div>
    <input type="hidden" name="containerId" value="${escAttr(guide.containerId)}">
    <input type="hidden" name="guideInstanceId" value="${escAttr(guide.guideInstanceId)}">
    <input type="hidden" name="guideTypeId" value="${escAttr(guide.guideTypeId)}">
    <input type="hidden" name="guideTypeVersion" value="${escAttr(String(guide.guideTypeVersion))}">
    <input type="hidden" name="guide_slug" value="${escAttr(guide.slug)}">
    <input type="hidden" name="sectionCount" value="${guide.sections.length}">
    ${GUIDE_JS}`;

  return formWrapHtml(guide.title, body);
}
