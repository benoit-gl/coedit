# ADR 0006: Text position ownership

**Status:** Accepted

**Date:** 2026-09-01

**Amended:** 2026-09-06

## Context

Collaborative rich text needs fast editor operations and durable references that
survive concurrent edits. JavaScript and ProseMirror can expose numeric positions
that follow their own runtime or document models. Yjs and Automerge also provide
stable relative-position mechanisms.

Making one numeric unit, such as UTF-16 code units, Unicode scalar values, or
grapheme indexes, the universal Coedit coordinate would couple document semantics
to one boundary and require conversion in the editing hot path.

Unicode editing behavior is also established platform and editor behavior. Coedit
must not create a second text-segmentation authority that can disagree with a
valid editor selection.

## Decision

Canonical CollaborativeContent stores Unicode text without prescribing a storage
encoding as document semantics.

Use editor-native positions for transient editing. Durable references use the
carrier-neutral Range service. A private Range-tracking implementation can use
carrier-native stable relative positions as one primitive, but this ADR does not
select the Range-tracking representation. Treat any carrier-native stable
positions as opaque outside the carrier adapter.

Do not define a universal carrier-neutral numeric character coordinate. Numeric
offsets are allowed at boundaries that need them, but the boundary must define
their unit.

Do not independently adjust a valid editor selection to Coedit-computed grapheme
boundaries. The editor owns transient selection and normal Unicode editing
behavior.

Preserve authored Unicode text without silent normalization.

Portable and historical Range recovery uses the creation Version, original Block
and InlineContent identities, and the carrier-neutral lineage and verification
evidence selected at Gate C. It does not assume that a live carrier cursor is a
universal portable coordinate or bind an unresolved member by text similarity.

## Rationale

This design keeps keystroke-critical operations in the editor's native position
model while allowing the Range implementation to use established carrier
position machinery when qualification supports it. It avoids unnecessary
full-text coordinate conversion, avoids two authorities for cursor and selection
behavior, and leaves the durable Range-tracking representation to Gate C.

## Consequences

- UTF-16 can remain a JavaScript or parser boundary detail without becoming
  canonical document semantics.
- Durable internal-link and future comment Ranges can use stable carrier
  positions behind the Range service without requiring them as the complete
  Range-tracking representation.
- Qualification must test complex Unicode selections and stable-position
  conversion through editing and reload when a candidate uses that primitive.
- Portable recovery needs carrier-neutral lineage and verification evidence in
  addition to any live carrier positions used by the selected representation.

## Authority

[`../TEXT_POSITION_MODEL.md`](../TEXT_POSITION_MODEL.md) owns the detailed
coordinate and carrier-position boundary contract. [`../RANGE_MODEL.md`](../RANGE_MODEL.md)
owns durable Range behavior and the Gate C representation decision.
[`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
owns attributed-text behavior.
