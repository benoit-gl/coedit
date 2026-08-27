# Attributed collaborative text and annotation specification

**Status:** Accepted behavioral contract; carrier implementation is subject to
the Elaboration qualification gate.

## 1. Purpose and authority

This document defines the detailed behavior of InlineContent text, intrinsic
formatting, origin attribution, copy/paste/restore lineage, future comment
targets, and transient selections.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product meaning.
[`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) controls the public engine boundary.
This document controls attributed-text behavior when summaries elsewhere are
insufficient. [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) controls the
evidence required to qualify an implementation.

The accepted rationale and evaluated alternatives are recorded in
[`decisions/0001-collaborative-content-provenance-history.md`](decisions/0001-collaborative-content-provenance-history.md).

## 2. Scope by phase

The strict MVP and its carrier qualification must implement:

- canonical collaborative text and hard breaks;
- intrinsic formatting marks with explicit boundary behavior;
- protected, non-inheriting origin attribution;
- human, imported, and unknown origin records;
- origin-preserving same-document copy and restore;
- separate Contribution actor and derivation metadata;
- validated internal and external clipboard behavior; and
- exact `.coedit` recovery of that state.

The carrier gate also proves that stable comment targets are feasible. It does
not require a comment UI or durable Comment records in the strict MVP.

Post-MVP capabilities include provenance visualization and queries, production
identity and authorization, cross-document origin-catalog exchange, AI-provider
integration, comments and conversations, retention/anonymization controls, and
signed publication claims.

## 3. Vocabulary and logical shape

Use these terms consistently:

- **CollaborativeContent:** the carrier-neutral canonical state of text, hard
  breaks, formatting, and origin attribution owned by one InlineContent.
- **Formatting mark:** intrinsic rich-text presentation metadata.
- **Origin:** immutable attribution describing the agent or source that first
  created a logical content unit.
- **Contribution actor:** the Contributor that performed a durable operation in
  this document.
- **Derivation:** a reference explaining that new placement or generated
  material used earlier or external material.
- **CommentTarget:** an external durable target that attempts to resolve a text
  range and can become ambiguous or orphaned.

The carrier-neutral logical shape is illustrative:

```text
CollaborativeContent
  text and hard-break items
  formatting marks
  origin attribution per text/hard-break item

OriginRecord
  id: OriginId
  agentId: ContributorId
  kind: human | imported | automation | ai | unknown
  createdBy: ContributionId
  source?: SourceReference
  derivedFrom?: OriginReference[]

OriginReference
  documentId?: DocumentId
  originId?: OriginId
  sourceName?: string
  sourceHash?: string
  externalReference?: string
```

`OriginId` is stable, immutable, and document-scoped. Same-document copy and
restore reuse it. A future cross-document trusted transfer imports an immutable
local OriginRecord under a new `OriginId` and records the source document and
source Origin reference. It must not silently alias incompatible contributor or
origin catalogs.

An origin record and the Contribution that first uses it publish atomically.
Preallocated IDs allow the records to refer to one another without relying on
commit order.

An OriginRecord describes one authorship/source event, not one character and
not a mutable Contributor profile. Items first authored by the same Contribution
can share one new OriginRecord when their agent, kind, source, and derivation are
identical; distinct attribution inputs require distinct records. Newly authored
material in a later Contribution uses a new OriginRecord even when the agent is
the same. Copy and restore reuse historical records because those activities
change placement, not authorship.

## 4. Canonical content rules

1. Every live text item and hard break has exactly one valid `OriginId`.
2. Formatting marks and origin attribution are part of the same canonical
   collaborative state and commit atomically with visible text.
3. HTML, plain text, ProseMirror JSON, and rendered provenance runs are derived
   representations, not parallel authorities.
4. Ordinary formatting commands can modify formatting marks only. They cannot
   create, change, or remove origin attribution.
5. An insertion command assigns origin explicitly at the trusted engine/import
   boundary. Origin never comes from the neighboring character or active
   formatting mark set.
6. Carrier identifiers are private. Public APIs expose detached,
   carrier-neutral values or controlled editor sessions, never a live
   engine-owned Yjs or Automerge object.
7. Copying content creates new carrier item identities. It does not transfer the
   source InlineContent identity.
8. Moving a Block or InlineContent preserves its CollaborativeContent and
   origin records.

## 5. Formatting behavior

The initial formatting vocabulary is:

- bold;
- italic;
- underline;
- strikethrough;
- inline code; and
- link with one validated safe destination.

Every mark instance has one logical insertion-boundary policy:

```text
none   inserted content at neither boundary joins the mark
start  inserted content at the start boundary joins the mark
end    inserted content at the end boundary joins the mark
both   inserted content at either boundary joins the mark
```

Initial defaults are `both` for bold, italic, underline, and strikethrough, and
`none` for inline code and links. An explicit editor command can create a mark
with another supported policy when product behavior requires it. Carrier
adapters must preserve the logical policy even if their native vocabulary uses
different names.

Formatting commands must define behavior for empty selections, overlapping
marks, replacement, hard breaks, excluded marks, and safe link changes. Clearing
formatting never changes origin.

## 6. Origin and activity behavior

Each operation follows these rules:

| Operation                        | Content origin                                                              | Contribution actor and derivation                                                 |
| -------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Human typing or replacement      | New human Origin for newly inserted material                                | Acting human                                                                      |
| Markdown or external file import | Imported or unknown Origin with source metadata                             | Human/system actor that initiated the import; source is not impersonated as actor |
| Same-document internal paste     | Preserve each source Origin; new carrier items                              | Paster; derive from source content/Version                                        |
| External plain/HTML paste        | New imported or unknown Origin                                              | Paster; record external-paste activity and available source metadata              |
| Move                             | Preserve carrier state and Origin                                           | Mover                                                                             |
| Entity copy                      | New entity and carrier item IDs; preserve Origins                           | Copier; derive from source entity/Version                                         |
| Restore                          | Fresh carrier item IDs for reinserted material; preserve historical Origins | Restoring actor; derive from target Version                                       |
| AI generation                    | AI/software-agent Origin                                                    | AI execution Contribution; later human acceptance is separate                     |
| Formatting-only change           | Preserve Origin                                                             | Formatting actor                                                                  |

There is no `restored` origin kind. Restore is an activity, not an authorship
category.

When a user edits another contributor's sentence, only newly inserted logical
items receive the editor's new Origin. Unchanged surrounding items retain their
existing Origin.

## 7. Clipboard contract

The browser adapter can emit three representations:

1. `text/plain` with visible text only;
2. sanitized `text/html` with supported visible formatting only; and
3. a versioned private Coedit fragment containing validated semantic content,
   formatting, Origins, source document/Version, and derivation references.

The initial private clipboard type is `application/x-coedit-fragment+json`; its
payload carries its own integer `formatVersion`. Failure to write or read that
custom type does not prevent ordinary text/HTML clipboard behavior.

The private representation is untrusted input even when it originated in
Coedit. Validate its version, sizes, IDs, formatting, Origin references, and
source relationship before use.

The strict MVP preserves Origins from a private fragment only when its source
`DocumentId` matches the target document and every referenced Origin resolves
without conflict. A fragment from another document follows the external
imported/unknown path until the post-MVP cross-document origin-catalog protocol
is implemented.

Ordinary HTML/plain representations omit private Origins, comments, History,
and identity records. An external paste never receives internal-Origin behavior
merely because its HTML resembles Coedit output.

Use DOMPurify or an equivalently reviewed allowlist sanitizer at the clipboard
DOM boundary. ProseMirror schema filtering is defense in depth, not the sole
sanitizer. Unsafe link schemes and control characters are rejected before a link
mark enters canonical content.

## 8. Restore and deletion

Local single-writer restore produces material equal to the selected historical
target while appending a new Contribution. Reinserted text receives fresh
carrier identities and retains the target material's Origins.

In replicated operation, restore additionally names the frontier observed by
its author and obeys the causal compensation rules in
[`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md). It does not delete unseen
concurrent material.

Deleted content and Origin records can remain physically reachable through
retained History or carrier tombstones. A later retention/compaction policy must
define when they can be removed or anonymized. Compaction cannot silently break
an advertised retained Version.

## 9. Comment targets

Comments and conversations are external records. Their target shape is:

```text
CommentTarget
  documentId
  blockId
  inlineContentId
  startCursor
  endCursor
  startAffinity: before | after
  endAffinity: before | after
  quote:
    exact
    prefix
    suffix
  approximatePosition?: { start, end }
  state: attached | ambiguous | orphaned
```

The stored state records the latest deliberate resolution result; it is not a
license to trust stale offsets.

Resolution order is:

1. resolve stable carrier cursors;
2. validate the resulting text against quote/context evidence;
3. if unresolved or invalid, search by exact quote and disambiguate with prefix,
   suffix, structural identity, and approximate position;
4. attach only when one result satisfies the accepted confidence policy;
5. otherwise return `ambiguous` or `orphaned` and require explicit repair.

Exact confidence thresholds and the comment repair UX are a post-MVP decision.
The carrier gate only requires that these states and behaviors are implementable
without an external formatting/provenance anchor model.

## 10. Selection and awareness

Local selection, focus, composition state, and remote cursors/selections use
transient editor or awareness state. They do not create Origins, Contributions,
Versions, or portable records.

If a later feature creates a named durable selection, it uses an explicit
external target type and a new decision. It does not redefine ordinary editor
selection.

## 11. Trust and identity

Keep these concepts separate:

- security principal;
- durable Contributor/agent;
- Origin claim;
- replica/device;
- editor session; and
- transport connection or CRDT client ID.

An offline Origin is a descriptive assertion. In an authenticated deployment,
the trusted engine/relay validates the acting principal, Contributor authority,
and any requested Origin assignment. It rejects or quarantines forged or
unverifiable metadata without partial publication.

Signed export is a third layer. A future C2PA or equivalent assertion can sign a
projection of document, Contribution, Origin, and derivation facts; it does not
replace the live carrier or make unsigned local claims cryptographically true.

Stable attribution IDs refer to separately managed display/profile data so that
renaming, anonymization, and lawful erasure do not require rewriting content
items or causal History.

## 12. Carrier qualification

Yjs stable v13 is the provisional implementation default. Automerge is the
required challenger. Yjs v14 is reevaluated after stable release; Loro is a
benchmark for cursor and movable-tree semantics, not a current implementation
candidate.

Both candidates must run the same qualification suite before selection. At
minimum it covers:

- all formatting boundary policies and overlapping marks;
- origin non-inheritance and protection from ordinary client commands;
- concurrent insertion, deletion, replacement, and formatting at identical and
  adjacent boundaries;
- split, merge, hard break, IME, cut, paste, undo, and redo;
- same-document copy and restore lineage;
- external clipboard stripping and imported/unknown Origin assignment;
- stable comment-cursor feasibility through edits, deletion, reload, and
  compaction;
- one transaction spanning Block structure and several InlineContents;
- duplicate, delayed, reordered, partitioned, and reconnected updates;
- exact portable round trip and historical materialization; and
- representative growth and load behavior.

Functional invariants are mandatory. Before running performance qualification,
record representative target devices and budgets for open, ordinary edit,
checkpoint, history materialization, and export. Results and dependency/license
review are retained as qualification evidence.

Select Yjs when the protected Origin carrier passes without fragile full-state
reconstruction or editor repair. Select Automerge only if its native rich-text,
cursor, head, and storage behavior materially reduces custom machinery and its
ProseMirror integration passes the same suite.

## 13. Required MVP verification

The production implementation repeats the selected carrier's qualification
fixtures as regression tests. In addition, prove:

- malformed or oversized carrier input leaves the base unchanged;
- caller mutation of detached input cannot mutate engine state;
- a failed command publishes no text, mark, Origin, Contribution, or Version;
- `.coedit` preserves intrinsic formatting, Origins, Contributors,
  Contributions, and derivation exactly;
- Markdown compares visible semantic marks but intentionally excludes Origin
  identity from its equivalence relation; and
- ordinary Markdown export omits Origins without a warning on every export,
  while an explicitly provenance-preserving export request reports Markdown as
  non-representative.
