# Product and domain model direction

**Status:** Accepted clean-slate domain direction; directional, not a storage schema.

**Clean-slate baseline:** 2026-08-25.

This document defines the logical product ontology for Coedit. It defines what durable document concepts mean. It does not define the public engine API, implementation order, portable wire format, or replication protocol.

Use these documents for those concerns:

- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) defines what the document-engine prototype must prove.
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`](ATTRIBUTED_TEXT_AND_ANNOTATIONS.md) defines detailed formatting, origin, clipboard, and comment-target behavior.
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

The user works with one document made of meaningful structural and textual units. Internal records support that model. Internal records must not define the user experience.

### 2.2 Structure and text share one surface

Outline navigation and manuscript rendering are projections of the same Blocks. A displayed heading and its outline label normally use the same selected InlineContent.

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

### 2.7 Text metadata follows its semantics

Formatting is intrinsic collaborative rich-text metadata. Origin provenance is protected content-native metadata that travels with the text but never inherits from neighboring content. Comments are external records with repairable text targets. Ordinary selections are transient.

These concerns share atomic versioning where required, but they do not share one generic durable range abstraction.

### 2.8 Presentation is a projection

Lens selection, historical selection, pane layout, disclosure, focus, and navigation are presentation state unless the product explicitly makes one of them durable document material.

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
  content: CollaborativeContent

CollaborativeContent
  canonical text and hard breaks
  intrinsic formatting marks
  protected origin attribution

OriginRecord
  id: OriginId
  agentId: ContributorId
  kind: human | imported | automation | ai | unknown
  source and derivation references when applicable
```

`InlineContent` is the independently addressable content entity owned by a Block. It owns identity, tags, and one CollaborativeContent value.

`CollaborativeContent` has no independent product identity, tags, lifecycle, or sharing relationship. A storage implementation can index carrier state by `InlineContentId`, but that index does not create another domain entity.

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
7. Each InlineContent owns exactly one CollaborativeContent value.
8. Every live text item and hard break has exactly one valid Origin.
9. Formatting and Origin metadata belong to the same canonical content state as the text they describe.
10. Sibling order is the order of the parent's `children` vector.
11. InlineContent order is the order of the Block's `contents` vector.
12. The live Block tree contains no cycle.

The implementation specification defines initial size, depth, ID, and validation limits.

All durable user-created and domain entity identities use canonical lowercase UUID-v4 values. Trusted construction or application code allocates them; pure structural reducers never generate identities. The Step 2 domain rejects duplicate Block and InlineContent IDs in the live structure but keeps no lifetime-ID registry. Once History exists, it rejects reuse of an identity across retained lifetimes, and portable validation enforces the same rule when opening a document.

Document/genesis construction creates the one real root through a trusted factory such as `createEmptyDocument(...)`. Root construction is not a structural mutation, and `CreateBlock` always creates a non-root child under a real parent. Genesis includes the initial root but no Contribution; the first successful user mutation creates the first Contribution.

### 3.3 Content role is contextual

A Block does not persist a heading/body/list-item role. Incoming structural context determines how the selected InlineContent renders.

Initial rendering precedence is:

1. selected content on the root renders as the document title;
2. selected content on a child of `sections` renders as a section heading;
3. selected content on a child of `flow` renders as body flow;
4. selected content on a child of `bullets` or `numbers` renders as a list item; and
5. a contentless Block renders no text of its own.

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

A non-root Block with no InlineContents is a transparent grouping Block. It emits no heading, prose, or list-item text of its own. Its children render according to its `childrenPresentation`.

An authored but empty section or list item owns one InlineContent whose CollaborativeContent is empty. This preserves the distinction between an empty authored unit and a structural grouping container.

### 3.6 Introductory prose uses child flow

A section heading belongs to the section Block. Introductory body material below that heading is represented by child Blocks in `flow` presentation.

When one section contains both body material and subsections, transparent grouping Blocks can keep the two child relationships explicit. `MARKDOWN_INTERCHANGE.md` defines the canonical Markdown construction rule.

## 4. InlineContent, collaborative text, and formatting

### 4.1 InlineContent is the selectable content identity

`InlineContent` provides the identity required for editing, tags, content Origin, external comment targets, copies, and optional simultaneous representations.

Most Blocks can contain one InlineContent. Zero contents are valid for grouping Blocks. Additional InlineContents exist only when the product needs simultaneous material.

During Step 2, `InlineContentValue` is a typed, opaque, valid empty CollaborativeContent value. Structural operations can create, move, tag, reorder, and delete InlineContents without inspecting content internals. Step 3 expands the same type with text, hard breaks, formatting, Origin, and carrier-neutral behavior. No intermediate step creates partially valid attributed content.

### 4.2 No mandatory content role enum

InlineContent does not require `ContentForm`, `ContentStage`, `ContentRole`, `Primary`, `Summary`, `Working`, `Accepted`, or `Checkpoint` fields.

The application expresses product conventions with namespaced tags, lens rules, and History Contributions.

Examples:

```text
Block tag:         topic:provenance
InlineContent tag: view:main
InlineContent tag: view:summary
InlineContent tag: user:needs-citation
History kind:      checkpoint
```

### 4.3 Tags have independent owners

Block tags and InlineContent tags use the same normalization rules. Their ownership is independent.

A Block tag describes the semantic structural unit across its contents. An InlineContent tag describes one specific content value. Tags do not inherit or synchronize automatically between these owners.

### 4.4 CollaborativeContent is canonical authored-content authority

CollaborativeContent is the canonical state of authored text, hard breaks, intrinsic formatting, and protected origin attribution. HTML, plain text, ProseMirror JSON, rendered attribution runs, and Markdown are derived projections. They are not parallel authorities.

The carrier is private behind the document engine. Yjs stable v13 is the provisional implementation default, not a public domain type. The Elaboration carrier gate compares it with Automerge before carrier-dependent implementation and portable encoding are frozen.

### 4.5 Formatting uses native marks

Initial formatting values include bold, italic, underline, strikethrough, inline code, and link with a carrier-neutral target. Ordinary link metadata is opaque to the document model; typed internal Block links are interpreted only according to the focused attributed-text contract.

Each mark has explicit start/end expansion behavior. Initial defaults expand bold, italic, underline, and strikethrough at both boundaries; inline code and links expand at neither boundary. Detailed insertion, overlap, replacement, and clearing semantics are defined in `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md`.

Formatting marks commit atomically with the text they describe. There is no external formatting table or general-purpose formatting `TextAnchor`.

### 4.6 Origin provenance is protected content metadata

Every live text item and hard break has one Origin. Origin identifies the human, imported source, automation, AI/software agent, or unknown source that created the logical material. It is distinct from the Contributor who later copies, moves, formats, pastes, or restores that material.

Origin never inherits from adjacent text. Ordinary formatting operations cannot create, alter, or erase it. A query or renderer can coalesce adjacent equal origins into display spans, but those spans are not durable `RangeAnnotation<Provenance>` entities.

There is no separate restored-provenance category. Restore preserves historical Origin while its new Contribution identifies the restoring actor and target Version.

### 4.7 Copy and move preserve different identities

Moving a Block or reordering an InlineContent preserves the InlineContent identity and its complete CollaborativeContent state.

Copying an InlineContent entity creates a new InlineContent ID and new carrier item identities. The copy receives semantically equivalent text and formatting, preserves same-document Origins, and records a copy Contribution with source/derivation references.

Ordinary text copy/paste inserts content into the target InlineContent. It does not transfer the source InlineContent identity. A validated private Coedit clipboard representation preserves same-document Origins; ordinary external HTML or plain text receives imported or unknown Origin and never manufactures authorship for the paster.

## 5. History, Versions, Contributions, and Checkpoints

### 5.1 Terms

Use these terms consistently:

- **Contribution:** one immutable, attributed durable semantic activity, including its acting Contributor, base/frontier, kind, optional semantic group, exact effect reference, affected targets, and optional source/derivation references.
- **Version:** one materializable state of the document.
- **History:** retained Contributions and materializable Versions.
- **VersionToken:** the opaque public identifier for a Version.
- **Checkpoint:** one semantic Contribution that marks an exact point in History and produces a new content-identical Version.

The private MVP can implement a linear revision ledger and use complete snapshots in bounded tests or an identified early prototype. The browser target uses immutable effects plus periodic recovery checkpoints. These are implementation choices, not logical domain requirements.

Semantic editor groups and physical recovery checkpoints are not semantic Checkpoints.

### 5.2 Historical state is read-only

Historical materialization returns detached, read-only state. Entering or leaving historical viewing does not mutate the current Version.

Restore creates a new Contribution from the current Version to material that matches the selected historical target according to the engine restore contract.

### 5.3 Checkpoints are Version-producing Contributions

A Checkpoint is a first-class durable interaction. It is not a mutable tag or pointer attached outside History.

Creating a Checkpoint records who created it, its causal/base Version, and its place in History. The Checkpoint Contribution produces a new Version whose document material is identical to its base Version.

A Checkpoint does not mean final, published, approved, or immutable. A document can contain zero, one, or many Checkpoints.

### 5.4 History and simultaneous contents are different

Two states of one text at different times belong in History.

Two content values that must exist at the same time belong in separate InlineContents in one Version.

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

For each successfully imported Markdown document, export and re-import must preserve the normalized Coedit structure and semantic content defined in `MARKDOWN_INTERCHANGE.md`.

This requirement does not mean that every arbitrary Coedit tree is exactly representable in Markdown. Non-representable constructs must produce explicit export diagnostics.

## 8. Comments, conversations, and provenance

Minimum content Origin and its copy/restore invariants are part of the attributed-text foundation. Production provenance visualization, analytics, retention policy, authenticated claims, and signing remain later product phases.

Comments and durable conversations are typed records associated with explicit `CommentTarget` values. They are not disguised manuscript Blocks or InlineContents. A CommentTarget combines stable carrier cursors and affinity with exact quote, prefix/suffix context, approximate position, and explicit attached/ambiguous/orphaned state. It never silently reattaches to an uncertain match.

Comments are the primary durable use case for a target outside the authored text. Ordinary selections and remote cursors remain transient. `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` owns the detailed behavior.

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
+ optional overlays
+ transient layout/navigation state
= rendered workspace
```

The product can show several projections at the same time. No fixed pane layout is a domain requirement.

Only one InlineContent needs to own active rich-text editor machinery at one time in the initial browser implementation.

## 11. Recorded clean-slate decisions

The current ontology requires:

1. one recursive Block tree;
2. one real root Block;
3. no persisted `Idea`, `Heading`, `Body`, `Paragraph`, or `Leaf` entity types;
4. Block-owned tags, child presentation, ordered InlineContents, and ordered child Blocks;
5. InlineContent-owned identity, tags, and canonical CollaborativeContent;
6. no current `BlockContent` entity;
7. no independent product identity for CollaborativeContent;
8. contextual title/heading/prose/list-item rendering;
9. parent-owned `childrenPresentation`;
10. transparent contentless grouping Blocks;
11. one empty InlineContent for an authored empty structural unit;
12. optional, not mandatory, multiple InlineContents;
13. no mandatory InlineContent form/stage/role enum;
14. independent Block and InlineContent tag ownership;
15. application-owned tag namespaces for product conventions;
16. no logical live entity timestamps or tombstones initially;
17. recoverability of deleted live entities through historical Versions;
18. earlier working/checkpointed states in History rather than parallel live contents;
19. semantic Checkpoints as attributed content-identical Version-producing Contributions;
20. detached read-only historical viewing;
21. append-only compensating restore;
22. Contribution-level MVP activity attribution;
23. intrinsic native formatting marks with explicit boundary expansion;
24. protected, non-inheriting content Origin distinct from Contribution actor;
25. origin-preserving copy and restore with separate operation derivation;
26. external repairable targets for comments rather than formatting or provenance;
27. transient ordinary selections and presence;
28. one shared Block spine for initial lenses within a Version;
29. one logical collaborative document per Coedit document by default, hidden behind the engine; and
30. future AI through the ordinary engine and provenance boundary.

## 12. Open questions

No product-domain question blocks Step 2. Its trusted identity allocation, root construction, and opaque valid-empty InlineContent boundary are fixed by the implementation specification. Yjs v13 versus Automerge is an explicit Step 3 Elaboration implementation-qualification gate, not an unresolved domain decision.

Post-MVP or pre-network questions include:

- provenance visualization, retention, anonymization, and signed-claim policy;
- exact comment repair confidence and conversation target scopes;
- post-genesis Contributor registration;
- History compaction and collaborative-text garbage collection after measurement;
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
9. Formatting is intrinsic, co-versioned with text, and has explicit boundary semantics.
10. AI can be added later through the ordinary mutation boundary.
11. Content Origin remains distinct from Contribution activity and survives copy and restore.
12. Local portability, verification, and recovery remain product constraints.
13. UI layout and transient navigation do not leak into durable semantic state by accident.
14. Private implementation choices do not become product concepts without an explicit decision.

## 14. Summary

The central structural object is one recursive Block. Each Block owns semantic tags, a direct-child presentation rule, optional InlineContents, and ordered child Blocks. Each InlineContent owns identity, tags, and canonical CollaborativeContent containing text, native formatting, and protected Origin.

History preserves earlier states. Semantic Checkpoints are ordinary attributed Contributions that create content-identical Versions. Markdown is reversible interchange for the canonical imported subset. `.coedit` is lossless recovery.

The MVP is a document-engine prototype. It qualifies and preserves minimum Origin semantics without requiring a provenance UI, comments product, AI provider, networking, Tauri, Rust, or SQLite.
