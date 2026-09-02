# Durable range model

**Status:** Accepted behavioral contract; lineage representation remains open.

## 1. Purpose and authority

This document defines durable text Range behavior across text edits and structural
changes. It defines observable semantics, not the internal representation used to
track lineage.

This document owns durable Range behavior when older wording in
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` or `TEXT_POSITION_MODEL.md` assumes one range
inside one InlineContent. Those documents continue to own attributed-text and
position-carrier concerns respectively.

A Range is not a document entity. The document engine provides the position,
resolution, and transformation behavior that external features use. Comments,
links, navigation, and later features can store or carry a Range value without
creating a Range registry in the document model.

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
- **Lineage representation:** the private mechanism that lets a Range follow
  content through edits, split, merge, move, copy-like transformations, and
  carrier changes.

## 3. Range ownership

A Range is external to the canonical document model.

The document does not contain a Range entity, Range table, or authoritative
registry of references. A feature can retain a Range independently and ask the
engine to resolve it against a selected Version.

Document mutations must not scan or rewrite every retained Range. The cost of an
ordinary edit must not grow with the total number of comments, links, or other
external Range holders.

A Range can be created directly from one span, several spans, or one logical
position. Multi-span is a normal creation form. It is not only a degraded state
caused by later edits.

## 4. Span Range behavior

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

## 5. Positional Range behavior

A Positional Range has an immutable `position` kind. It is zero-length and
non-greedy.

A Positional Range is preceding-sticky in logical text order. "Preceding" does
not mean visual left and does not depend on writing direction.

Stickiness is local to the Range's current Block and InlineContent. Emptying that
content does not by itself migrate the position to a preceding Block. An explicit
structural operation, such as a merge whose contract translates positions into a
surviving content container, can move the position to another container.

The exact result when a structural split occurs exactly at a Positional Range is
not yet specified. That case requires a separate split/merge contract.

## 6. Structural edits and semantic order

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

The exact Block and InlineContent identity rules for split and merge remain open.
This document does not select which identity survives or which new identities are
allocated.

## 7. Serialization and rebasing

A Range is serializable as a self-contained, versioned value suitable for a URI
or URI suffix. The exact URI grammar, encoding, size limits, and escaping rules
remain open.

Serialization is a rebase operation, not a dump of all historical tracking
state. The engine first resolves the Range against the selected current Version,
then emits a fresh portable representation for that resolved semantic target.
Obsolete tracking references created by earlier splits, merges, and edits can be
removed during this rebase.

A serialized Range must retain enough carrier-neutral evidence to resolve or
report uncertainty after reload or interchange. Live carrier-stable positions
can be used while the source carrier remains available, but they are not a
universal portable coordinate.

Serialization must not require eager reconciliation of every Range after each
document edit.

## 8. Links and comments

Internal links and comments can use this Range contract without making Range a
canonical document entity.

An internal link can retain a primary Block target and use a Range as a finer
semantic target. Older single-InlineContent range shapes in
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` are superseded by this contract. The exact
future serialized link shape is not fixed here.

Comments remain external records. Their attachment lifecycle can still report
attached, ambiguous, or orphaned state. That lifecycle is separate from Range
kind and from the number of resolved spans.

A failed optional range refinement on an internal Block link can still fall back
to the primary Block when that Block resolves. A Range must never silently bind
to an unrelated Block or InlineContent only because an identifier or quote is
coincidentally equal.

## 9. Lineage representation is unresolved

This contract deliberately does **not** select the lineage representation.

We have discussed persistent content lineage, piece-oriented representations,
derivation graphs, carrier-native identities, and combinations of those ideas.
None is accepted yet.

The eventual representation must prove that it can implement the behavior in
this document without making normal structural movement expensive and without
requiring a document-wide rewrite of retained references. It must also preserve
the document model boundary: implementation lineage is not automatically a new
product entity.

Do not infer a required representation from examples in this document. Terms
such as "part", "span", and "semantic order" describe observable behavior only.

## 10. Required qualification

Before the Range representation is frozen, qualification must prove at least:

- direct creation from one and several spans;
- greedy insertion at both Span Range boundaries;
- replacement across each boundary, independent of editor transaction shape;
- complete deletion followed by insertion without changing Range kind;
- Positional Range non-greediness and preceding-stickiness;
- split of one resolved span into several Blocks;
- merge of included and excluded material into one InlineContent;
- several resolved spans in one InlineContent;
- Block moves that change tree order without changing Range semantic order;
- independent enumeration of every resolved span;
- reload and supported carrier compaction;
- serialization that rebases and removes obsolete tracking references;
- ambiguous and orphaned resolution without silent rebinding; and
- edit and structural-operation cost that does not scale with the total number of
  retained external Range values.

The split-at-position case, split/merge identity rules, URI grammar, and lineage
representation remain explicit open decisions.
