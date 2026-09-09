# Text position model

**Status:** Accepted `application/vnd.coedit.text` position contract; Step 3 qualifies carrier
behavior and Step 6 selects the durable Range representation.

## 1. Purpose and authority

This document defines how Coedit separates Unicode text, editor positions, and
durable collaborative positions inside an `application/vnd.coedit.text` payload. It supplies
position primitives to [`RANGE_MODEL.md`](RANGE_MODEL.md), which owns durable
`application/vnd.coedit.text` Range behavior, and supplements
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), which
owns attributed-text behavior. [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md)
owns the broader InlineContent payload boundary.

The document model must not invent one universal numeric character coordinate.
Text editing, durable collaboration, and interchange have different position
requirements. Generic opaque payloads have no internal text-position contract.

## 2. Canonical text

An `application/vnd.coedit.text` payload stores Unicode text. The document model does not
prescribe UTF-8, UTF-16, or another storage encoding as document semantics.

Preserve authored Unicode text exactly. Do not silently apply NFC, NFD, or
another Unicode normalization form unless a later product rule requires it.
Line-feed, carriage-return, and other characters are text data at this layer;
there is no separate canonical hard-break position unit.

A storage layer, carrier, JavaScript runtime, parser, or codec can use its native
encoding. That encoding remains private to its boundary unless an interchange
format explicitly defines it.

A Block or InlineContent boundary is not a text position and inserts no character
into the payload. Structural traversal and text coordinates remain separate.

## 3. Editing positions

The `application/vnd.coedit.text` editor owns transient editing coordinates. ProseMirror, Tiptap,
the browser, or another future text editor can use its native position model for
selection, composition, keyboard operations, and local transactions.

The editor and platform also own normal Unicode-aware editing behavior. Coedit
must not implement a second grapheme segmentation engine only to reinterpret a
valid editor selection. Extended grapheme clusters are the normal user-perceived
character boundary, but the editor remains the authority for its current
selection and cursor positions.

When an editor produces a valid selection, the adapter converts its endpoints to
carrier positions directly. Coedit does not independently move those endpoints
to different grapheme boundaries.

An editor can translate application intent such as a line break into an ordinary
text character or translate paragraph intent into structural operations. That
mapping does not create a second document-level break coordinate.

Editor positions are transient. They are not durable collaborative references
and are not portable document identities.

## 4. Durable collaborative positions

A durable live position inside `application/vnd.coedit.text` uses the selected carrier's stable
relative-position primitive or an equivalent opaque carrier position. Examples
include a Yjs relative position or an Automerge cursor.

The document model treats that value as opaque. It does not define durable text
positions as UTF-16 offsets, Unicode scalar-value indexes, grapheme indexes, or
another universal integer coordinate.

The carrier adapter must support these logical operations:

```text
createStableTextPosition(editorPosition, affinity) -> StableTextPosition
resolveStableTextPosition(stablePosition) -> editorPosition | unresolved
```

The target InlineContent must have an `application/vnd.coedit.text` payload. Asking for a text
position inside opaque content is invalid under this contract.

The exact types and encoding are carrier-private. Public detached values and the
portable format must not expose a live carrier object.

Stable positions are one candidate primitive for live Range tracking. They are
not the Range API, semantic-order representation, or portable serialized Range.
The Step 3 carrier gate qualifies their behavior. The Step 6 Range gate decides
how carrier positions combine with carrier-neutral verification and lineage
evidence, including the still-open whole-payload replacement of `application/vnd.coedit.text` cases.

## 5. Numeric offsets at boundaries

Numeric offsets are allowed when a specific boundary requires them. The owner of
that boundary must name the unit explicitly.

For example, a JavaScript parser diagnostic can use UTF-16 source offsets if its
parser exposes UTF-16 positions. A portable fallback can use a format-defined
coordinate if that format requires one. Such offsets do not become the canonical
`application/vnd.coedit.text` coordinate system.

Do not use an unqualified field name such as `offset` for a persisted or
cross-boundary numeric position when more than one unit is possible. Name or
document the unit at that boundary.

## 6. Portable and historical Range positions

Carrier-native stable positions can be operational state that is not meaningful
outside the carrier instance that created them. A serialized Range must therefore
retain enough carrier-neutral evidence to recover or report its semantic text
target without treating a carrier cursor as a universal document coordinate.

One Range can refer to several semantic spans across Blocks and `application/vnd.coedit.text`
InlineContents. No portable position rule in this document reduces that Range to
one owning InlineContent or one start/end pair. `RANGE_MODEL.md` owns the
document-relative Range-fragment contract, creation and lineage order, rebasing,
and omission behavior.

Generic opaque InlineContents remain addressable as document entities by
`InlineContentId`; this document does not create byte offsets or opaque-payload subregion
Range semantics for them.

On parse or reconstruction, create new live carrier positions only after the
Range service resolves the required evidence. Omit an unresolved, non-text, or
ambiguous member; do not rebind it by similarity.

## 7. Qualification

Each carrier/editor candidate must prove:

- conversion from `application/vnd.coedit.text` editor positions to stable carrier positions and back;
- explicit rejection of position creation against an opaque payload;
- the Step 3 Range-position feasibility cases through insertion, deletion,
  replacement, split, merge, move, undo, redo, whole-payload replacement of `application/vnd.coedit.text`
  feasibility, reload, and supported compaction;
- no selection drift or endpoint corruption for combining sequences, astral
  characters, emoji sequences, variation selectors, newline characters, and
  representative complex scripts;
- correct affinity at insertion boundaries;
- no requirement for a carrier-neutral numeric offset in the normal editing hot
  path; and
- practical local-edit latency without full-text coordinate rescans.

The qualification evidence must use the same position abstraction that the
production `application/vnd.coedit.text` editor path uses.

## 8. Consequences

- UTF-16 is an adapter/runtime coordinate when required, not canonical document
  semantics.
- Unicode scalar-value and grapheme indexes are not universal durable Coedit
  coordinates.
- Durable live `application/vnd.coedit.text` Range tracking can use opaque carrier-stable
  positions behind the engine service.
- The text editor remains the authority for transient selection and normal
  Unicode editing behavior.
- Portable text Range evidence remains carrier-neutral and separate from live
  carrier position identity.
- Generic opaque payloads do not gain a byte-position or sub-content Range model merely
  because `application/vnd.coedit.text` has one.
- `RANGE_MODEL.md` owns multi-span text behavior and does not expose a live
  carrier object as the public Range representation.
