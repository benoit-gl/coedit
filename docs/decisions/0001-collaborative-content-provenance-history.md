# ADR-0001: Collaborative content, provenance, History, and persistence

**Status:** Accepted

**Decision date:** 2026-08-25

**Amended:** 2026-09-03

**Scope:** Whole-solution direction, including the strict document-engine MVP,
the carrier-qualification gate, and compatibility requirements for later
provenance, comments, AI, replication, and publication.

## 1. Authority and traceability

This record preserves why the decision was made. Normative behavior belongs in:

- [`../PRODUCT_DOMAIN_MODEL.md`](../PRODUCT_DOMAIN_MODEL.md) for product meaning;
- [`../MVP_CONTRACT.md`](../MVP_CONTRACT.md) for the MVP proof boundary;
- [`../MVP_ARCHITECTURE.md`](../MVP_ARCHITECTURE.md) for component authority;
- [`../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](../ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) for formatting, Origin, clipboard, and Range-holder behavior;
- [`../RANGE_MODEL.md`](../RANGE_MODEL.md) for durable Range behavior and staged representation selection;
- [`../MVP_IMPLEMENTATION_SPEC.md`](../MVP_IMPLEMENTATION_SPEC.md) for private MVP rules;
- [`../MARKDOWN_INTERCHANGE.md`](../MARKDOWN_INTERCHANGE.md) for Markdown import/export behavior;
- [`../PORTABLE_DOCUMENT_FORMAT.md`](../PORTABLE_DOCUMENT_FORMAT.md) for recovery-format requirements;
- [`../BROWSER_PERSISTENCE.md`](../BROWSER_PERSISTENCE.md) for browser repository behavior;
- [`../MVP_VERIFICATION_PLAN.md`](../MVP_VERIFICATION_PLAN.md) for qualification evidence;
- [`../COLLABORATION_MODEL.md`](../COLLABORATION_MODEL.md) for replicated semantics; and
- [`../../SCAFFOLDING_PLAN.md`](../../SCAFFOLDING_PLAN.md) for work order and gates.

If wording here conflicts with the direct authority for a subject, update the
authority and this record together. Do not use an ADR to bypass the documentation
authority model.

## 2. Context

The previous clean-slate direction proposed one generic external
`RangeAnnotation<T>` and an unresolved `TextAnchor` for formatting and future
provenance. That made anchor design a Step 0 implementation blocker. Further
analysis found that it also assigned one mechanism to concerns with materially
different behavior:

- formatting is part of editable rich text and often expands at insertion
  boundaries;
- origin provenance must not be inherited by newly inserted text;
- comments genuinely refer to text from an external durable object; and
- selections are transient collaboration state.

The decision also had to preserve exact History, copy and restore lineage,
future concurrent editing, local durability, portable recovery, AI attribution,
and a path to authenticated or signed claims.

## 3. Decision

### 3.1 Formatting is intrinsic collaborative metadata

Formatting is represented by the selected collaborative-content carrier's
native rich-text marks or equivalent inline attributes. It is not duplicated in
an external range table and is not stored as visible sentinel characters.

Every mark kind defines explicit insertion-boundary expansion behavior. The
initial vocabulary is bold, italic, underline, strikethrough, inline code, and a
safe link destination. HTML and plain text remain derived projections.

### 3.2 Provenance is content-native origin metadata

Durable fine-grained provenance is attached to inserted logical content units
through protected, hidden carrier metadata. A renderer may coalesce adjacent
equal origins into display runs, but those runs are a query result rather than a
durable `RangeAnnotation<Provenance>` entity.

Each logical content unit has one origin attribution. An origin can identify a
human, imported source, automation, or AI/software agent and can refer to source
or derivation records. Origin metadata never inherits merely because an
insertion occurs beside existing text.

The strict MVP must qualify this carrier behavior before the implementation and
portable format are frozen. A provenance explorer, production provenance UI,
identity authentication, retention controls, and signed publication claims
remain later capabilities.

### 3.3 Origin and operation attribution are distinct

Origin answers who or what authored the content. A Contribution answers who
performed an operation in this document.

Copying or restoring attributed content creates new CRDT identities but retains
the source origin attribution. The copy or restore Contribution records the
acting contributor and derivation/source Version. There is no separate
"restored provenance" category.

New material created by editing an existing passage receives the origin of the
agent that created the new material. Clearing formatting cannot clear origin.

### 3.4 Clipboard semantics are explicit

An internal Coedit clipboard representation carries semantic content,
formatting, origin metadata, source-document identity, and derivation references.
It is private to consenting Coedit-to-Coedit transfer.

Ordinary `text/plain` and sanitized `text/html` clipboard representations do
not expose private provenance. Pasting external material records the paste
actor separately and assigns an imported or unknown origin unless trustworthy
source metadata is available. It must not manufacture an authorship claim for
the paster.

### 3.5 Comments use external Range holders; selections do not

A future durable comment or conversation is an external record that holds one
durable Range plus comment-specific attachment and repair state. The Range can
refer to one or several semantic spans across Blocks and InlineContents. The
Range service owns stable carrier positions, affinity, lineage, and
carrier-neutral evidence. It omits unresolved or ambiguous members and never
attaches them to merely similar text.

The complete comment state machine and repair experience remain post-MVP. They
consume the shared Range service and do not redefine Range kind or resolution.

Selections, focus, cursors, and typing state remain transient awareness data
unless a future feature deliberately creates a durable named selection.

### 3.6 One logical collaborative document is the default boundary

The default private representation is one logical collaborative document per
Coedit document, containing the Block registry and order, all InlineContents,
and the metadata needed for atomic multi-target operations. Individual editor
instances bind only the active InlineContent.

This is not a public `Y.Doc` contract. Sharding, subdocuments, or another
physical layout requires measured evidence and must preserve atomic
cross-content and structure-plus-text Contributions.

The ProseMirror schema remains deliberately flat inside one InlineContent:
text, hard breaks, and supported inline marks. The recursive Coedit Block tree
does not become a ProseMirror document tree.

### 3.7 Product History is separate from CRDT transport

A Contribution is an immutable, attributed semantic activity. A Version is a
materializable causal frontier. Every Version remains exactly materializable
for the lifetime of its document. Product History is not reconstructed from
editor transactions, debounce windows, Yjs updates, transport packets, or
wall-clock ordering.

Every successful durable command has one immutable Contribution/event identity,
which references its exact convergence effects and can carry a semantic group
ID. History presentation may group adjacent Contributions without rewriting or
deleting physical records. Crash journaling and human-readable grouping are
separate concerns.

Physical materialization snapshots, recovery checkpoints, caches, structural
sharing, and compaction can accelerate access. They create no product Version
and cannot remove a Version or the lineage needed to resolve a durable Range.

The future replicated Contribution envelope includes at least document and
Contribution IDs, parent frontier, acting contributor, originating replica,
schema/capability version, semantic kind and group, affected targets, exact
convergence effect or its verified reference, source/derivation references,
and display metadata. Peer or client IDs are never treated as contributor IDs.

### 3.8 Restore is causal compensation

Restore appends a new attributed Contribution. It never installs an old CRDT
snapshot as the current replicated state and never deletes History.

A restore command names the target Version and the causal frontier observed by
its author. Its semantic inverse removes or compensates only effects known at
that observed frontier, applies against the current merged state, and preserves
unseen concurrent insertions. Historically deleted content is reinserted under
new carrier identities with its origin metadata retained. The restore
Contribution records the restoring actor and target Version.

If same-region or structural work cannot be merged without ambiguity, the
engine exposes a conflict or a separately authorized coordinated "restore for
everyone" operation. It does not silently discard concurrent work.

### 3.9 Persistence uses a journal and checkpoints

The engine, not the UX, owns durable repository records. Browser persistence
uses IndexedDB behind an engine repository adapter with:

- immutable incremental update/Contribution records;
- periodic validated checkpoints;
- a small compare-and-swap head record; and
- recovery that replays a checkpoint plus subsequent records.

The UX may transport an opaque `.coedit` artifact, but IndexedDB need not store
and rewrite that entire artifact for every autosave. Serialize expensive bytes
before opening the short IndexedDB transaction. Surface quota and persistence
status through `StorageManager`, retain exact failed work for retry, and never
claim durability after a failed write.

Complete snapshots per Contribution and a monolithic JSON artifact are allowed
only as explicitly bounded prototype techniques. They are not target storage
contracts. The portable format separates its logical schema from
carrier-specific chunks and can later move from bounded JSON/base64 to a
manifest plus binary chunks without changing product ontology.

### 3.10 AI uses the ordinary command and provenance boundary

An AI adapter reads an explicit Version and proposes typed engine operations.
It receives no raw live CRDT or private-storage authority. AI-generated material
is attributed to a software agent, with provider/model/version, source Version,
and derivation metadata where available. Human acceptance is a separate
Contribution and does not reattribute the generated content to the human.

### 3.11 Provenance has explicit trust levels

Local provenance is a descriptive assertion, not cryptographic proof. Keep
three levels distinct:

1. descriptive local provenance;
2. authenticated engine/relay-enforced attribution; and
3. signed publication/export attestations, potentially using C2PA.

Principal, Contributor, replica, session, and transport identities remain
separate. Profile information is referenced separately from stable attribution
IDs so retention, anonymization, and erasure policies can be implemented.

### 3.12 Technology choices

| Concern                   | Decision                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser/application stack | Keep React, strict TypeScript, Vite, and Vitest.                                                                                                    |
| Rich-text editor          | Keep Tiptap/ProseMirror behind a narrow adapter.                                                                                                    |
| Collaborative carrier     | Yjs stable v13 is the provisional default; qualify it against Automerge before freezing the carrier or portable encoding.                           |
| Yjs v14                   | Track its native attribution facilities; do not use release candidates as the production baseline.                                                  |
| Automerge                 | The only current whole-engine challenger; run the same qualification suite against its rich text, cursors, heads, ProseMirror binding, and storage. |
| Loro                      | Retain as a movable-tree/cursor benchmark; do not adopt its current ProseMirror binding or combine it with Yjs.                                     |
| Markdown                  | Keep unified, remark-parse, and remark-gfm. Literalize raw HTML under the current contract.                                                         |
| Sanitization              | Apply an allowlist sanitizer after any unsafe HTML/HAST transform; use DOMPurify or equivalent at DOM and clipboard boundaries.                     |
| Browser persistence       | Keep native IndexedDB; a small reviewed wrapper is optional. Defer OPFS and SQLite-WASM until measurement.                                          |
| Native shell              | Keep browser-first. Reconsider Tauri as a thin adapter only after a demonstrated browser-inadequate need.                                           |
| Future synchronization    | Hocuspocus or a managed Yjs provider can transport updates, but Coedit retains its semantic Contribution envelope and validation.                   |

## 4. Carrier-qualification gate

Before the CollaborativeContent implementation and `.coedit` carrier encoding are
frozen, run the same headless and editor-integrated suite against Yjs v13 and
Automerge. Track Yjs v14 for a later rerun after stable release.

The suite must cover:

- concurrent insertion, deletion, and formatting at both boundaries;
- explicit mark expansion policies;
- origin assignment that never accidentally inherits or permits ordinary
  formatting commands to erase it;
- internal/external copy and paste, restore, split, merge, hard break, IME,
  undo, and redo;
- atomic structure-plus-text and multi-InlineContent operations;
- stable comment cursors through editing, deletion, reload, and recovery;
- partition, duplicate, delay, and reorder convergence in two replicas;
- causal restore preserving unseen concurrent work;
- compaction/garbage-collection that preserves every Version, Origin, required
  Range lineage, and future comment target;
- representative 100,000-character content and 5,000-Contribution load,
  growth, save/open, and materialization behavior; and
- portable round-trip without exposing carrier types in public APIs.

Select Yjs when its protected metadata carrier is incremental, non-inheriting,
and passes the suite without fragile ProseMirror repair code. Select Automerge
only when its native model removes enough custom machinery to outweigh the
maturity risk of its editor and repository integrations. Loro requires a new
decision after its integration matures or after a deliberate decision to build
a custom adapter.

This is an implementation qualification gate, not a reopened product-domain
question. Step 1 scaffolding is complete, and the pure Block domain can proceed before it;
carrier-dependent implementation and portable-format freeze cannot.

## 5. Consequences

Positive consequences:

- Formatting no longer depends on an unsolved general-purpose TextAnchor.
- Authorship survives copy and restore without confusing origin with actor.
- Comments receive stronger repair behavior than a single CRDT cursor provides.
- One collaborative boundary permits atomic structure/text/history operations.
- The public engine remains independent of Yjs, Automerge, storage chunks, and
  synchronization providers.
- Persistence can grow incrementally instead of cloning the entire archive on
  every edit.
- AI and signed publication fit the same provenance vocabulary without becoming
  privileged mutation paths.

Costs and constraints:

- The origin carrier must be protected from ordinary mark manipulation and from
  actor spoofing at trusted boundaries.
- Copy, paste, restore, retention, and anonymization require explicit policies.
- Causal restore and concurrent Block moves remain substantially harder than
  ordinary CRDT text convergence.
- A bounded carrier bake-off is required before format version 1 can be frozen.
- Carrier-specific state must remain behind adapters and migration boundaries.

## 6. Alternatives considered

### Generic external ranges for formatting and provenance

Rejected. It duplicates rich-text structure, creates difficult boundary and
atomicity rules, and incorrectly implies that provenance inherits like
formatting. External anchors remain appropriate for comments.

### Literal inline marker characters

Rejected. They contaminate textual semantics, clipboard/export behavior,
offsets, searching, and accessibility. Hidden carrier attributes provide the
desired locality without becoming manuscript characters.

### Derive all provenance from History

Rejected as the canonical model. Git-style blame is useful as a projection, but
copy/move inference is heuristic, deleted text disappears from the current view,
and compacted carrier-level history can change an inferred answer.

### Treat restore or paste actor as the content author

Rejected. It loses origin lineage and conflates Entity attribution with Activity
association. The operation actor remains independently recorded.

### Replace the stack with an adjacent editor or local-first system

Etherpad, CKEditor, BlockNote, BlockSuite, SuperDoc, Fluid, Jazz, Replicache, and
ElectricSQL were rejected as whole-solution replacements. Each solves a useful adjacent problem,
but none provides Coedit's combined Block/lens ontology, local engine boundary,
rich-text lineage, semantic causal History, portable recovery, and later AI
model. Etherpad remains the most important behavioral reference.

### Adopt OPFS, SQLite-WASM, PGlite, RxDB, Tauri, or Electron now

Deferred or rejected for the browser MVP. These add deployment, worker,
multi-tab, or packaging complexity without resolving content semantics.
Tauri can later wrap the validated browser application; Electron is justified
only by a demonstrated requirement for a bundled consistent Chromium runtime.

## 7. State-of-the-art evidence

- [Etherpad attributed text and changesets](https://docs.etherpad.org/api/changeset_library.html)
  and [database representation](https://docs.etherpad.org/database.html) validate
  inline-equivalent origin attribution plus separate revision actors.
- [Etherpad `Pad`](https://github.com/ether/etherpad/blob/develop/src/node/db/Pad.ts)
  and [restore API](https://github.com/ether/etherpad/blob/develop/src/node/db/API.ts)
  demonstrate origin-preserving copy/restore behavior.
- [Yjs relative positions](https://github.com/yjs/docs/blob/main/api/relative-positions.md)
  provide stable carrier-local cursor semantics; [Yjs document updates](https://docs.yjs.dev/api/document-updates)
  define commutative, associative, and idempotent update behavior.
- [Yjs attribution design](https://github.com/yjs/yjs/blob/main/attributing-content.md)
  is promising but currently belongs to the unstable v14 line.
- [Automerge rich text](https://automerge.org/docs/reference/documents/rich-text/)
  and [automerge-prosemirror](https://github.com/automerge/automerge-prosemirror)
  provide the strongest current alternative carrier.
- [Loro text](https://www.loro.dev/docs/tutorial/text), [cursors](https://www.loro.dev/docs/tutorial/cursor),
  and [movable tree](https://www.loro.dev/docs/tutorial/tree) inform the
  qualification suite without justifying current adoption.
- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) and
  [Hypothesis anchoring](https://github.com/hypothesis/client/blob/main/src/annotator/anchoring/html.ts)
  support the cursor-plus-quote/context evidence used by durable Ranges.
- [W3C PROV-DM](https://www.w3.org/TR/2013/REC-prov-dm-20130430/)
  supplies the Entity/Activity/Agent and derivation distinctions.
- [Stencila Content Credentials](https://stencila.io/docs/content-credentials/)
  demonstrates structured AI/human provenance, while [C2PA](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html)
  provides a later signed-publication layer.
- [Google Docs version history](https://support.google.com/docs/answer/190843?hl=en_)
  and [Overleaf history](https://docs.overleaf.com/writing-and-editing/history-and-versioning)
  validate grouped and named History UX without providing a reusable lineage
  implementation.
- [IndexedDB best practices](https://web.dev/articles/indexeddb-best-practices-app-state)
  and the [StorageManager API](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager)
  inform incremental persistence, quota handling, and recovery UX.
