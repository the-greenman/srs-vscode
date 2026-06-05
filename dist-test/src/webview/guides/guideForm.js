"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildGuideForm = buildGuideForm;
const forms_1 = require("../forms");
function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escAttr(s) { return esc(s); }
function escText(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
// ---- Section type label ----
const TYPE_LABEL = {
    text: "text",
    list: "list",
    commentary: "commentary",
    table: "table",
};
// ---- Field group renderers ----
function textField(label, name, value, opts = {}) {
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
function inputField(label, name, value, opts = {}) {
    const req = opts.required ? ` <span class="required-mark">*</span>` : "";
    const reqAttr = opts.required ? " required" : "";
    return `
    <div class="field">
      <label>${esc(label)}${req}</label>
      <input type="text" name="${escAttr(name)}" value="${escAttr(value)}"${reqAttr}>
    </div>`;
}
// ---- Section-type-specific fields ----
function textSectionFields(s, i) {
    return [
        textField("Body", `s_${i}_body`, s.body ?? "", { required: true, rows: 5 }),
        textField("Callout", `s_${i}_callout`, s.callout ?? "", { rows: 2 }),
    ].join("");
}
function listSectionFields(s, i) {
    return [
        textField("Items", `s_${i}_listItems`, s.listItems ?? "", {
            required: true,
            rows: 4,
            hint: "One item per line",
        }),
        textField("Confirmation", `s_${i}_confirmation`, s.confirmation ?? "", { rows: 2 }),
    ].join("");
}
function commentarySectionFields(s, i) {
    const items = s.commentaryItems ?? [];
    const itemsHtml = items.map((item, j) => `
    <div class="commentary-item" data-commentary-index="${j}">
      ${inputField("Term", `s_${i}_ci_${j}_term`, item.term)}
      ${textField("Body", `s_${i}_ci_${j}_body`, item.body, { rows: 3 })}
    </div>`).join("");
    const countInput = `<input type="hidden" name="s_${i}_ci_count" value="${items.length}">`;
    return `<div class="commentary-items">${itemsHtml}</div>${countInput}`;
}
function tableSectionFields(s, i) {
    return [
        textField("Intro", `s_${i}_intro`, s.intro ?? "", { rows: 3 }),
        textField("Tip", `s_${i}_tip`, s.tip ?? "", { rows: 3 }),
        textField("Note", `s_${i}_note`, s.note ?? "", { rows: 2 }),
    ].join("");
}
// ---- Section block ----
function sectionBlock(s, i) {
    const typeLabel = TYPE_LABEL[s.type];
    let typeFields = "";
    if (s.type === "text")
        typeFields = textSectionFields(s, i);
    else if (s.type === "list")
        typeFields = listSectionFields(s, i);
    else if (s.type === "commentary")
        typeFields = commentarySectionFields(s, i);
    else if (s.type === "table")
        typeFields = tableSectionFields(s, i);
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
// ---- collectFormData JS ----
const COLLECT_JS = `
<script>
function collectFormData() {
  var form = document.getElementById('editor-form');
  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }
  function vals(prefix) {
    var out = {};
    form.querySelectorAll('[name^="' + prefix + '"]').forEach(function(el) {
      var key = el.name.slice(prefix.length);
      out[key] = el.value;
    });
    return out;
  }

  var guide = {
    containerId: val('containerId'),
    guideInstanceId: val('guideInstanceId'),
    guideTypeId: val('guideTypeId'),
    guideTypeVersion: parseInt(val('guideTypeVersion'), 10),
    slug: val('guide_slug'),
    title: val('guide_title'),
    subtitle: val('guide_subtitle'),
    intro: val('guide_intro'),
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
      section.listItems = val('s_' + i + '_listItems');
      section.confirmation = val('s_' + i + '_confirmation');
    } else if (type === 'commentary') {
      var ciCount = parseInt(val('s_' + i + '_ci_count'), 10);
      section.commentaryItems = [];
      for (var j = 0; j < ciCount; j++) {
        section.commentaryItems.push({
          term: val('s_' + i + '_ci_' + j + '_term'),
          body: val('s_' + i + '_ci_' + j + '_body'),
        });
      }
    } else if (type === 'table') {
      section.intro = val('s_' + i + '_intro');
      section.tip = val('s_' + i + '_tip');
      section.note = val('s_' + i + '_note');
    }
    guide.sections.push(section);
  }
  return guide;
}
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
  .commentary-item { border-left: 2px solid var(--vscode-panel-border); padding-left: 0.8em; margin-bottom: 0.8em; }
  .sections-heading {
    font-size: 1em; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vscode-descriptionForeground); font-weight: 600; margin: 0 0 0.8em;
  }
</style>`;
// ---- Main form builder ----
function buildGuideForm(guide) {
    const sectionsHtml = guide.sections.map((s, i) => sectionBlock(s, i)).join("");
    const body = `
    ${GUIDE_CSS}
    <div class="guide-meta">
      <h2>Guide</h2>
      ${inputField("Title", "guide_title", guide.title, { required: true })}
      ${inputField("Subtitle", "guide_subtitle", guide.subtitle)}
      ${textField("Intro", "guide_intro", guide.intro, { rows: 4 })}
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
    ${COLLECT_JS}`;
    return (0, forms_1.formWrapHtml)(guide.title, body);
}
//# sourceMappingURL=guideForm.js.map