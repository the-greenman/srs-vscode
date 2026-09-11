# ADR-002: a Composition is shown as two views — Document and Source — not one fused document

- **Status:** accepted
- **Date:** 2026-09-11
- **Supersedes:** —
- **Superseded by:** —

## Context

A Composition is how an SRS repository presents as a readable document, so it is the
view a browser should lead with. Making it useful raises one question: when a reader is
looking at the rendered document and wants the record behind a paragraph, how do they
get there?

The CLI settles the shape of the answer. `render composition` returns either `rendered`
or `projection`, never both (srs-rust `render_service.rs`): `--view-format json` yields
the structured projection — every section and record with its `instanceId` — and an
empty `rendered`; every other format yields a flat string. The markdown, text, adoc and
HTML renderings carry **no record ids at all**, so nothing in a rendered document can be
turned into a link without either re-deriving the mapping client-side or asking srs-rust
to emit `data-instance-id` anchors.

Re-deriving it client-side is exactly what ADR-001 forbids. Asking for anchors upstream
is possible (a small change to `css_classes_for_record`) but it buys a fused document
the ecosystem has already decided against elsewhere: srs-web's ADR-003 separates the
render path from the editing path — the editor never calls render, and the render path
never reconstructs editable forms out of a projection.

## Decision

The composition panel offers **two views over one composition**, switched by a toggle,
never merged:

- **Document** — the core's rendered artifact, embedded verbatim (`--view-format html`
  by default; markdown, text and adoc available). It is read as a document. It has no
  click-through, because the payload has no ids to click.
- **Source** — the core's JSON projection, browsed: sections in their `order`, records
  under them by their core-resolved `recordHeading`, each one linking to that record's
  own preview beside the document.

Both views come from the same `resolve_section_instances` path in the core, so record
order is identical between them; they align at **record** granularity and never below
(the projection deliberately ignores `FieldView.visible`, so it carries fields the
rendered document does not show).

This is the rendering chain of rfc-decision-92d2da05 — Composition → Presentation →
Projection — read back out: the Document view shows the presentation, the Source view
shows the projection, and the Composition is what both are of.

## Consequences

**Positive:**
- No srs-rust change is needed, and no client-side re-derivation of headings, ordering
  or section membership (ADR-001 holds).
- The two views stay independently correct: a renderer change cannot break navigation,
  and a projection change cannot corrupt a rendered export.
- Click-through has one implementation (`srs.openEntityById` → the entity's preview,
  beside), shared with the relation graph and record previews.

**Negative / trade-offs:**
- A reader who wants "the record behind *this paragraph*" has to switch to Source and
  find it by heading, rather than clicking the paragraph.
- Two renders per composition when a user toggles, rather than one payload serving both.

**Neutral:**
- If a fused clickable document is ever wanted, the upstream ask is `data-instance-id`
  anchors on `css_classes_for_record` in srs-rust's `render_service.rs`. File it then;
  this ADR is not a bar to it, only a record that the split was chosen deliberately and
  that srs-web keeps the same separation.
