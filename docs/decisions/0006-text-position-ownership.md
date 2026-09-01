# ADR 0006: Text position ownership

**Status:** Accepted

**Date:** 2026-09-01

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

Use editor-native positions for transient editing. Use carrier-native stable
relative positions for durable live collaborative references. Treat those stable
positions as opaque outside the carrier adapter.

Do not define a universal carrier-neutral numeric character coordinate. Numeric
offsets are allowed at boundaries that need them, but the boundary must define
their unit.

Do not independently adjust a valid editor selection to Coedit-computed grapheme
boundaries. The editor owns transient selection and normal Unicode editing
behavior.

Preserve authored Unicode text without silent normalization.

Portable and historical range recovery uses carrier-neutral structural identity,
quote, context, and explicitly defined approximate-position evidence. It does not
assume that a live carrier cursor is a universal portable coordinate.

## Rationale

This design keeps keystroke-critical operations in the editor's native position
model and uses the collaboration system's established stable-position machinery
for durable references. It avoids unnecessary full-text coordinate conversion
and avoids two authorities for cursor and selection behavior.

## Consequences

- UTF-16 can remain a JavaScript or parser boundary detail without becoming
  canonical document semantics.
- Durable internal-link and future comment ranges use stable carrier positions.
- Qualification must test complex Unicode selections and stable-position
  conversion through editing and reload.
- Portable recovery needs carrier-neutral repair evidence in addition to live
  carrier positions.

## Authority

[`../TEXT_POSITION_MODEL.md`](../TEXT_POSITION_MODEL.md) owns the detailed
contract. [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md)
owns attributed-text behavior.
