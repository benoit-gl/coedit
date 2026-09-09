# Attributed collaborative text and annotation specification

**Status:** Accepted `application/vnd.coedit.text` behavioral contract; carrier implementation is
subject to the Elaboration qualification gate.

## 1. Purpose and authority

This document defines the detailed behavior of the `application/vnd.coedit.text` InlineContent
payload: authored text, intrinsic formatting, fine-grained Origin attribution,
link holders, copy/paste/restore lineage, future comment holders, and transient
selections. `INLINE_CONTENT_PAYLOADS.md` owns Media Types and universal
whole-payload replacement. `RANGE_MODEL.md` owns the shared durable text Range
value and engine service used by internal links and future comments.

[`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) controls product meaning.
[`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) controls the public engine boundary.
This document controls attributed-text behavior when summaries elsewhere are
insufficient. [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) controls the
evidence required to qualify an implementation.

The accepted rationale and evaluated alternatives are recorded in
[`decisions/0001-collaborative-content-provenance-history.md`](decisions/0001-collaborative-content-provenance-history.md), as refined by the Media-Type-labelled-payload
decision.

## 2. Scope by phase

The strict MVP and its carrier qualification must implement for `application/vnd.coedit.text`:

- canonical collaborative Unicode text without a document-level hard-break item;
- intrinsic formatting marks with explicit boundary behavior;
- opaque link metadata and document-local Block link targets;
- protected, non-inheriting fine-grained Origin attribution;
- human, imported, and unknown Origin records;
- origin-preserving same-document copy and restore;
- separate Contribution actor and derivation metadata;
- validated internal and external clipboard behavior; and
- exact `.coedit` recovery of that state.

The same carrier qualification also proves the payload-level replacement and
generic opaque behavior in `INLINE_CONTENT_PAYLOADS.md`.

The Step 3 carrier gate proves that both carrier candidates can support the
accepted text Range behavior. The Step 6 Range gate finalizes and implements the
headless Range service and internal-link Range encoding. It does not require a
comment UI or durable Comment records in the strict MVP.

Post-MVP capabilities include provenance visualization and queries, production
identity and authorization, cross-document origin-catalog exchange, AI-provider
integration, comments and conversations, retention/anonymization controls, and
signed publication claims.

## 3. Vocabulary and logical shape

Use these terms consistently:

- **`application/vnd.coedit.text`:** the Media-Type-labelled InlineContent payload whose canonical state is
  authored Unicode text, intrinsic formatting, and protected fine-grained Origin.
- **Formatting mark:** intrinsic rich-text presentation metadata of `application/vnd.coedit.text`.
- **Opaque link metadata:** inert formatting metadata that the document model
  preserves but does not interpret.
- **Internal Block link:** a document-local link target identified by `BlockId`,
  with an optional Range refinement.
- **Origin:** immutable attribution describing the agent or source that first
  created a logical content unit.
- **Contribution actor:** the Contributor that performed a durable operation in
  this document.
- **Derivation:** a reference explaining that new placement or generated
  material used earlier or external material.
- **CommentTarget:** a future external comment-holder value that combines one
  Range with comment-specific attachment and repair state.

The carrier-neutral logical shape is illustrative:

```text
CoeditTextPayload
  authored Unicode text
  intrinsic formatting marks
  fine-grained origin attribution

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

An Origin record and the Contribution that first uses it publish atomically.
Preallocated IDs allow the records to refer to one another without relying on
commit order.

An OriginRecord describes one authorship/source event, not one character and
not a mutable Contributor profile. Material first authored by the same
Contribution can share one new OriginRecord when its agent, kind, source, and
derivation are identical; distinct attribution inputs require distinct records.
Newly authored material in a later Contribution uses a new OriginRecord even
when the agent is the same. Copy and restore reuse historical records because
those activities change placement or recovery, not authorship.

## 4. Canonical text rules

An empty `application/vnd.coedit.text` value is valid. It contains no authored text and therefore
needs no partial formatting or Origin placeholder. Step 2 represents InlineContent
content with the typed opaque `InlineContentValue`. Step 3 qualifies the
candidate carriers against the complete carrier-neutral behavior below. Step 4
implements that behavior with the selected carrier.

1. Every live authored text unit has exactly one valid `OriginId`.
2. Formatting marks and Origin attribution are part of the same canonical
   collaborative text state and commit atomically with the text they describe.
3. HTML, plain-text projections, ProseMirror JSON, and rendered provenance runs
   are derived representations, not parallel authorities.
4. Ordinary formatting commands can modify formatting marks only. They cannot
   create, change, or remove Origin attribution.
5. A text insertion command assigns Origin explicitly at the trusted
   engine/import boundary. Origin never comes from neighboring text or the active
   formatting mark set.
6. Carrier identifiers are private. Public APIs expose detached,
   carrier-neutral values or controlled editor sessions, never a live
   engine-owned Yjs or Automerge object.
7. Copying text creates new carrier item identities. It does not transfer the
   source InlineContent identity.
8. Moving a Block or InlineContent preserves its complete payload and Origins.
9. The text value can contain line-feed, carriage-return, and other Unicode
   characters. The generic text carrier does not reject them because an
   application can present them as line breaks.
10. `application/vnd.coedit.text` has no canonical `HardBreak` item, sentinel, or presentation
    separator distinct from authored text characters.
11. A Block or InlineContent boundary adds no character to the text value.

An application can define stricter editing behavior. For example, a prose editor
can map Enter to structural commands, map Shift+Enter to a line-feed character,
or reject a character in one context. Such rules are application intent
translation, not generic `application/vnd.coedit.text` validity.

Whole-payload replacement of an `application/vnd.coedit.text` payload is also available under
`INLINE_CONTENT_PAYLOADS.md`. Normal text editing should use the fine-grained
operations in this document when their merge behavior is desired.

## 5. Formatting behavior

The initial formatting vocabulary is:

- bold;
- italic;
- underline;
- strikethrough;
- inline code; and
- link.

A link mark carries one carrier-neutral target value. The target is one of:

```text
OpaqueLinkTarget
  metadata: opaque value subject to implementation resource guards

InternalBlockLinkTarget
  blockId: BlockId
  range?: Range
```

Opaque link metadata is inert document data. The `application/vnd.coedit.text` model validates
only its carrier shape and applicable implementation resource guards. It does
not interpret the metadata as a URL, URI, command, citation, or another
application concept. The presentation or integration layer decides whether and
how to interpret or activate it.

An internal Block link is a document-local typed reference. `blockId` is the
primary target. The optional Range refines navigation to one semantic text
target and resolves only against the current document. It can resolve across
several `application/vnd.coedit.text` InlineContents or Blocks in that document. Embedding the
value in an intrinsic link mark does not create a Range entity or make comments
intrinsic formatting. `RANGE_MODEL.md` owns creation, resolution, lineage order,
and serialization.

Internal link resolution follows these rules:

1. Resolve `blockId` in the selected document Version.
2. If the Block does not resolve, keep the link as valid canonical text content
   and report an unresolved target to the presentation layer.
3. If no range is present, the resolved Block is the complete target.
4. If a Range is present, resolve it through the engine against the selected
   Version.
5. If the Range produces no resolved span or position but the primary Block
   still resolves, fall back to the primary Block. Do not attach the Range to an
   unrelated Block or InlineContent.

Deleting a target Block does not rewrite, delete, or invalidate incoming link
marks. The target reference can remain unresolved in current material and can
resolve in a historical Version where that Block exists. A Block target creates
no ownership relationship and does not prevent Block deletion.

Internal Block targets are document-local. Same-document copy and restore can
preserve them. When an internal link is transferred to another document, the
application must reject it, remove it, or convert it to an external deep link.
The Range service performs no cross-document mapping.

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
marks, replacement, control characters/newlines when present, excluded marks,
and link-target changes. Clearing formatting never changes Origin.

## 6. Origin and activity behavior

Each text operation follows these rules:

| Operation                        | Content Origin                                                              | Contribution actor and derivation                                                 |
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
text receives the editor's new Origin. Unchanged surrounding text retains its
existing Origin.

Payload-level Origin for opaque-payload replacement is specified separately in
`INLINE_CONTENT_PAYLOADS.md`.

## 7. Clipboard contract

The browser adapter can emit three text representations:

1. `text/plain` with visible text only;
2. sanitized `text/html` with supported visible formatting only; and
3. a versioned private Coedit text fragment containing validated semantic text,
   formatting, Origins, source document/Version, and derivation references.

The initial private clipboard type is `application/x-coedit-fragment+json`; its
payload carries its own integer `formatVersion`. Failure to write or read that
custom type does not prevent ordinary text/HTML clipboard behavior.

The private representation is untrusted input even when it originated in
Coedit. Validate its version, sizes, IDs, formatting, Origin references, and
source relationship before use.

**Maturity:** Pending selection.

**Owner:** This document.

**Promotion gate:** Step 3 carrier and clipboard qualification.

Step 3 must profile the selected carrier and private-fragment representation,
then record and test any byte, nesting, collection, or decoded-allocation guards
needed at this boundary. No numeric clipboard maximum is accepted in advance.

The strict MVP preserves Origins from a private fragment only when its source
`DocumentId` matches the target document and every referenced Origin resolves
without conflict. Same-document private fragments can also preserve typed
internal Block link targets. A fragment from another document follows the
external imported/unknown path until the post-MVP cross-document origin-catalog
and internal-link mapping protocols are implemented; it must not rebind source
Block IDs by UUID coincidence.

Ordinary HTML/plain representations omit private Origins, comments, History,
and identity records. An external paste never receives internal-Origin behavior
merely because its HTML resembles Coedit output.

Use DOMPurify or an equivalently reviewed allowlist sanitizer at the clipboard
DOM boundary. ProseMirror schema filtering is defense in depth, not the sole
sanitizer. Link metadata remains inert in canonical content; any presentation
layer that emits an active HTML link or navigation action validates its own
interpretation before activation.

Generic opaque clipboard/drag-drop transport is an application concern until a focused
opaque-payload interchange contract exists. It does not redefine this text clipboard
contract.

## 8. Restore and deletion

Local single-writer restore produces material equal to the selected historical
target while appending a new Contribution. Reinserted text receives fresh
carrier identities and retains the target material's Origins.

In replicated operation, restore additionally names the frontier observed by
its author and obeys the causal compensation rules in
[`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md). It does not delete unseen
concurrent material.

Deleted content and Origin records remain reachable when required to materialize
a Version or resolve text Range lineage. Physical compaction can change their
storage only when every Version, Origin, and required lineage remains exact.
Later anonymization requires a separate product decision; it cannot silently
rewrite History.

## 9. Comment targets

Comments and conversations are external records. Their current text target shape
is:

```text
CommentTarget
  documentId
  range: Range
  state: comment-specific attachment and repair state
```

The stored comment state records the latest deliberate interpretation of the
Range resolution. It is not a license to trust stale offsets, restore an omitted
member by similarity, or silently choose one of several candidates.
`RANGE_MODEL.md` owns Range omission and the reusable result boundary. The later
comments feature owns confidence policy, explicit repair, conversation behavior,
and presentation.

Internal Block-link Range refinement uses the same Range service but not the same
holder lifecycle. A comment is an external record whose attachment state can
require explicit repair. An internal link is intrinsic `application/vnd.coedit.text` formatting
whose `BlockId` remains the primary target; an unresolved optional Range uses the
accepted Block fallback when possible.

Exact confidence thresholds, multi-span comment presentation, and comment repair
UX are post-MVP decisions. Step 3 proves carrier feasibility. Step 6 implements
the reusable headless text Range service without adding an external formatting
or provenance anchor model.

Generic opaque sub-content comment targeting is not defined by the current Range service.

## 10. Selection and awareness

Local text selection, focus, composition state, and remote cursors/selections use
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

Both candidates must run the same `application/vnd.coedit.text` qualification suite before
selection. At minimum it covers:

- exact arbitrary Unicode text preservation, including newline/control-character
  cases selected as valid text fixtures, without a separate hard-break item;
- all formatting boundary policies and overlapping marks;
- exact preservation of opaque link metadata without document-model
  interpretation;
- internal Block links with and without Range refinement, including missing
  Blocks, omitted Range members, and primary Block fallback;
- Origin non-inheritance and protection from ordinary client commands;
- concurrent insertion, deletion, replacement, and formatting at identical and
  adjacent boundaries;
- split, merge, IME, cut, paste, undo, and redo as application/editor operations;
- same-document copy and restore lineage;
- external clipboard stripping and imported/unknown Origin assignment;
- the Step 3 text Range-feasibility cases in `RANGE_MODEL.md`, including direct
  multi-span creation, greedy and positional boundaries, structural tracking,
  lazy resolution, reload, and compaction;
- one transaction spanning Block structure and several InlineContents;
- duplicate, delayed, reordered, partitioned, and reconnected updates;
- exact portable round trip and historical materialization; and
- representative growth and load behavior.

The carrier gate also runs the generic opaque Media Type and whole-payload replacement cases in
`INLINE_CONTENT_PAYLOADS.md`.

Functional invariants are mandatory. `MVP_VERIFICATION_PLAN.md` owns the
experimental shared workload and latency candidates and requires one
run-specific method to be recorded before candidate comparison. Those candidates
are measurement inputs, not acceptance contracts. This specification requires
visible local feedback to stay in the tightest practical loop; routine carrier,
persistence, History, replica, open, reload, checkpoint, materialization, or
export work must not redefine the editor hot path.

Select Yjs when the protected Origin carrier passes without fragile full-state
reconstruction or editor repair. Select Automerge only if its native rich-text,
cursor, head, and storage behavior materially reduces custom machinery and its
ProseMirror integration passes the same suite.

## 13. Required MVP verification

The production implementation repeats the selected carrier's qualification
fixtures as regression tests. In addition, prove:

- malformed or oversized carrier input leaves the base unchanged;
- malformed or over-capacity private clipboard fragments leave the base unchanged and do not disable ordinary HTML/plain fallback;
- caller mutation of detached input cannot mutate engine state;
- a failed command publishes no text, mark, Origin, Contribution, or Version;
- newline or other text characters are not rejected merely because a renderer
  can present them as breaks;
- no Block or InlineContent boundary manufactures a text character;
- opaque link metadata round trips without document-model interpretation;
- same-document internal Block links preserve their `BlockId` and optional Range
  value through copy, restore, carrier round trip, and `.coedit` round trip;
- `.coedit` preserves intrinsic formatting, Origins, Contributors,
  Contributions, and derivation exactly;
- Markdown compares visible semantic marks but intentionally excludes Origin
  identity from its equivalence relation; and
- ordinary Markdown export omits Origins without a warning on every export,
  while an explicitly provenance-preserving export request reports Markdown as
  non-representative.
