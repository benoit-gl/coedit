# Fine-grained collaborative text and attribution specification

**Status:** Accepted fine-grained text behavioral contract; carrier implementation is
subject to the Elaboration qualification gate.

## 1. Purpose and authority

This document defines behavior shared by InlineContent payloads whose normalized
Internet Media Type `type/subtype` is in the compile-time fine-grained allowlist.
The initial entries are `text/markdown` and `text/plain`.

It defines native-string editing, fine-grained Origin attribution, copy/paste and
restore lineage, transient selection, and carrier qualification. It does **not**
define formatting, rendering, Markdown parsing, list semantics, link semantics,
or another application presentation model.

[`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md) owns Media Type
preservation, allowlist dispatch, raw/coarse byte materialization, and universal
whole-payload replacement. [`RANGE_MODEL.md`](RANGE_MODEL.md) owns durable text
Ranges. [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product
meaning. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) controls the public engine
boundary. [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) controls the
evidence required to qualify an implementation.

The accepted rationale and evaluated alternatives are recorded in
[`decisions/0001-collaborative-content-provenance-history.md`](decisions/0001-collaborative-content-provenance-history.md), as refined by
[`decisions/0010-typed-inline-content-payloads.md`](decisions/0010-typed-inline-content-payloads.md).

## 2. Scope by phase

The strict MVP and carrier qualification must implement for every allowlisted
fine-grained text payload:

- canonical native-string collaborative text without a document-level hard-break
  item;
- protected, non-inheriting fine-grained Origin attribution;
- human, imported, automation/AI-capable, and unknown Origin records as defined
  by the current product contract;
- origin-preserving same-document copy and restore;
- separate Contribution actor and derivation metadata;
- validated internal and external text clipboard behavior;
- durable text Range feasibility; and
- exact `.coedit` recovery of text, Origin, History, and required lineage.

The same carrier qualification proves the payload-level replacement, raw/coarse
encoding, and generic opaque behavior in `INLINE_CONTENT_PAYLOADS.md`.

Formatting, Markdown interpretation, rendering, and editor presentation belong to
application adapters. Their absence from the document engine is deliberate, not a
future engine feature implied by this specification.

## 3. Canonical text and application boundary

A fine-grained text payload has one canonical collaborative string value. At the
JavaScript API boundary that value is a native ECMAScript string, including any
code-unit sequence that JavaScript strings can contain. The document engine does
not add a Unicode-well-formedness check. The selected carrier can use its native
string/text representation internally. Media byte encoding is not performed for
ordinary fine-grained editing.

Whether a native string can be represented exactly by the charset declared or
implied by its Media Type is checked only when a raw/coarse media boundary is
used. That representability rule does not constrain ordinary fine-grained edits.

The carrier-neutral logical shape is illustrative:

```text
FineGrainedTextPayload
  mediaType: exact supplied Internet Media Type
  text: native string
  origin attribution over authored text

OriginRecord
  id: OriginId
  agentId: ContributorId
  kind: human | imported | automation | ai | unknown
  createdBy: ContributionId
  source?: SourceReference
  derivedFrom?: OriginReference[]
```

An empty fine-grained text payload is valid and needs no placeholder Origin.

The document engine is syntax-agnostic. For `text/markdown`, the canonical text is
Markdown source text. For `text/plain`, it is plain source text. The engine does
not interpret emphasis, links, list markers, headings, inline code, HTML, or any
other syntax. It does not decide whether a Markdown link is internal or external.
Those decisions belong to the application.

An application can parse or render the current source string and can translate
editing intent into structural and text operations. For example, a Markdown
editor can turn a newly created list item or paragraph into Block structure. It
can also leave inline Markdown syntax in the payload for rendering. The engine
only validates and applies the resulting document operations.

Block and InlineContent boundaries add no character. A payload can contain
line-feed, carriage-return, delimiter, unpaired surrogate code units, or other
string content. There is no canonical `HardBreak` item or inferred presentation
separator in the document model.

`TEXT_POSITION_MODEL.md` owns the public coordinate semantics used for text
positions. Carrier-specific indexing, including any UTF-16 code-unit behavior,
remains private until that contract deliberately exposes it.

## 4. Fine-grained operations

The initial fine-grained operation set is character editing plus the metadata
needed to preserve attribution and durable text references. It includes behavior
equivalent to:

- insert text;
- delete text;
- replace text;
- copy/paste text under the Origin rules below;
- create and resolve text positions/Ranges through the focused Range service; and
- apply whole-payload replacement through the universal coarse boundary.

The exact public command names and TypeScript shapes remain implementation
details until their implementation step freezes them.

Fine-grained operations must fail explicitly when the target payload's normalized
`type/subtype` is not in the compile-time allowlist. They do not inspect the text
or bytes to infer a capability.

A fine-grained operation changes the source string only as requested. The engine
does not normalize Markdown syntax, repair malformed markup, balance delimiters,
reflow plain text, or make the current value parseable by an application parser.
Temporary or permanent application-level syntax errors are valid document text.

Whole-payload replacement remains available for allowlisted text. Use
fine-grained operations when merge behavior is desired. Mixed replacement/edit
concurrency remains a Gate B decision under `INLINE_CONTENT_PAYLOADS.md`.

## 5. Origin and activity behavior

Origin answers who or what created payload material. Contribution actor answers
who performed an operation in this document.

Each live authored text unit has exactly one valid `OriginId`. Newly authored text
receives an Origin explicitly at the trusted engine/import boundary. Origin never
comes from neighboring text.

An Origin record and the Contribution that first uses it publish atomically.
`OriginId` is stable, immutable, and document-scoped. An OriginRecord describes
one authorship/source event, not a mutable Contributor profile.

The initial behavior is:

| Operation                        | Content Origin                                                                     | Contribution actor and derivation                             |
| -------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Human typing or replacement      | New human Origin for newly inserted material                                       | Acting human                                                  |
| Markdown or external text import | Imported or unknown Origin with source metadata                                    | Human/system actor that initiated the import                  |
| Same-document internal paste     | Preserve each source Origin; create new carrier text identities                    | Paster; derive from source content/Version                    |
| External text/HTML paste         | New imported or unknown Origin                                                     | Paster; record available external source metadata             |
| Move                             | Preserve payload state and Origin                                                  | Mover                                                         |
| Entity copy                      | New entity and carrier text identities; preserve Origins                           | Copier; derive from source entity/Version                     |
| Restore                          | Fresh carrier text identities for reinserted material; preserve historical Origins | Restoring actor; derive from target Version                   |
| AI generation                    | AI/software-agent Origin                                                           | AI execution Contribution; later human acceptance is separate |

There is no `restored` Origin kind. Restore is an activity, not an authorship
category.

When a user edits another contributor's text, only newly inserted logical text
receives the editor's new Origin. Unchanged surrounding text retains its existing
Origin.

Opaque payload Origin is specified separately in `INLINE_CONTENT_PAYLOADS.md`.

## 6. Clipboard contract

Clipboard handling belongs to the browser/application adapter, not to the core
text syntax model.

The browser adapter can emit ordinary `text/plain`, application-selected HTML,
and a versioned private Coedit text fragment containing validated source text,
Origins, source document/Version, and derivation references. Formatting present in
HTML or Markdown is application/interchange data; it is not a parallel canonical
formatting model in the engine.

The initial private clipboard type is `application/x-coedit-fragment+json`; its
payload carries its own integer `formatVersion`. Failure to write or read that
custom type does not prevent ordinary clipboard behavior.

The private representation is untrusted input even when it originated in Coedit.
Validate its version, sizes, IDs, Origin references, and source relationship
before use.

**Maturity:** Pending selection.

**Owner:** This document.

**Promotion gate:** Step 3 carrier and clipboard qualification.

The strict MVP preserves Origins from a private fragment only when its source
`DocumentId` matches the target document and every referenced Origin resolves
without conflict. A fragment from another document follows the external
imported/unknown path until the post-MVP cross-document Origin-catalog protocol
exists.

Clipboard markup and URL interpretation are application concerns. The document
engine does not interpret clipboard markup or URLs.

Generic opaque clipboard/drag-drop transport is an application concern until a
focused opaque-payload interchange contract exists.

## 7. Restore, deletion, Range, and selection

Local single-writer restore produces material equal to the selected historical
target while appending a new Contribution. Reinserted text receives fresh carrier
identities and retains the target material's Origins.

In replicated operation, restore additionally names the frontier observed by its
author and obeys the causal compensation rules in
[`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md). It does not delete unseen
concurrent material.

Deleted text and Origin records remain reachable when required to materialize a
Version or resolve text Range lineage. Physical compaction can change their
storage only when every Version, Origin, and required lineage remains exact.

Durable application features can store a Range or serialize it into their own
metadata or URLs. The engine's Range service does not create an intrinsic link or
formatting object. A Markdown application can place a serialized local or remote
reference into Markdown link syntax and later decide how to resolve it.

Local text selection, focus, composition state, parsed Markdown state, rendered
formatting state, and remote cursors/selections are transient adapter or awareness
state. They do not create Origins, Contributions, Versions, or portable records.

## 8. Trust and identity

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

Stable attribution IDs refer to separately managed display/profile data so that
renaming, anonymization, and lawful erasure do not require rewriting content
items or causal History.

## 9. Carrier qualification

Yjs stable v13 is the provisional implementation default. Automerge is the
required challenger. Yjs v14 is reevaluated after stable release; Loro is a
benchmark for cursor and movable-tree semantics, not a current implementation
candidate.

Both candidates must run the same fine-grained text suite for both initial
allowlisted Media Types. At minimum it covers:

- exact native-string preservation, including newline/control-character and
  ill-formed native-string cases selected by `INLINE_CONTENT_PAYLOADS.md`;
- Origin non-inheritance and protection from ordinary client commands;
- concurrent insertion, deletion, and replacement at identical and adjacent
  boundaries;
- split, merge, IME, cut, paste, undo, and redo as application/editor operations;
- same-document copy and restore lineage;
- external clipboard stripping and imported/unknown Origin assignment;
- the Step 3 text Range-feasibility cases in `RANGE_MODEL.md`;
- one transaction spanning Block structure and several InlineContents;
- duplicate, delayed, reordered, partitioned, and reconnected updates;
- exact portable round trip and historical materialization; and
- representative growth and load behavior.

The carrier gate also runs the generic Media Type, raw/coarse encoding, opaque
payload, and whole-payload replacement cases in `INLINE_CONTENT_PAYLOADS.md`.

Functional invariants are mandatory. `MVP_VERIFICATION_PLAN.md` owns the shared
performance workloads and evidence rules.

Select Yjs when its protected Origin/text carrier passes without fragile
full-state reconstruction or editor repair. Select Automerge only if its text,
cursor, head, and storage behavior materially reduces custom machinery and its
editor integration passes the same suite.

## 10. Required MVP verification

The production implementation repeats the selected carrier's qualification
fixtures as regression tests. In addition, prove:

- malformed or oversized carrier input leaves the base unchanged;
- malformed or over-capacity private clipboard fragments leave the base unchanged
  and do not disable ordinary clipboard fallback;
- caller mutation of detached input cannot mutate engine state;
- a failed command publishes no text, Origin, Contribution, or Version;
- newline, unpaired surrogate code units, or other native-string content is not
  rejected merely because an application can present, parse, or encode it specially;
- no Block or InlineContent boundary manufactures a text character;
- the engine does not parse, normalize, repair, or render Markdown syntax;
- application formatting state is not required to materialize canonical engine
  state;
- `.coedit` preserves source strings, Origins, Contributors, Contributions, and
  derivation exactly; and
- ordinary Markdown export can omit private Origin without implying that Markdown
  is the lossless recovery format.
