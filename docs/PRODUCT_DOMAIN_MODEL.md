# Product and domain model direction

**Status:** Accepted clean-slate domain direction; directional, not a storage schema.

**Clean-slate baseline:** 2026-08-25.

This document defines the logical product ontology for Coedit. It defines what durable document concepts mean. It does not define the public engine API, implementation order, portable wire format, or replication protocol.

Use these documents for those concerns:

- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) defines what the document-engine prototype must prove.
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`CAPACITY_AND_PERFORMANCE_TARGETS.md`](CAPACITY_AND_PERFORMANCE_TARGETS.md) defines cross-cutting capacity and resource semantics.
- [`INLINE_CONTENT_PAYLOADS.md`](INLINE_CONTENT_PAYLOADS.md) defines InlineContent Media Types, universal whole-payload replacement, and payload convergence.
- [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) defines detailed `application/vnd.coedit.text` formatting, Origin, clipboard, link-holder, and comment-holder behavior.
- [`RANGE_MODEL.md`](RANGE_MODEL.md) defines durable multi-span and positional Range behavior inside `application/vnd.coedit.text` payloads.
- [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) defines private MVP implementation contracts that are not owned by focused specifications.
- [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md) defines Markdown interchange semantics.
- [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md) defines the `.coedit` recovery format.
- [`BROWSER_PERSISTENCE.md`](BROWSER_PERSISTENCE.md) defines the incremental browser repository and recovery contract.
- [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) defines implementation order and phase gates.
- [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) defines post-MVP replication constraints.

The earlier product-domain snapshot remains on `tauri-experimental-orphan`. It is historical evidence. [`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) records how material preserved decisions map to the current clean-slate direction.

## 1. Product thesis

Coedit should feel like one coherent document, not a tree database with an editor attached.

An author should experience chapters, sections, paragraphs, list items, optional alternate content, History, comments, discussions, and later collaborator contributions as related material in one inspectable document. The hierarchy gives stable structure. The hierarchy must not dominate ordinary writing.

The current MVP is a **document-engine prototype**. It validates the document model, editing boundary, History, projections, Markdown interchange, and durability. AI is not an MVP requirement. A later AI integration acts as an additional contributor through the same engine boundary as other clients.

## 2. Product principles

### 2.1 The document is the primary object

The user works with one document made of meaningful structural and content units. Internal records support that model. Internal records must not define the user experience.

### 2.2 Structure and content share one surface

Outline navigation and manuscript rendering are projections of the same Blocks. A displayed heading and its outline label normally use the same selected InlineContent.

A Block or InlineContent boundary is structural. It does not itself insert a space, line break, paragraph break, or another textual separator. The application decides how structure is presented.

### 2.3 The Block model is generic

The structural core uses one recursive `Block` type. `Idea`, `Heading`, `Body`, `Paragraph`, and `Leaf` are not persisted entity types.

A Block can act as a document root, section, paragraph, list item, or grouping container because of its structural context. Its persisted type does not change with that role.

### 2.4 History is first-class

Each committed durable mutation creates one attributed Contribution. Historical Versions are inspectable without mutation. Restore creates a new compensating Contribution. Restore never deletes or rewinds History.

Earlier working and checkpointed states remain in History. They do not require parallel live copies.

### 2.5 Optional simultaneous contents are allowed

A Block can contain zero, one, or several InlineContents. Several InlineContents are optional. The ordinary case can contain one.

Use several InlineContents only when several content values must coexist in one materialized Version, for example a main text and a maintained summary.

### 2.6 Contributors use one mutation boundary

Human users, imports, automation, and later AI collaborators use the same durable command and Contribution boundary. No collaborator gets a privileged persistence path.

### 2.7 Payload metadata follows its semantics

`InlineContent` is payload-neutral at the document level. The fine-grained Media Type is `application/vnd.coedit.text`; all other supported Media Types initially use the generic opaque capability set.

Formatting is intrinsic metadata of `application/vnd.coedit.text`. Fine-grained Origin provenance is protected `application/vnd.coedit.text` metadata that travels with authored text but never inherits from neighboring text. A opaque payload has one payload-level Origin for its current whole value. Comments are external records with repairable text targets. Ordinary selections are transient.

These concerns share atomic versioning where required, but formatting and Origin do not use a generic external anchor. Internal links, comments, navigation, and later durable reference holders can use the shared Range value for `application/vnd.coedit.text` without making Range a universal payload, formatting, or provenance entity.

### 2.8 Presentation is a projection

Lens selection, historical selection, pane layout, disclosure, focus, navigation, textual separators, and content rendering are presentation state unless the product explicitly makes one of them durable document material.

## 3. Core structural model

### 3.1 One recursive Block tree

A `Block` is a stable structural unit in the document spine.

The logical model is:

```text
RevisionedDocument
  root: Block

Block
  id: BlockId
  tags: TagSet
  childrenPresentation: ChildrenPresentation
  contents: InlineContent[]
  children: Block[]

InlineContent
  id: InlineContentId
  tags: TagSet
  payload: InlineContentPayload

InlineContentPayload
  mediaType: MediaType
  value: Media-Type-specific collaborative state

application/vnd.coedit.text capability
  authored Unicode text
  intrinsic formatting marks
  protected fine-grained origin attribution

Generic opaque capability
  exact payload bytes
  payload-level Origin

OriginRecord
  id: OriginId
  agentId: ContributorId
  kind: human | imported | automation | ai | unknown
  source and derivation references when applicable
```

`InlineContent` is the independently addressable content entity owned by a Block. It owns identity, tags, and one Media-Type-labelled collaborative payload.

The payload has no independent product identity, tags, lifecycle, or sharing relationship. A storage implementation can index carrier state by `InlineContentId`, but that index does not create another domain entity.

The document model does not interpret payload text or bytes. Payload-specific contracts define valid fine-grained operations. Every Media Type supports whole-payload replacement through the engine boundary and must converge under replication.

There is no current `BlockContent` entity. The preserved experimental branch used `BlockContent` as a separate identity layer. On `main`, `InlineContent` owns that identity and those tags directly.

Blocks and InlineContents do not initially contain `createdAt`, `updatedAt`, `deletedAt`, or tombstone fields. Contributions and historical Versions record lifecycle and recovery. Private storage or future replication can retain physical tombstones or causal data without adding them to the logical live entities.

### 3.2 Root and ownership invariants

The clean-slate model requires these invariants:

1. A document has exactly one real root Block.
2. The root cannot be moved or deleted.
3. Each non-root Block has exactly one parent.
4. Each Block ID is unique within the document.
5. Each InlineContent ID is unique within the document.
6. Each InlineContent belongs to exactly one Block.
7. Each InlineContent owns exactly one Media-Type-labelled payload.
8. Every InlineContent payload supports atomic whole-payload replacement with explicit Origin behavior.
9. An `application/vnd.coedit.text` payload owns its text, intrinsic formatting, and fine-grained Origin metadata as one canonical collaborative state.
10. A payload using the generic opaque capability set owns exact bytes and one payload-level Origin for its current value.
11. Sibling order is the order of the parent's `children` vector.
12. InlineContent order is the order of the Block's `contents` vector.
13. The live Block tree contains no cycle.
14. Crossing a Block or InlineContent boundary implies no textual separator.

These invariants do not impose finite document-size, tag-size, payload-size, or tree-depth maxima. `CAPACITY_AND_PERFORMANCE_TARGETS.md` controls capacity semantics, and focused payload/implementation contracts own current boundary behavior.

All durable user-created and domain entity identities use canonical lowercase UUID-v4 values. Trusted construction or application code allocates them; pure structural reducers never generate identities. The Step 2 domain rejects duplicate Block and InlineContent IDs in the live structure but keeps no lifetime-ID registry. Once History exists, it rejects reuse of an identity across retained lifetimes, and portable validation enforces the same rule when opening a document.

Document/genesis construction creates the one real root through a trusted factory such as `createEmptyDocument(...)`. Root construction is not a structural mutation, and `CreateBlock` always creates a non-root child under a real parent. Genesis includes the initial root but no Contribution; the first successful user mutation creates the first Contribution.

### 3.3 Content role is contextual

A Block does not persist a heading/body/list-item role. Incoming structural context and the selected InlineContent payload determine how content renders.

The initial writing application renders selected `application/vnd.coedit.text` payloads with this precedence:

1. selected content on the root renders as the document title;
2. selected content on a child of `sections` renders as a section heading;
3. selected content on a child of `flow` renders as body flow;
4. selected content on a child of `bullets` or `numbers` renders as a list item; and
5. a contentless Block renders no content of its own.

These rules select application presentation. They do not manufacture characters inside the payload. A future opaque-payload renderer can use the same structural context without redefining Block ontology.

A contentful Block can also own children. Its `childrenPresentation` controls how those children render.

### 3.4 Child presentation belongs to the parent

`childrenPresentation` describes the relationship between a parent and its direct children. The initial closed vocabulary is:

```text
sections
flow
bullets
numbers
```

The same Block type supports all four cases. Do not create separate structural entity types for these presentations.

### 3.5 Contentless Blocks are transparent groups

A non-root Block with no InlineContents is a transparent grouping Block. It emits no heading, prose, list-item text, or other payload of its own. Its children render according to its `childrenPresentation`.

An authored but empty section or list item normally owns one empty `application/vnd.coedit.text` InlineContent. This preserves the distinction between an empty authored unit and a structural grouping container without making emptiness or textual separators structural characters.

### 3.6 Introductory prose uses child flow

A section heading belongs to the section Block. Introductory body material below that heading is represented by child Blocks in `flow` presentation.

When one section contains both body material and subsections, transparent grouping Blocks can keep the two child relationships explicit. `MARKDOWN_INTERCHANGE.md` defines the canonical Markdown construction rule.

## 4. InlineContent payloads and collaborative text

### 4.1 InlineContent is the selectable content identity

`InlineContent` provides the identity required for editing, tags, payload Origin, copies, optional simultaneous representations, and payload-specific durable references where supported.

Most Blocks can contain one InlineContent. Zero contents are valid for grouping Blocks. Additional InlineContents exist only when the product needs simultaneous material.

During Step 2, `InlineContentValue` is typed and opaque to structural code. Structural operations can create, move, tag, reorder, and delete InlineContents without inspecting payload internals. Step 3 qualifies the candidate carriers against `application/vnd.coedit.text` plus representative generic opaque Media Types, including `application/octet-stream`. Step 4 implements that behavior with the selected carrier. No intermediate step creates partially valid attributed text or interprets opaque payload bytes.

### 4.2 No mandatory content role enum

InlineContent does not require `ContentForm`, `ContentStage`, `ContentRole`, `Primary`, `Summary`, `Working`, `Accepted`, or `Checkpoint` fields.

The application expresses product conventions with namespaced tags, lens rules, Media Type, and History Contributions.

Examples:

```text
Block tag:         topic:provenance
InlineContent tag: view:main
InlineContent tag: view:summary
InlineContent tag: user:needs-citation
Media Type:        application/vnd.coedit.text
History kind:      checkpoint
```

### 4.3 Tags have independent owners

Block tags and InlineContent tags use the same normalization rules. Their ownership is independent.

A Block tag describes the semantic structural unit across its contents. An InlineContent tag describes one specific content value. Tags do not inherit or synchronize automatically between these owners.

### 4.4 Media Type is explicit

Each InlineContent owns one payload labelled with an Internet Media Type. `INLINE_CONTENT_PAYLOADS.md` owns the detailed rules.

The Media Type is stable for ordinary replacement during the current InlineContent lifetime. Whole-payload replacement can keep or change the Media Type atomically. Any application-level conversion semantics remain an adapter concern; the document model needs no separate conversion operation.

Every payload supports atomic whole-payload replacement. Media-Type-specific contracts can expose additional fine-grained operations. `application/vnd.coedit.text` does; all other supported Media Types initially use the generic opaque capability set.

Concurrent whole-payload replacements converge deterministically. Causally later replacements supersede observed replacements. Concurrent replacements choose one deterministic current winner without using packet arrival order or wall-clock time. Losing replacements remain in immutable History and their Versions remain materializable.

### 4.5 `application/vnd.coedit.text` is canonical collaborative text

An `application/vnd.coedit.text` payload is the canonical state of authored Unicode text, intrinsic formatting, and protected fine-grained Origin attribution. HTML, plain text projections, ProseMirror JSON, rendered attribution runs, and Markdown are derived representations. They are not parallel authorities.

There is no document-level `HardBreak` content item. Line-feed, carriage-return, and other characters can exist as text data. The writing application, editor adapter, Markdown adapter, or renderer decides whether to accept, reject, normalize, insert, or present them. That policy does not change the generic document validity of the textual payload.

The carrier is private behind the document engine. Yjs stable v13 is the provisional implementation default, not a public domain type. The Elaboration carrier gate compares it with Automerge before carrier-dependent implementation and portable encoding are frozen.

### 4.6 Formatting belongs to `application/vnd.coedit.text`

Initial formatting values include bold, italic, underline, strikethrough, inline code, and link with a carrier-neutral target. Ordinary link metadata is opaque to the document model; typed internal Block links are interpreted only according to the focused attributed-text contract.

Each mark has explicit start/end expansion behavior. Initial defaults expand bold, italic, underline, and strikethrough at both boundaries; inline code and links expand at neither boundary. Detailed insertion, overlap, replacement, and clearing semantics are defined in `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

Formatting marks commit atomically with the text they describe. There is no external formatting table or general-purpose formatting `TextAnchor`.

Generic opaque payloads have no intrinsic formatting operations under the initial contract.

### 4.7 Origin follows payload semantics

Origin identifies the human, imported source, automation, AI/software agent, or unknown source that created logical payload material. It is distinct from the Contributor who later copies, moves, formats, pastes, replaces, or restores that material.

In `application/vnd.coedit.text`, newly inserted material receives explicit fine-grained Origin and never inherits Origin from adjacent text. Ordinary formatting operations cannot create, alter, or erase it. A query or renderer can coalesce adjacent equal origins into display spans, but those spans are not durable `RangeAnnotation<Provenance>` entities.

For every Media Type using the generic opaque capability set, the current whole payload has one Origin. Whole-payload replacement supplies the new payload Origin. A future structured payload can define finer Origin granularity only through its own payload contract.

There is no `restored` origin kind. Restore is an activity, not an authorship category.

### 4.8 Copy and move preserve different identities

Moving a Block or reordering an InlineContent preserves the InlineContent identity, Media Type, complete payload state, and Origins.

Copying an InlineContent entity creates a new InlineContent ID and new carrier item identities where the payload has such identities. Same-document copy preserves the source Media Type and Origin according to the payload contract and records a copy Contribution with source/derivation references.

Ordinary `application/vnd.coedit.text` copy/paste inserts text into the target InlineContent. It does not transfer the source InlineContent identity. A validated private Coedit clipboard representation preserves same-document Origins; ordinary external HTML or plain text receives imported or unknown Origin and never manufactures authorship for the paster.

Generic opaque copy and restore operate at whole-payload granularity under the initial contract.

### 4.9 Durable Range references are `application/vnd.coedit.text` values

A Range is a document-relative durable semantic reference value supplied and resolved by the document engine for `application/vnd.coedit.text`. It records a document-scoped creation Version and the original Block and InlineContent location of each source member. It is not an independently identified product entity, document-owned registry entry, formatting annotation, provenance record, or universal payload locator.

A Range can be stored outside the document, as with a future comment, or embedded as inert target metadata in an intrinsic internal-link mark. A Span Range preserves its source members in creation order without sorting, merging, or deduplication. Its members follow movement, split, and merge lineage but not copy lineage. A Positional Range refers to one logical text position and remains distinct from a zero-length Span. `RANGE_MODEL.md` owns their detailed behavior and staged representation decision.

An opaque InlineContent remains addressable by its `InlineContentId`, but the current Range service does not address subregions inside opaque payload bytes.

## 5. History, Versions, Contributions, and Checkpoints

### 5.1 Terms

Use these terms consistently:

- **Contribution:** one immutable, attributed durable semantic activity, including its acting Contributor, base/frontier, kind, optional semantic group, exact effect reference, affected targets, and optional source/derivation references.
- **Version:** one materializable state of the document.
- **History:** immutable Contributions and permanently materializable Versions for the lifetime of the document.
- **VersionToken:** the opaque public identifier for a Version.
- **Checkpoint:** one semantic Contribution that marks an exact point in History and produces a new content-identical Version.

The private MVP can implement a linear revision ledger and use complete snapshots in bounded tests or an identified early prototype. The browser target uses immutable effects plus periodic physical recovery checkpoints or cached materializations. These private optimizations do not create product Versions and cannot make an existing Version unavailable.

Semantic editor groups and physical recovery checkpoints are not semantic Checkpoints.

### 5.2 Historical state is read-only

Historical materialization returns detached, read-only state. Entering or leaving historical viewing does not mutate the current Version.

Restore creates a new Contribution from the current Version to material that matches the selected historical target according to the engine restore contract.

### 5.3 Checkpoints are Version-producing Contributions

A Checkpoint is a first-class durable interaction. It is not a mutable tag or pointer attached outside History.

Creating a Checkpoint records who created it, its causal/base Version, and its place in History. The Checkpoint Contribution produces a new Version whose document material is identical to its base Version.

A Checkpoint does not mean final, published, approved, or immutable. A document can contain zero, one, or many Checkpoints.

### 5.4 History and simultaneous contents are different

Two states of one payload at different times belong in History.

Two payload values that must exist at the same time belong in separate InlineContents in one Version.

Do not create extra live InlineContents only to preserve an old draft or checkpointed state.

## 6. Lenses and projections

A Lens is an application-level presentation query over a selected Version.

The initial model allows a lens to:

- choose the current Version or an exact historical Version;
- choose one InlineContent per Block with deterministic tag and fallback rules;
- select a subtree; and
- add later overlays without changing the underlying document.

Within one materialized Version, initial lenses preserve the complete Block tree. A lens does not silently reparent Blocks.

Initial content selection is:

- default/main selects the first `view:main` InlineContent, or the first InlineContent when no match exists;
- summary selects the first `view:summary` InlineContent, or falls back to default/main;
- several matching InlineContents select the first in vector order and produce a projection diagnostic; and
- zero contents produces no own rendered content.

Lens selection is transient UI state unless a later feature explicitly makes a named lens durable.

## 7. Markdown interchange

Markdown is an interchange format, not a native recovery representation.

For each successfully imported Markdown document, export and re-import must preserve the normalized Coedit structure and semantic `application/vnd.coedit.text` content defined in `MARKDOWN_INTERCHANGE.md`.

This requirement does not mean that every arbitrary Coedit tree or Media Type is exactly representable in Markdown. Non-representable constructs, including opaque payloads unless an application-level Markdown representation is later defined, must produce explicit export diagnostics.

## 8. Comments, conversations, and provenance

Minimum `application/vnd.coedit.text` Origin and its copy/restore invariants and opaque-payload Origin are part of the content foundation. Production provenance visualization, analytics, retention policy, authenticated claims, and signing remain later product phases.

Comments and durable conversations are typed external records that can hold a Range value plus comment-specific attachment and repair state for `application/vnd.coedit.text`. They are not disguised manuscript Blocks, InlineContents, or Range entities. They never silently reattach to an uncertain match.

Comments are a primary durable use case for a target outside authored text. Internal links can embed the same Range value as a finer text target while retaining a primary Block fallback. Ordinary selections and remote cursors remain transient. `RANGE_MODEL.md` owns text Range behavior; `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns link and comment-holder behavior.

## 9. Contributor model and future AI collaboration

Contributor identity is durable agent attribution identity. It is separate from a UI session, security principal, replica/device, network connection, or carrier client ID.

The domain allows contributor kinds such as human, imported, unknown, automation, and AI. The strict MVP needs human plus imported/unknown attribution.

For MVP bootstrap, the UX can request a free-form human display name before document-session creation. This does not imply an account or persistent user-profile model.

A later AI collaborator queries explicit Versions and submits ordinary typed commands. AI-originated content is attributed to the software agent. Human acceptance is a separate Contribution and does not reattribute that content to the human. AI does not get direct private-storage or live-carrier access.

## 10. Workspace composition

The rendered workspace is derived from:

```text
materialized Version
+ content-selection lens
+ payload-aware rendering
+ optional overlays
+ transient layout/navigation state
= rendered workspace
```

The product can show several projections at the same time. No fixed pane layout is a domain requirement.

Only one `application/vnd.coedit.text` InlineContent needs to own active rich-text editor machinery at one time in the initial browser implementation. A opaque payload can use a different application adapter without changing the document ontology.

## 11. Recorded clean-slate decisions

The current ontology requires:

1. one recursive Block tree;
2. one real root Block;
3. no persisted `Idea`, `Heading`, `Body`, `Paragraph`, or `Leaf` entity types;
4. Block-owned tags, child presentation, ordered InlineContents, and ordered child Blocks;
5. InlineContent-owned identity, tags, and one Media-Type-labelled collaborative payload;
6. the fine-grained `application/vnd.coedit.text` Media Type and generic opaque Media Types;
7. universal atomic whole-payload replacement for every Media Type;
8. deterministic convergence for concurrent whole-payload replacements without arrival-order or wall-clock arbitration;
9. no separate Media Type conversion operation;
10. no current `BlockContent` entity;
11. no independent product identity for an InlineContent payload;
12. contextual title/heading/prose/list-item rendering;
13. no textual separator implied by Block or InlineContent boundaries;
14. parent-owned `childrenPresentation`;
15. transparent contentless grouping Blocks;
16. one empty `application/vnd.coedit.text` InlineContent for an authored empty textual structural unit;
17. optional, not mandatory, multiple InlineContents;
18. no mandatory InlineContent form/stage/role enum;
19. independent Block and InlineContent tag ownership;
20. application-owned tag namespaces for product conventions;
21. no logical live entity timestamps or tombstones initially;
22. recoverability of deleted live entities through historical Versions;
23. earlier working/checkpointed states in History rather than parallel live contents;
24. semantic Checkpoints as attributed content-identical Version-producing Contributions;
25. detached read-only historical viewing;
26. append-only compensating restore;
27. Contribution-level MVP activity attribution;
28. intrinsic native formatting marks with explicit boundary expansion for `application/vnd.coedit.text`;
29. protected, non-inheriting fine-grained `application/vnd.coedit.text` Origin and payload-level opaque-payload Origin, both distinct from Contribution actor;
30. origin-preserving copy and restore with separate operation derivation;
31. external repairable text targets for comments rather than formatting or provenance;
32. transient ordinary selections and presence;
33. one shared Block spine for initial lenses within a Version;
34. one logical collaborative document per Coedit document by default, hidden behind the engine;
35. Range as a durable `application/vnd.coedit.text` value and engine service rather than a canonical entity or registry;
36. direct one-span and multi-span Range creation;
37. greedy Span Ranges and Block-local preceding-sticky Positional Ranges;
38. Range resolution in creation and lineage order, independent of current Block tree order;
39. exact text concatenation without inferred structural separators or deduplication;
40. Range lineage through movement, split, and merge but not copy;
41. permanent exact materialization of every Version while its document is retained; and
42. future AI through the ordinary engine and provenance boundary.

## 12. Open questions

No product-domain question blocks the completed Steps 1 and 2. Step 3 compares Yjs v13 with Automerge and Gate B records the carrier selection under the Media-Type-labelled payload contract. Step 6 owns the separate durable `application/vnd.coedit.text` Range implementation and Gate C records the Range API and lineage-representation decisions. These are bounded implementation decisions, not permission for an adapter to change the accepted Range behavior.

Post-MVP or pre-network questions include:

- additional Media Types and their fine-grained operation contracts;
- whether any future workflow requires changing an InlineContent Media Type in place;
- content-local addressing for future non-text payloads;
- provenance visualization, retention, anonymization, and signed-claim policy;
- exact comment repair confidence and conversation target scopes;
- comment-specific multi-span repair and presentation policy;
- post-genesis Contributor registration;
- physical History compaction and collaborative-text garbage collection that preserve every Version and required Range lineage;
- durable named lenses;
- simultaneous independently editable outlines;
- the exact concurrent Block-tree algorithm or relay-coordination policy;
- exact same-region/structural conflict presentation during causal restore; and
- remote authorization, revocation, encryption, and signing protocols.

These questions must not be answered accidentally by MVP storage or editor shortcuts.

## 13. Directional acceptance criteria

A future design is compatible with this domain direction only if it preserves these properties:

1. An ordinary projection reads as a conventional document.
2. A displayed heading and outline label can use the same stored InlineContent.
3. One recursive Block type supports terminal and non-terminal structure.
4. Optional additional InlineContents do not make multiple versions mandatory.
5. Historical Checkpoint/live comparison does not require duplicate live state.
6. Tags remain generic while application conventions stay explicit and validated.
7. Historical viewing is non-mutating and restore is append-only compensation.
8. Durable mutations, including Checkpoints, are attributed Contributions.
9. Payload type is explicit while payload semantics remain outside generic Block structure.
10. Every payload can be replaced atomically and converges under replicated replacement.
11. `application/vnd.coedit.text` formatting is intrinsic, co-versioned with text, and has explicit boundary semantics.
12. AI can be added later through the ordinary mutation boundary.
13. Content Origin remains distinct from Contribution activity and survives copy and restore according to the payload contract.
14. Local portability, verification, and recovery remain product constraints.
15. UI layout, structural separators, and transient navigation do not leak into durable payload state by accident.
16. Private implementation choices do not become product concepts without an explicit decision.
17. Durable text Range references preserve creation and lineage order and holder independence without creating a document-wide registry or universal opaque payload locator.

## 14. Summary

The central structural object is one recursive Block. Each Block owns semantic tags, a direct-child presentation rule, optional InlineContents, and ordered child Blocks. Each InlineContent owns identity, tags, and one collaborative payload labelled with an Internet Media Type. `application/vnd.coedit.text` has fine-grained collaborative text, intrinsic formatting, protected Origin, and text Range capabilities. Every other supported Media Type initially uses the generic opaque capability set with exact bytes and payload-level Origin. Every payload supports atomic whole-payload replacement and deterministic convergence.

Block and InlineContent boundaries are structural and imply no textual separator. Application adapters decide how content and structure are presented.

History preserves every Version for the lifetime of its document. Semantic Checkpoints are ordinary attributed Contributions that create content-identical Versions; private materialization snapshots are only an optimization. The headless engine supplies document-relative durable multi-span and positional Range values for `application/vnd.coedit.text` without adding a Range entity or registry. Markdown is reversible interchange for the canonical imported text subset. `.coedit` is lossless recovery.

The MVP is a document-engine prototype. It qualifies and preserves minimum Origin semantics without requiring a provenance UI, comments product, AI provider, networking, Tauri, Rust, or SQLite.
