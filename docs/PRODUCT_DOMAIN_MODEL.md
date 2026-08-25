# Product and domain model direction

**Status:** Accepted clean-slate domain direction; directional, not a storage schema.

**Clean-slate baseline:** 2026-08-25.

This document defines the logical product ontology for Coedit. It defines what durable document concepts mean. It does not define the public engine API, implementation order, portable wire format, or replication protocol.

Use these documents for those concerns:

- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) defines what the document-engine prototype must prove.
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) defines private MVP implementation contracts that are not owned by focused specifications.
- [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md) defines Markdown interchange semantics.
- [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md) defines the `.coedit` recovery format.
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

### 2.7 Formatting and provenance survive composition

Formatting and later provenance can target stable text ranges that survive ordinary editing and historical materialization. The logical range model is external to the collaborative text bytes.

Formatting and provenance can share range-resolution concepts, but they have different edit, inheritance, and copy semantics.

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
  text: CollaborativeText
  formatting: RangeAnnotation<Formatting>[]

CollaborativeText
  canonical collaborative text state

RangeAnnotation<T>
  start: TextAnchor
  end: TextAnchor
  value: T
```

`InlineContent` is the independently addressable content entity owned by a Block. It owns identity, tags, one CollaborativeText value, and the external formatting ranges for that content.

`CollaborativeText` has no independent product identity, tags, lifecycle, or sharing relationship. A storage implementation can index text state by `InlineContentId`, but that index does not create another domain entity.

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
7. Each InlineContent owns exactly one CollaborativeText value.
8. Each formatting range belongs to exactly one InlineContent.
9. Sibling order is the order of the parent's `children` vector.
10. InlineContent order is the order of the Block's `contents` vector.
11. The live Block tree contains no cycle.

The implementation specification defines initial size, depth, ID, and validation limits.

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

An authored but empty section or list item owns one InlineContent whose CollaborativeText is empty. This preserves the distinction between an empty authored unit and a structural grouping container.

### 3.6 Introductory prose uses child flow

A section heading belongs to the section Block. Introductory body material below that heading is represented by child Blocks in `flow` presentation.

When one section contains both body material and subsections, transparent grouping Blocks can keep the two child relationships explicit. `MARKDOWN_INTERCHANGE.md` defines the canonical Markdown construction rule.

## 4. InlineContent, collaborative text, and formatting

### 4.1 InlineContent is the selectable content identity

`InlineContent` provides the identity required for editing, tags, comments, future provenance targets, copies, and optional simultaneous representations.

Most Blocks can contain one InlineContent. Zero contents are valid for grouping Blocks. Additional InlineContents exist only when the product needs simultaneous material.

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

### 4.4 CollaborativeText is canonical text authority

CollaborativeText is the canonical authored-text state. The initial implementation uses Yjs to support collaborative editing semantics.

HTML and plain text are derived projections. They are not parallel authorities.

CollaborativeText does not itself make formatting marks the domain authority. The editor can use native mark mechanisms as a transient adapter representation, but durable formatting meaning belongs to the external range annotations on InlineContent.

### 4.5 Formatting is an external range model

Formatting uses:

```text
RangeAnnotation<Formatting>
  start: TextAnchor
  end: TextAnchor
  value: Formatting
```

Initial formatting values include:

- bold;
- italic;
- underline;
- strikethrough;
- inline code; and
- link with a safe destination.

`TextAnchor` is an opaque logical construct. Its concrete representation is intentionally unresolved at this time. Yjs relative positions remain one research candidate, not an accepted requirement.

Before implementation begins, the Step 0 decision must define how TextAnchor behaves across insertion, deletion, replacement, split, merge, undo, redo, copy, and restore, and how text plus formatting updates commit atomically.

Do not encode the unresolved choice indirectly by defining anchor identity as a character offset, ProseMirror position, Yjs item, or another implementation-specific type in current domain APIs.

### 4.6 Formatting and provenance have different semantics

Formatting often inherits across insertion boundaries. Provenance must attribute new text to the current contributor according to an explicit future policy.

Copying formatted text normally preserves formatting. Future provenance copy behavior must separately define origin and derivation semantics.

Shared range representation does not imply shared inheritance or copy rules.

### 4.7 Copy and move preserve different identities

Moving a Block or reordering an InlineContent preserves the InlineContent identity and its complete text/formatting state.

Copying an InlineContent entity creates a new InlineContent ID. The copy receives semantically equivalent text and formatting according to the accepted Step 3 copy semantics. Its collaborative text identities are independent where the chosen collaborative representation requires that distinction.

Ordinary text copy/paste inserts content into the target InlineContent. It does not transfer the source InlineContent identity.

## 5. History, Versions, Contributions, and Checkpoints

### 5.1 Terms

Use these terms consistently:

- **Contribution:** one immutable, attributed durable semantic mutation.
- **Version:** one materializable state of the document.
- **History:** retained Contributions and materializable Versions.
- **VersionToken:** the opaque public identifier for a Version.
- **Checkpoint:** one semantic Contribution that marks an exact point in History and produces a new content-identical Version.

The private MVP can implement a linear revision ledger and complete snapshots. These are implementation choices, not logical domain requirements.

Interactive editor physical edit captures are not semantic Checkpoints.

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

These capabilities are post-MVP experiments. Their domain direction remains important because the MVP must not block them.

Comments and durable conversations are typed records associated with explicit semantic targets. They are not disguised manuscript Blocks or InlineContents.

Future provenance uses range-level lineage and can reuse the `RangeAnnotation<T>` shape. Its mutation, copy, storage, and performance policies remain deferred.

Do not add production provenance, comments, or durable discussions as hidden requirements of the strict document-engine MVP.

## 9. Contributor model and future AI collaboration

Contributor identity is durable attribution identity. It is separate from a UI session, future security principal, replica/device, or network connection.

The domain allows contributor kinds such as human, imported, automation, and AI. The strict MVP needs human and imported attribution.

For MVP bootstrap, the UX can request a free-form human display name before document-session creation. This does not imply an account or persistent user-profile model.

A later AI collaborator can query explicit Versions and submit ordinary attributed commands. AI does not get direct private-storage access or a special tree mutation path.

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
5. InlineContent-owned identity, tags, collaborative text, and formatting ranges;
6. no current `BlockContent` entity;
7. no independent product identity for CollaborativeText;
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
22. Contribution-level MVP authorship attribution;
23. external range-based Formatting with opaque TextAnchor endpoints;
24. co-versioning of collaborative text and any durable ranges that target it;
25. one shared Block spine for initial lenses within a Version; and
26. future AI through the ordinary engine boundary.

## 12. Open questions

The concrete `TextAnchor` representation is the only currently identified implementation-blocking Step 0 question.

Post-MVP questions include:

- fine-grained provenance representation and mutation policy;
- comments and conversation target scopes;
- post-genesis Contributor registration;
- History compaction and collaborative-text garbage collection after measurement;
- durable named lenses;
- simultaneous independently editable outlines; and
- networked structural collaboration policy.

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
9. Formatting remains externally range-addressable and is co-versioned with the collaborative text it targets.
10. AI can be added later through the ordinary mutation boundary.
11. Provenance can evolve to range-level lineage without replacing History.
12. Local portability, verification, and recovery remain product constraints.
13. UI layout and transient navigation do not leak into durable semantic state by accident.
14. Private implementation choices do not become product concepts without an explicit decision.

## 14. Summary

The central structural object is one recursive Block. Each Block owns semantic tags, a direct-child presentation rule, optional InlineContents, and ordered child Blocks. Each InlineContent owns identity, tags, canonical collaborative text, and external formatting ranges.

History preserves earlier states. Semantic Checkpoints are ordinary attributed Contributions that create content-identical Versions. Markdown is reversible interchange for the canonical imported subset. `.coedit` is lossless recovery.

The MVP is a document-engine prototype. It must validate these semantics without depending on AI, provenance, comments, networking, Tauri, Rust, or SQLite.
