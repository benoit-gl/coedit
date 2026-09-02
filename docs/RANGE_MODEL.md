# Durable Range model

**Status:** Accepted behavioral contract; the lineage representation and the
remaining Step 6 API decisions are unresolved.

## 1. Purpose and authority

This document defines durable text Range behavior across text edits, structural
changes, Version materialization, and serialization. It defines observable
semantics and the required engine service boundary. It does not select the
private representation used to track content lineage.

`PRODUCT_DOMAIN_MODEL.md` controls product meaning. `MVP_ARCHITECTURE.md`
controls the public engine boundary. `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns
formatting, Origin, link, and comment behavior outside this Range contract.
`TEXT_POSITION_MODEL.md` owns editor and carrier position boundaries.
`SCAFFOLDING_PLAN.md` owns the implementation order and decision gates.

A Range is a durable reference value, not a document entity. A comment can keep
the value in an external record. An intrinsic internal-link mark can embed the
value in canonical content. Neither use creates a Range registry, independent
Range identity, or a document-owned table of retained references.

## 2. Terms

Use these terms consistently:

- **Range:** one durable semantic reference to authored text or to one logical
  position.
- **Span Range:** a Range whose semantic content can contain text and can resolve
  to one or more current spans.
- **Positional Range:** an explicitly positional, zero-length Range.
- **Resolved span:** one current contiguous text interval returned when a Span
  Range resolves.
- **Semantic order:** the order of the material represented by a Range. It is
  independent of current Block tree order.
- **Range holder:** a comment, link, navigation record, or another feature that
  stores or embeds a Range value.
- **Range-tracking lineage:** the private mechanism that lets a Range follow
  content through edits, split, merge, move, copy-like transformations, and
  carrier changes. It is not Origin provenance or Contribution derivation.

## 3. Ownership, scope, and cost

The engine provides Range creation, resolution, transformation, parsing, and
serialization behavior. A Range holder controls where the value is stored.

The canonical document model has no Range entity, Range table, or authoritative
registry of all Range holders. Document mutations must not scan or rewrite every
retained Range. The cost of an ordinary edit or Block move must not grow with the
total number of comments, links, or other retained Range values.

Live Range operations run against one selected document engine and one selected
Version. A Range must never bind to another document, Block, or InlineContent
only because an identifier, quote, or context value is coincidentally equal.

The Step 6 Range gate must decide how document identity and Version context appear
in an absolute URI and in a document-relative URI suffix. That wire decision does
not change the no-silent-rebinding rule.

## 4. Required logical service boundary

The engine must provide the behavioral equivalent of these operations. Exact
names and TypeScript shapes are finalized in Step 6:

```text
createSpanRange(selectedVersion, spans) -> Range | RangeError
createPositionalRange(selectedVersion, position) -> Range | RangeError
resolveRange(range, selectedVersion) -> RangeResolution | RangeError
serializeRange(range, selectedVersion) -> SerializedRange | RangeError
parseRange(serializedRange, documentContext?) -> Range | RangeError
```

`createSpanRange` accepts one or several source spans directly. Multi-span input
is a normal creation form. It is not only a degraded state caused by later
edits.

`resolveRange` returns every current resolved span independently and in Range
semantic order. Its result must distinguish a valid Span Range whose current
text is empty from uncertainty or failure. The final result taxonomy and error
names are Step 6 decisions.

`serializeRange` is a non-mutating rebase against the selected Version.
`parseRange` must accept every representation emitted by the same supported
format version. A freshly serialized and parsed Range must identify the same
semantic target in the selected Version or report the same explicit uncertainty.

Before the Step 6 Range gate closes, specify input ordering, overlap, adjacency,
duplicate-span, zero-length-span, stale-input, and cross-Version validation.
Do not let one adapter freeze those rules accidentally.

## 5. Span Range behavior

A Span Range has an immutable `span` kind. Its kind does not change because its
current resolved text becomes empty.

A Span Range is greedy at both boundaries:

1. Text inserted at either boundary joins the Range.
2. A replacement that touches or crosses a boundary contributes its replacement
   material to the Range according to the same greedy rule.
3. Deleting all currently resolved characters does not convert the Range to a
   Positional Range.
4. Correct behavior must not depend on whether an editor reports replacement as
   one replace operation or as delete followed by insert.

A Span Range can resolve to zero, one, or several spans. Structural and text
operations can increase or decrease that count.

Several resolved spans can exist in one InlineContent. For example, a merge can
place included material, excluded material, and included material in one current
InlineContent. Resolution must preserve the two included spans instead of
expanding across the excluded material.

## 6. Positional Range behavior

A Positional Range has an immutable `position` kind. It is zero-length and
non-greedy.

A Positional Range is preceding-sticky in logical text order. `Preceding` does
not mean visual left and does not depend on writing direction.

Stickiness is local to the Range's current Block and InlineContent. Emptying that
content does not by itself migrate the position to a preceding Block. An explicit
structural operation, such as a merge whose contract translates positions into a
surviving content container, can move the position to another container.

The Step 6 Range gate must define the result when a structural split occurs
exactly at a Positional Range and when the owning InlineContent is deleted,
replaced, or merged. Candidate qualification in Step 3 must prove that the
carrier does not prevent the required Block-local behavior.

## 7. Structural edits and semantic order

A Range can span several Blocks and InlineContents.

Splitting a Block or InlineContent can turn one resolved span into several
resolved spans. Merging structures can place several parts of one Range in one
InlineContent without making excluded intervening text part of the Range.

Moving Blocks does not reorder the semantic content of an existing Range. Range
semantic order is independent of current tree order.

For example, suppose one Range contains these semantic parts:

```text
brown fox | jumps | over
```

If editing changes `jumps` to `slithers`, and structural moves make the current
Block order `over`, `slithers`, `brown fox`, the Range still resolves in semantic
order as:

```text
brown fox | slithers | over
```

Its semantic text is therefore `brown fox slithers over`.

Each resolved span is independently queryable. A caller must be able to obtain
all current spans so a presentation can highlight, navigate to, or inspect each
part separately.

The Step 6 Range gate must close the Block and InlineContent identity rules for
split and merge and the Range behavior for copy-like operations. Moving existing
content and copying content are distinct operations. No implementation can infer
copy behavior only from shared Origin or derivation metadata.

## 8. Serialization and reinjection

A Range is serializable as a self-contained, versioned value suitable for an
absolute URI or a document-relative URI suffix. The exact URI grammar, encoding,
size limits, escaping rules, and placement of document context remain Step 6
decisions.

Serialization is a rebase operation, not a dump of all historical tracking
state. The engine first resolves the Range against the selected current Version,
then emits a fresh portable representation for that semantic target. Obsolete
tracking references created by earlier splits, merges, and edits can be removed
during this rebase.

A serialized Range must retain enough carrier-neutral evidence to resolve or
report uncertainty after reload or interchange. Live carrier-stable positions
can be used while the source carrier remains available, but they are not a
universal portable coordinate.

A serialized value can be reinjected as a comment target, internal-link
refinement, navigation value, or another Range holder. Serialization must not
require eager reconciliation of every Range after each document edit.

## 9. Links and comments

An internal link retains its primary Block target and can embed a Range value as
a finer semantic target. The Range can cross InlineContents or Blocks even when
the primary Block remains the navigation fallback. Step 6 must finalize the
serialized internal-link shape before `.coedit` version 1 is frozen.

Comments remain external records. A future comment holder interprets the
Range-resolution result as comment-specific attachment and repair state. Step 6
finalizes the reusable Range-level distinctions between an empty successful
resolution, uncertainty, an unresolved target, and an invalid value. It does not
freeze the comment state machine. The comment record and repair user experience
remain post-MVP.

A failed optional Range refinement on an internal Block link can still fall back
to the primary Block when that Block resolves.

## 10. Implementation sequence and gates

Range work is distributed across these steps:

1. **Step 3 — carrier qualification.** Both carrier candidates prove the
   primitives needed for direct multi-span creation, greedy and positional
   boundaries, structural tracking, lazy resolution, reload, compaction, and
   practical cost. This step does not select the final Range representation.
2. **Step 4 — selected collaborative core.** The winner implements the accepted
   attributed-content and structural carrier behind carrier-neutral boundaries.
3. **Step 5 — History and Versions.** The engine establishes exact selected
   Version materialization before version-aware Range resolution is frozen.
4. **Step 6 — durable Range service.** The engine closes the remaining behavior
   and API decisions, selects and records the lineage representation, and
   implements creation, resolution, parsing, serialization, and reinjection.

The Step 3 carrier gate selects Yjs or Automerge. The Step 6 Range gate selects
the Range-tracking representation. These are different decisions. A carrier can
win Step 3 while the Range service later uses carrier-native identity, persistent
content lineage, a piece-oriented or derivation structure, or a qualified hybrid.

The Step 6 Range gate must pass before `.coedit` version 1 or the internal-link
Range encoding is frozen. It does not block merging this representation-neutral
behavioral contract.

## 11. Range-tracking lineage remains unresolved

This contract deliberately does **not** select the Range-tracking lineage
representation.

Persistent content lineage, piece-oriented representations, derivation graphs,
carrier-native identities, and combinations of those ideas remain candidates.
None is accepted yet.

The eventual representation must implement this document without making normal
structural movement expensive or requiring a document-wide rewrite of retained
references. It must preserve the document-model boundary: implementation lineage
is not automatically a product entity.

Do not infer a required representation from examples in this document. Terms
such as `part`, `span`, and `semantic order` describe observable behavior only.

## 12. Qualification and acceptance

Step 3 carrier qualification must prove at least:

- direct creation from one and several spans;
- greedy insertion and replacement at both Span Range boundaries;
- Positional Range non-greediness and preceding-stickiness;
- split, merge, and Block-move feasibility without losing semantic order;
- several resolved spans in one InlineContent;
- reload and supported carrier compaction; and
- edit and structural-operation cost that does not scale with the total number
  of retained Range values.

Step 6 Range acceptance must additionally prove:

- the final creation validation and normalization rules;
- complete deletion followed by insertion without changing Range kind;
- the final empty-result, uncertainty, unresolved-target, and error distinctions;
- independent enumeration of every resolved span in semantic order;
- the accepted split, merge, deletion, move, and copy behavior;
- absolute URI and URI-suffix serialization, parsing, and reinjection;
- serialization that rebases and removes obsolete tracking references;
- internal-link fallback without silent rebinding;
- `.coedit` round trip of every embedded Range value;
- representative retained-Range scaling; and
- recorded comparison and selection of the lineage representation.

## 13. Explicitly open Step 6 decisions

The following decisions remain open, but each now has one owner and gate:

- the Range-tracking lineage representation and carrier integration;
- the exact carrier-neutral API and resolution-result taxonomy;
- direct multi-span validation and normalization;
- Block and InlineContent identity rules for split and merge;
- split behavior exactly at a Positional Range;
- behavior when an owning container is deleted, copied, or replaced;
- document and Version scope in absolute URI and URI-suffix forms;
- URI grammar, encoding, versioning, escaping, and size limits;
- the final internal-link serialized shape; and
- the reusable Range-level uncertainty evidence.

Detailed comment repair policy remains a post-MVP comments decision. It does not
block the headless MVP Range service.
