# Durable Range model

**Status:** Accepted behavioral contract; the lineage representation and a
small set of Step 6 API and wire decisions remain unresolved.

## 1. Purpose and authority

This document defines durable Range behavior across text edits, structural
changes, Version materialization, parsing, and serialization. It defines
observable semantics and the required engine service boundary. It does not
select the private representation used to track content lineage.

`PRODUCT_DOMAIN_MODEL.md` controls product meaning. `MVP_ARCHITECTURE.md`
controls the public engine boundary. `CAPACITY_AND_PERFORMANCE_TARGETS.md`
controls cross-cutting capacity semantics and contract maturity.
`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns formatting, Origin, link, and comment
behavior outside this Range contract. `TEXT_POSITION_MODEL.md` owns editor and
carrier position boundaries. `SCAFFOLDING_PLAN.md` owns the implementation order
and decision gates.

A Range is a durable reference value, not a document entity. A comment can keep
the value in an external record. An intrinsic internal-link mark can embed the
value in canonical content. Neither use creates a Range registry, independent
Range identity, or a document-owned table of retained references.

## 2. Terms

Use these terms consistently:

- **Range:** one document-relative durable reference to authored text or to one
  logical position.
- **Span Range:** a Range whose source members follow greedy Span semantics,
  including any zero-length member.
- **Positional Range:** an explicitly positional, zero-length Range that follows
  positional semantics.
- **Source member:** one span supplied at creation or retained after parsing or
  rationalization.
- **Resolved span:** one current contiguous text interval descended from a source
  member.
- **Creation order:** the exact source-member order supplied by the caller.
- **Range holder:** a comment, link, navigation record, or another feature that
  stores or embeds a Range value.
- **Range-tracking lineage:** the private mechanism that lets a Range follow
  content through edits, movement, split, and merge. Copy does not create
  Range-tracking lineage. This lineage is not Origin provenance or Contribution
  derivation.
- **Rationalization:** an explicit application-requested operation that can
  coalesce spans made exactly adjacent by a lineage merge.

## 3. Document and Version scope

A Range is always relative to one document. Its bare value and serialized Range
suffix do not identify a globally addressable document.

Each Range records the `VersionToken` against which it was created or rebased.
Each source member records its original `BlockId`, `InlineContentId`, and
boundaries in that Version. The `VersionToken` remains opaque and
document-scoped. No globally unique Version identifier is required; the complete
scope is the document context plus the recorded creation Version.

The caller supplies the document context by selecting a document engine. The
engine must never bind a Range to another document, Block, or InlineContent only
because an identifier or text value is coincidentally equal.

A Range can resolve only against its creation Version or a descendant Version
in the same document. Resolving it against a Version before creation or against
an unmerged concurrent branch is invalid. Temporary concurrent heads can exist
during intermittent collaboration. Once their work is exchanged, the engine
integrates them into a descendant Version. Coedit has no permanent user-facing
History branches.

Every Version created for a retained document remains exactly materializable.
Range resolution can therefore start from the recorded creation Version without
a Range ledger or a document-wide Range registry. Physical materialization
snapshots can accelerate reconstruction, but they are private and create no
additional product Versions.

## 4. Required logical service boundary

The engine must provide behavior equivalent to these operations. Exact names
and TypeScript shapes are finalized in Step 6:

```text
createSpanRange(visibleVersion, spans) -> Range | RangeError
createPositionalRange(visibleVersion, position) -> Range | RangeError
resolveRange(range, selectedVersion) -> ResolvedSpan[] | RangeError
resolveRangeText(range, selectedVersion) -> string | RangeError
rationalizeRange(range, selectedVersion) -> Range | RangeError
serializeRange(range, selectedVersion) -> SerializedRange | RangeError
parseRange(serializedRange, documentContext, selectedVersion) -> Range | RangeError
```

Creation is atomic against the current Version visible to the creator. Every
supplied source span or position must resolve in that Version. If any input does
not resolve, creation fails and returns no Range.

`createSpanRange` preserves the supplied members exactly. It does not sort,
merge, deduplicate, or infer intent. Source members can be sparse, overlapping,
duplicated, adjacent, zero-length, and in arbitrary order. Representation and
resource validation still apply.

`resolveRange` returns only resolved spans. It processes source members in
creation order. When one member has split into several surviving descendants,
it emits those descendants in that member's lineage order before it processes
the next source member. An unresolved, ambiguous, or deleted member contributes
no resolved span. Resolution never substitutes a similar target.

`resolveRangeText` concatenates the exact text of the resolved spans in that same
order. It adds no space, hard break, Block separator, InlineContent separator, or
other text. Overlapping or duplicated members therefore produce duplicated text.
Missing members contribute nothing.

Parsing is best-effort. `parseRange` resolves each serialized member through
lineage in the caller-supplied document and selected Version. It omits unresolved
or ambiguous members and returns a new Range rebased to the selected Version.
The exact result when every member is omitted and the shape of optional parse
diagnostics remain Step 6 API decisions.

## 5. Span Range behavior

A Span Range has an immutable `span` kind. Every member, including a zero-length
member, follows Span semantics. A Span does not become a Positional Range because
its boundaries coincide or its current text becomes empty.

A Span is greedy at both boundaries:

1. Text inserted at either boundary joins the Span.
2. A replacement that touches or crosses a boundary contributes its replacement
   material according to the same greedy rule.
3. Deleting all currently resolved characters does not change the Range kind.
4. Correct behavior must not depend on whether an editor reports replacement as
   one replace operation or as delete followed by insert.

A source member can resolve to zero, one, or several current spans. Structural
and text operations can increase or decrease that count.

Several resolved spans can exist in one InlineContent. For example, a merge can
place included material, excluded material, and included material in one current
InlineContent. Resolution preserves the two included spans instead of expanding
across the excluded material.

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

## 7. Structural lineage, deletion, and copy

A Range can span several Blocks and InlineContents. Each source member follows
the lineage of its original Block and InlineContent.

Moving a Block or InlineContent preserves its identity and Range lineage.
Splitting a Block or InlineContent can distribute one source member across
several descendants. Merging Blocks or InlineContents can recombine those
descendants. These operations preserve the source member's lineage order even
when current Block tree order differs.

If a split occurs exactly at a Span boundary, the split does not manufacture a
zero-length span on the other side. The existing Span remains in exactly one
resulting content lineage. The tie-break for an already zero-length Span split at
its sole boundary remains a Step 6 decision.

Copying, cloning, duplicating, importing, or pasting content creates no
Range-tracking lineage to the copy. Shared Origin or Contribution derivation does
not make a Range follow copied material.

When a Block or InlineContent is deleted without a lineage-preserving merge, its
source members produce no spans in later Versions. The Range retains its
creation reference and can still resolve in Versions between its creation and
that deletion.

For example, suppose one Range contains these source members:

```text
brown fox | jumps | over
```

If editing changes `jumps` to `slithers`, and structural moves make the current
Block order `over`, `slithers`, `brown fox`, resolution still uses creation and
lineage order:

```text
brown fox | slithers | over
```

The exact resolved text is `brown foxslithersover`; resolution adds no
separators.

## 8. Explicit rationalization

Normal resolution does not rewrite or normalize a Range. The application can
request rationalization against a selected Version.

Rationalization can merge two resolved spans only when all these conditions
hold:

1. they are consecutive in creation and lineage order;
2. they are exactly adjacent in the same current InlineContent; and
3. lineage proves that their current adjacency resulted from adjacent Blocks or
   InlineContents being merged through a lineage-preserving operation.

Unrelated edits that happen to make two spans adjacent do not qualify.
Rationalization returns a new Range rebased to the selected Version. It does not
mutate the supplied Range, and it does not run automatically during edits or
ordinary resolution.

## 9. Serialization, parsing, and links

The Range service serializes a self-contained, versioned, document-relative
Range description or URI-fragment suffix. The exact fragment grammar, encoding,
escaping rules, and resource-guard behavior remain Step 6 decisions.

Serialization is a non-mutating rebase against the selected Version. It emits a
fresh portable representation of the Range at that Version and can remove
obsolete tracking references. It does not require eager reconciliation of every
Range after each document edit.

An internal link always resolves its optional Range or Positional Range against
the current document. Its primary `BlockId` remains the fallback when the Range
produces no target and the Block still exists.

An external deep link has the conceptual form:

```text
document-uri#range-fragment
```

The application owns the enclosing document URI, its scheme, document lookup,
and fragment extraction. The Range service parses and resolves only the supplied
Range fragment against the document selected by the application. It performs no
cross-document reconciliation or identifier matching.

If an internal link is transferred to another document, application policy must
reject it, remove it, or convert it to an external deep link. The Range service
does not remap it.

## 10. History and storage consequences

All product Versions remain materializable for the lifetime of a retained
document. Physical checkpoints, cached materializations, structural sharing,
chunking, and compaction are implementation details. They may replace replay
paths only when every VersionToken and the lineage needed by Range resolution
remain exact.

This permanent History promise allows lazy Range resolution. The document does
not keep a ledger of Range holders, and ordinary text edits or Block moves do not
scan or rewrite retained Range values. Resolution, rationalization, parsing, and
serialization perform work only for the supplied Range.

## 11. Implementation sequence and gates

Range work is distributed across these steps:

1. **Step 3 — carrier qualification.** Both carrier candidates prove the
   primitives needed for direct creation, greedy and positional boundaries,
   structural tracking, lazy resolution, reload, compaction, and practical cost.
   This step does not select the final Range representation.
2. **Step 4 — selected collaborative core.** The winner implements the accepted
   attributed-content and structural carrier behind carrier-neutral boundaries.
3. **Step 5 — History and Versions.** The engine establishes permanent exact
   Version materialization before version-aware Range resolution is frozen.
4. **Step 6 — durable Range service.** The engine closes the remaining API and
   wire decisions, selects and records the lineage representation, and
   implements creation, resolution, rationalization, parsing, serialization,
   and reinjection.

Gate B selects Yjs or Automerge. Gate C selects the Range-tracking
representation. A carrier can win Gate B while the Range service later uses
carrier-native identity, persistent content lineage, a piece-oriented or
derivation structure, or a qualified hybrid.

Gate C must pass before `.coedit` version 1 or the internal-link Range encoding
is frozen. It does not block merging this representation-neutral behavioral
contract.

## 12. Range-tracking lineage remains unresolved

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
such as `member`, `span`, and `lineage order` describe observable behavior only.

## 13. Qualification and acceptance

Step 3 carrier qualification must prove at least:

- atomic direct creation failure when any supplied target does not resolve;
- preservation of arbitrary creation order, overlap, duplication, adjacency,
  sparsity, and zero-length Span members;
- greedy insertion and replacement at both Span boundaries;
- Positional Range non-greediness and preceding-stickiness;
- split, merge, delete, and Block-move feasibility without losing lineage order;
- no Range continuation through copy operations;
- several resolved spans in one InlineContent;
- exact concatenation without inserted separators;
- omission instead of speculative rebinding for unresolved members;
- reload and supported carrier compaction while every Version remains
  materializable; and
- edit and structural-operation cost that does not scale with the total number
  of retained Range values.

Step 6 Range acceptance must additionally prove:

- the final API result and resource-guard rules;
- immutable Span and Positional kinds, including zero-length Spans;
- complete deletion followed by insertion without changing Range kind;
- independent enumeration of resolved spans in creation and lineage order;
- exact split, merge, deletion, move, and no-copy behavior;
- exact-boundary split without a manufactured zero-length descendant;
- explicit rationalization limited to merge-caused adjacency;
- best-effort parsing with unresolved and ambiguous members omitted;
- document-relative fragment serialization, parsing, and reinjection;
- application-owned external document URI handling;
- serialization and rationalization that rebase the supplied Range;
- internal-link fallback without cross-document reconciliation;
- `.coedit` round trip of every embedded Range value and creation Version;
- representative retained-Range scaling; and
- recorded comparison and selection of the lineage representation.

## 14. Explicitly open Step 6 decisions

**Maturity:** Pending selection.

**Owner:** This document.

**Promotion gate:** Step 6 Range implementation and Gate C.

Step 6 must profile source-member count, serialized size, decoded allocation,
and resolution work. It must select and test any required finite implementation
guards and their capacity-failure behavior. No finite Range maximum is accepted
in advance.

The remaining decisions are:

- the Range-tracking lineage representation and carrier integration;
- exact carrier-neutral API names and result wrappers;
- the result and optional diagnostics when parsing omits members, including all
  members;
- the zero-length Span tie-break when a split occurs at its sole boundary;
- Positional Range behavior for split, merge, deletion, and replacement;
- exact fragment grammar, encoding, versioning, escaping, and resource-guard
  behavior;
- whether source-member count or serialized size needs an explicit finite
  implementation guard and, if so, its selected value and failure behavior; and
- the final internal-link serialized shape.

Detailed comment repair policy remains a post-MVP comments decision. It does not
block the headless MVP Range service.
