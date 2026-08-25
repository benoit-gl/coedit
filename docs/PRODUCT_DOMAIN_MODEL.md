# Product and domain model direction

**Status:** Accepted clean-slate domain direction; directional, not a storage schema.

**Clean-slate baseline:** 2026-08-25.

This document defines the logical product ontology for Coedit. It defines what the durable document concepts mean. It does not define the public engine API, the implementation order, the portable wire format, or the future replication protocol.

For those concerns, use these documents:

- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) defines what the document-engine prototype must prove.
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) defines component authority and the public engine boundary.
- [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) defines concrete initial implementation contracts and limits.
- [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) defines implementation order and phase gates.
- [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) defines post-MVP replication constraints.

The earlier product-domain snapshot remains on `tauri-experimental-orphan`. It is historical evidence. The earlier Tauri application, SQLite persistence, `DocumentNode` format, and `BlockContent` vocabulary are not current clean-slate behavior.

## 1. Product thesis

Coedit should feel like one coherent document, not a tree database with an editor attached.

An author should experience chapters, sections, paragraphs, list items, optional alternate content, History, comments, discussions, and later collaborator contributions as related material in one inspectable document. The hierarchy gives stable structure. The hierarchy must not dominate ordinary writing.

The product direction is a local-first writing environment in which the semantic document, its History, its optional alternate representations, and its durable annotations remain inspectable without obscuring ordinary writing.

The current MVP is a **document-engine prototype**. It validates the document model, editing boundary, History, projections, import/export, and durability. AI is not an MVP requirement. A later AI integration will act as an additional contributor through the same engine boundary as other clients.

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

The MVP does not integrate an AI provider. The model preserves contributor identity and command attribution so that AI can be added later without a second mutation model.

### 2.7 Provenance can become finer than Contribution scope

MVP attribution is Contribution-level. A later provenance prototype can add range-level lineage. That future capability must remain compatible with current History and identity semantics.

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

CollaborativeText
  collaborative rich-text state
  formatting marks
```

`InlineContent` is the independently addressable content entity owned by a Block. It owns its identity and tags. It embeds exactly one `CollaborativeText` value.

`CollaborativeText` has no independent product identity, tags, lifecycle, or sharing relationship. A storage implementation can index text state by `InlineContentId`, but that index does not create a second domain entity.

There is no current `BlockContent` entity. The preserved experimental branch used `BlockContent` as a separate identity layer. On `main`, `InlineContent` now owns that identity and those tags directly.

Blocks and InlineContents do not initially contain `createdAt`, `updatedAt`, `deletedAt`, or tombstone fields. Contributions and historical Versions record lifecycle and recovery. Private storage or future replication can retain tombstones or causal data without adding them to the logical live entities.

### 3.2 Root and ownership invariants

The clean-slate model requires these invariants:

1. A document has exactly one real root Block.
2. The root cannot be moved or deleted.
3. Each non-root Block has exactly one parent.
4. Each Block ID is unique within the document.
5. Each InlineContent ID is unique within the document.
6. Each InlineContent belongs to exactly one Block.
7. Each InlineContent embeds exactly one CollaborativeText value.
8. Sibling order is the order of the parent's `children` vector.
9. InlineContent order is the order of the Block's `contents` vector.
10. The live Block tree contains no cycle.

The implementation specification defines the initial size, depth, ID, and validation limits.

### 3.3 Content role is contextual

A Block does not persist a heading/body/list-item role. The incoming structural context determines how the selected InlineContent renders.

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

The child presentation of a Block is dormant when the Block has no children. The value remains part of the Block and becomes active when children are added.

### 3.5 Contentless Blocks are transparent groups

A non-root Block with no InlineContents is a transparent grouping Block. It emits no heading, prose, or list-item text of its own. Its children render according to its `childrenPresentation`.

An authored but empty section or list item is different. It owns one InlineContent whose CollaborativeText is empty. This preserves the distinction between an empty authored unit and a structural grouping container.

This rule also resolves how an empty structural section is represented: a section child under a `sections` parent can own one empty InlineContent before it gains body children.

### 3.6 Introductory prose uses child flow

A section heading belongs to the section Block. Introductory body material below that heading is represented by child Blocks in `flow` presentation.

When one section contains both body material and subsections, transparent grouping Blocks can keep the two child relationships explicit. The Markdown import rules in `MVP_IMPLEMENTATION_SPEC.md` define the first deterministic construction rule.

## 4. InlineContent and CollaborativeText

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

Application-significant conventions use application-owned namespaces. A user tag that happens to contain a word such as `summary` must not become a rendering command unless it uses the defined application convention.

### 4.4 CollaborativeText is canonical rich text

The canonical rich-text value is CollaborativeText. The initial implementation uses Yjs/ProseMirror state inside this value. HTML and plain text are derived projections, not parallel authorities.

Formatting is initially represented by the canonical ProseMirror/Yjs marks. A later generic range read model can expose formatting ranges without creating a second persisted formatting authority.

A complete CollaborativeText value and any durable anchors that reference it must be co-versioned. A later provenance design must preserve this rule.

### 4.5 Copy and move preserve different identities

Moving a Block or reordering an InlineContent preserves the InlineContent identity and its CollaborativeText state.

Copying an InlineContent entity creates a new InlineContent ID. The copy receives semantically equivalent text with independent CRDT identities. Ordinary text copy/paste inserts content into the target InlineContent and does not transfer the source entity identity.

Future provenance can record derivation separately from entity identity.

## 5. History, Versions, Contributions, and Checkpoints

### 5.1 Terms

Use these terms consistently:

- **Contribution:** one immutable, attributed durable semantic mutation.
- **Version:** one materializable state of the document.
- **History:** the retained Contributions and materializable Versions.
- **VersionToken:** the opaque public identifier for a Version.
- **Checkpoint:** one semantic Contribution that marks an exact point in History and produces a new content-identical Version.

The private MVP can implement a linear revision ledger and complete snapshots. These are implementation choices, not logical domain requirements.

### 5.2 Historical state is read-only

Historical materialization returns detached, read-only state. Entering or leaving historical viewing does not mutate the current Version.

Restore creates a new Contribution from the current Version to material that matches the selected historical target according to the engine restore contract.

### 5.3 Checkpoints are Version-producing Contributions

A checkpoint is a first-class durable interaction. It is not a mutable tag or pointer attached outside History.

Creating a checkpoint records who created it, its causal/base Version, and its place in History. The checkpoint Contribution produces a new Version whose document material is identical to its base Version.

A checkpoint does not mean final, published, approved, or immutable. Editing after a checkpoint creates newer Versions. The checkpoint Version remains exactly materializable. A document can contain zero, one, or many checkpoints.

There is no singular "accepted" Version. A caller that needs a checkpoint selects an exact checkpoint Contribution or its resulting VersionToken from History.

In later collaboration, checkpoints must replicate as ordinary Contributions. A checkpoint therefore records the exact causal frontier observed by its author rather than claiming a globally latest state.

### 5.4 History and simultaneous contents are different

Two states of one text at different times belong in History.

Two content values that must exist at the same time belong in separate InlineContents in one Version.

Do not create extra live InlineContents only to preserve an old draft or checkpointed state.

## 6. Lenses and projections

A Lens is an application-level presentation query over a selected Version.

The initial model allows a lens to:

- choose the current Version or an exact historical Version, including a checkpoint Version;
- choose one InlineContent per Block with deterministic tag and fallback rules;
- select a subtree; and
- add later overlays without changing the underlying document.

Within one materialized Version, initial lenses preserve the complete Block tree. A lens does not silently reparent Blocks.

Different historical Versions can contain different complete trees.

If the product later needs several independently editable outlines in one Version, it will require an explicit structural concept. Tags are not sufficient to represent different parents or sibling order.

### 6.1 Initial content selection

Before named lenses are implemented, the default projection selects the first InlineContent in vector order. A Block with zero contents has no own rendered content.

When the lens work begins, the initial deterministic rules are:

- default/main selects the first `view:main` InlineContent, or the first InlineContent when no match exists;
- summary selects the first `view:summary` InlineContent, or falls back to default/main;
- several matching InlineContents select the first in vector order and produce a projection diagnostic; and
- zero contents produces no own rendered content.

Lens selection is transient UI state unless a later feature explicitly makes a named lens durable.

## 7. Comments, conversations, and provenance

These capabilities are not required for the document-engine MVP. Their domain direction remains important because the MVP must not block them.

### 7.1 Comments and conversations are overlays

Comments and durable conversations are typed records associated with explicit semantic targets. They are not disguised manuscript Blocks or InlineContents.

Possible targets include a Block, an InlineContent, or a range within an InlineContent. The exact target records and deletion behavior are deferred to the provenance/comments prototype.

### 7.2 Formatting and provenance can share a range abstraction

A future logical range abstraction can support both formatting views and provenance:

```text
RangeAnnotation<T>
  start: TextAnchor
  end: TextAnchor
  value: T
```

The common range shape does not imply common mutation rules.

Formatting often inherits at insertion boundaries. Provenance must attribute new text to the current contributor according to an explicit policy. Copy, deletion, replacement, undo, and concurrent insertion also require explicit provenance rules.

### 7.3 Yjs anchors are local to retained collaborative state

Yjs relative positions are a plausible implementation for sparse anchors. They refer to identities in a specific collaborative text state. They do not automatically survive copying into another InlineContent.

A historical state that contains such anchors must retain compatible CollaborativeText state. Reconstructing historical content from HTML or plain text is insufficient.

Dense provenance remains an implementation question for a later prototype.

## 8. Contributor model and future AI collaboration

Contributor identity is durable attribution identity. It is separate from a UI session, a future security principal, a replica/device, or a network connection.

The domain allows contributor kinds such as human, imported, automation, and AI. The MVP needs human and imported attribution. It can retain the broader closed vocabulary when the History model introduces contributors.

A later AI collaborator can:

- query an explicit Version;
- propose or submit typed document operations under explicit authorization;
- create or edit Blocks and InlineContents through ordinary commands;
- create checkpoints through the same attributed command boundary when authorized;
- create optional alternate content through normal InlineContent operations and tag conventions; and
- contribute comments or conversations after those domain types exist.

AI integration does not get direct access to private storage or a special tree mutation path.

## 9. Workspace composition

The rendered workspace is derived from:

```text
materialized Version
+ content-selection lens
+ optional overlays
+ transient layout/navigation state
= rendered workspace
```

The product can show several projections at the same time. For example, it can show a chosen checkpoint Version beside the live Version or show a summary projection beside main text.

No fixed pane layout is a domain requirement. Only one InlineContent needs to own active rich-text editor machinery at one time in the initial browser implementation.

## 10. Preserved experimental evidence

The `tauri-experimental-orphan` branch contains the earlier implementation and its documentation. It is read-only evidence and a source of implementation examples.

Useful examples include:

- stable ID generation;
- tag normalization and tests;
- tree move, order, cycle, and delete behavior;
- rich-text sanitization cases;
- Yjs encoding utilities;
- atomic commit and restore tests;
- historical projection patterns;
- draft-transition and editor-ownership behavior; and
- data-loss and recovery tests.

Those examples use older concepts in places. In particular, the preserved branch can contain `DocumentNode`, title/body fields, `BlockContent`, Tauri gateways, SQLite, direct snapshot APIs, and the old `.coedit` format. Those concepts are not current authority.

When preserved code conflicts with this document, [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md), [`MVP_CONTRACT.md`](MVP_CONTRACT.md), [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md), or the scaffolding plan, the current `main` documentation controls.

## 11. Recorded clean-slate decisions

The following decisions define the current ontology:

1. The durable structural core is one recursive Block tree.
2. The document has one real root Block.
3. `Idea`, `Heading`, `Body`, `Paragraph`, and `Leaf` are not persisted entity types.
4. Each Block owns tags, `childrenPresentation`, ordered InlineContents, and ordered child Blocks.
5. InlineContent owns its stable identity, tags, and one embedded CollaborativeText value.
6. There is no current BlockContent entity.
7. CollaborativeText has no independent product identity or sharing semantics.
8. Root-title, heading, prose, and list-item presentation is inferred from structural context.
9. `childrenPresentation` belongs to the parent and describes its direct children.
10. Contentless non-root Blocks are transparent grouping containers.
11. An authored empty structural unit owns one empty InlineContent.
12. A Block can contain zero, one, or several InlineContents; several are never mandatory.
13. InlineContent has no mandatory form, stage, or role enum.
14. Block and InlineContent tags share normalization but have independent ownership.
15. Application-owned namespaces express product tag conventions such as `view:summary`.
16. Blocks and InlineContents initially have no entity lifecycle timestamps or tombstone fields.
17. Deleted live entities remain recoverable through retained historical Versions.
18. Earlier working and checkpointed states live in History rather than parallel live contents.
19. A checkpoint is a first-class attributed Contribution that produces a new content-identical Version.
20. A document can have zero or many checkpoints; no checkpoint is inherently final or globally authoritative.
21. Historical viewing is detached and read-only.
22. Restore appends a compensating Contribution and does not rewind History.
23. MVP text attribution is Contribution-level.
24. Formatting and future provenance can share range-resolution concepts but require different edit rules.
25. Durable anchors and the CollaborativeText state they reference must be co-versioned.
26. Initial lenses preserve one shared Block spine within a materialized Version.
27. AI is a future contributor through the ordinary engine boundary, not an MVP subsystem.

## 12. Open post-MVP questions

The following questions are intentionally not required to implement the document-engine prototype:

- Which interaction conventions produce useful Block granularity during ordinary writing?
- Which summaries are manual, generated, refreshable, or frozen at a Version?
- Which comments and conversation target scopes are required first?
- What range-provenance representation gives useful lineage at acceptable cost?
- What insertion-boundary rules apply to each future annotation type?
- What derivation metadata should copy/paste retain?
- Which History retention, storage-snapshot, compaction, and Yjs garbage-collection policy is appropriate after measurement?
- Which lenses, if any, should become durable named document queries?
- Does the product need names, labels, or other metadata on checkpoint Contributions beyond ordinary Contribution context?
- Does the product ever require simultaneous independently editable outlines?
- Which collaboration policy should govern structural edits when networking is introduced?

These questions must not be answered accidentally by an MVP storage shortcut.

## 13. Directional acceptance criteria

A future design is compatible with this domain direction only if it preserves these properties:

1. An ordinary projection reads as a conventional document.
2. A displayed heading and outline label can use the same stored InlineContent.
3. One recursive Block type supports terminal and non-terminal structure.
4. Optional additional InlineContents do not make multiple versions mandatory.
5. Historical checkpoint/live comparison does not require duplicate live state.
6. Tags remain generic while application conventions stay explicit and validated.
7. Historical viewing is non-mutating and restore is append-only compensation.
8. Durable mutations, including checkpoints, are attributed Contributions.
9. AI can be added later through the ordinary mutation boundary.
10. Provenance can evolve to range-level lineage without replacing History.
11. Copy, restore, and collaborative-text identity rules are explicit where they matter.
12. Local portability, verification, and recovery remain product constraints.
13. UI layout and transient navigation do not leak into durable semantic state by accident.
14. Private implementation choices do not become public domain concepts without an explicit decision.

## 14. Summary

The central structural object is one recursive Block. Each Block owns semantic tags, a direct-child presentation rule, optional InlineContents, and ordered child Blocks. Each InlineContent owns its identity, tags, and embedded CollaborativeText.

The model does not persist heading/body entity types or a separate BlockContent identity layer. Structural context determines document-title, heading, prose, and list-item presentation. History preserves earlier states. Checkpoints are ordinary semantic Contributions that create content-identical Versions. Additional live InlineContents exist only for material that must coexist in the same Version.

The MVP is a document-engine prototype. It must validate these semantics without depending on AI, networking, Tauri, Rust, or SQLite. Later collaborators, including AI, must use the same attributable engine boundary.
