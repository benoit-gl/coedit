# Text position model

**Status:** Accepted Step 3 text-position contract; carrier encoding remains a
qualification decision.

## 1. Purpose and authority

This document defines how Coedit separates Unicode text, editor positions, and
durable collaborative text positions. It supplements
[`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md), which
owns attributed-text behavior.

The document model must not invent one universal numeric character coordinate.
Text editing, durable collaboration, and interchange have different position
requirements.

## 2. Canonical text

Canonical CollaborativeContent stores Unicode text. The document model does not
prescribe UTF-8, UTF-16, or another storage encoding as document semantics.

Preserve authored Unicode text exactly. Do not silently apply NFC, NFD, or
another Unicode normalization form unless a later product rule requires it.

A storage layer, carrier, JavaScript runtime, parser, or codec can use its native
encoding. That encoding remains private to its boundary unless an interchange
format explicitly defines it.

## 3. Editing positions

The editor owns transient editing coordinates. ProseMirror, Tiptap, the browser,
or another future editor can use its native position model for selection,
composition, keyboard operations, and local transactions.

The editor and platform also own normal Unicode-aware editing behavior. Coedit
must not implement a second grapheme segmentation engine only to reinterpret a
valid editor selection. Extended grapheme clusters are the normal user-perceived
character boundary, but the editor remains the authority for its current
selection and cursor positions.

When an editor produces a valid selection, the adapter converts its endpoints to
carrier positions directly. Coedit does not independently move those endpoints
to different grapheme boundaries.

Editor positions are transient. They are not durable collaborative references
and are not portable document identities.

## 4. Durable collaborative positions

A durable live text position uses the selected carrier's stable relative-position
primitive or an equivalent opaque carrier position. Examples include a Yjs
relative position or an Automerge cursor.

The document model treats that value as opaque. It does not define durable text
positions as UTF-16 offsets, Unicode scalar-value indexes, grapheme indexes, or
another universal integer coordinate.

The carrier adapter must support these logical operations:

```text
createStableTextPosition(editorPosition, affinity) -> StableTextPosition
resolveStableTextPosition(stablePosition) -> editorPosition | unresolved
```

The exact types and encoding are carrier-private. Public detached values and the
portable format must not expose a live carrier object.

Stable positions are the primary live addressing mechanism for internal-link
range refinement and future CommentTarget ranges. Quote, prefix, suffix,
structural identity, and approximate position remain verification and repair
information. They do not replace the stable position while it resolves.

## 5. Numeric offsets at boundaries

Numeric offsets are allowed when a specific boundary requires them. The owner of
that boundary must name the unit explicitly.

For example, a JavaScript parser diagnostic can use UTF-16 source offsets if its
parser exposes UTF-16 positions. A portable fallback can use a format-defined
coordinate if that format requires one. Such offsets do not become the canonical
CollaborativeContent coordinate system.

Do not use an unqualified field name such as `offset` for a persisted or
cross-boundary numeric position when more than one unit is possible. Name or
document the unit at that boundary.

## 6. Portable and historical ranges

Carrier-native stable positions can be operational state that is not meaningful
outside the carrier instance that created them. Portable and historical range
representations must therefore retain enough carrier-neutral evidence to recover
or report the target without treating a carrier cursor as a universal document
coordinate.

For internal Block links and future comments, retain the owning Block and
InlineContent identity plus exact quote and context evidence. An approximate
position can assist repair when its coordinate and unit are defined by the
owning format.

On import or reconstruction, create new live carrier positions only after the
range resolves with the required confidence. Do not rebind an uncertain range
silently.

## 7. Qualification

Each carrier/editor candidate must prove:

- conversion from editor positions to stable carrier positions and back;
- stable range behavior through insertion, deletion, replacement, split, merge,
  undo, redo, reload, and supported compaction;
- no selection drift or endpoint corruption for combining sequences, astral
  characters, emoji sequences, variation selectors, and representative complex
  scripts;
- correct affinity at insertion boundaries;
- no requirement for a carrier-neutral numeric offset in the normal editing hot
  path; and
- practical local-edit latency without full-text coordinate rescans.

The qualification evidence must use the same position abstraction that the
production editor path uses.

## 8. Consequences

- UTF-16 is an adapter/runtime coordinate when required, not canonical document
  semantics.
- Unicode scalar-value and grapheme indexes are not universal durable Coedit
  coordinates.
- Durable live ranges use opaque carrier-stable positions.
- The editor remains the authority for transient selection and normal Unicode
  editing behavior.
- Portable repair evidence remains carrier-neutral and separate from live carrier
  position identity.
