# Product and domain model direction

**Status:** decision snapshot; directional, not a storage schema
**Decision snapshot:** 2026-08-24

**Purpose:** capture the current product ontology for Coedit before further workspace, History, provenance, or AI work hardens assumptions from the MVP.

This document defines the domain direction against which future designs should be evaluated. It is more stable than a UI mockup but deliberately less prescriptive than a persistence specification or migration plan. Existing code and format-version-1 documents remain authoritative for current behavior.

Detailed serialization, indexing, Yjs integration, migration, and performance choices should be recorded in focused design records once the corresponding work is scheduled. They should implement the concepts here rather than redefine them accidentally.

## 1. Product thesis

Coedit should feel like one coherent document, not a tree database with an editor attached.

An author should experience chapters, sections, paragraphs, list items, summaries, comments, discussions, historical revisions, and AI-assisted changes as related material in one inspectable artifact. Hierarchy provides the semantic structure, but manipulating hierarchy should not dominate ordinary writing.

Coedit's distinguishing promise is:

> A unified, local-first writing environment in which the semantic document, its history, its optional alternate representations, its discussions, and the provenance of its text remain inspectable without obscuring ordinary writing.

The author should usually see a clean document. History, discussions, attribution, and recovery should be available when useful without being continuously prominent.

## 2. Product principles

### 2.1 The document is the primary object

Users should think in terms of a document composed of meaningful sections and text, not rows or records. The internal hierarchy is a means of giving those parts stable identity and structure.

### 2.2 Structure and text share one surface

Outline navigation and detailed writing are projections of the same blocks. A heading shown in the final document and its outline label should normally be the same content stored once.

### 2.3 The block model should remain generic

The core tree should use one recursive `Block` type. It should not persist separate entity types for `Idea`, `Heading`, `Paragraph`, or `Leaf` merely because a block currently occupies one of those roles.

An "idea" remains a useful authoring heuristic: a terminal block should usually contain one coherent, independently useful piece of text. It is not a reliable schema invariant and should not become an `Idea` entity in code.

### 2.4 History is first-class

Every committed mutation contributes to append-only History. Any historical revision should be inspectable without mutation. Restoring historical state should create a new compensating revision rather than moving or deleting the historical record.

Earlier drafts normally survive as historical states. They do not require duplicate live content records merely to remain recoverable.

### 2.5 Optional representations may coexist

A block may have more than one live content value when the product genuinely needs simultaneous material, such as a manually maintained summary or an alternative wording. Multiple contents are supported but not mandatory; the ordinary case may contain exactly one.

### 2.6 AI is a contributor, not a privileged editor

An LLM may eventually create, edit, move, tag, or delete document material, but it must do so through the same attributable operation and contribution boundaries used by humans and automation.

### 2.7 Provenance survives composition

Attribution at whole-block or whole-content granularity is insufficient. A passage may combine text inserted by several contributors and subsequently edited or copied. That lineage should remain queryable even when hidden in the normal writing view.

### 2.8 Presentation is a projection

The current lens, selected tags, historical revision, visible overlays, pane layout, disclosure, focus, and navigation state are presentation choices unless explicitly saved as durable document material.

## 3. Core structural model

### 3.1 One recursive Block tree

A **Block** is a stable unit in the document's structural spine. A block may represent a document root, chapter, section, subsection, paragraph-sized thought, list item, or another meaningful unit.

Every block owns:

- stable identity;
- tags that describe the semantic unit across its contents;
- zero or more content values;
- an ordered list of child blocks; and
- a presentation rule for that direct child list.

The logical aggregate is:

```text
Document
  root: Block

Block
  id
  tags
  childrenPresentation
  contents: BlockContent[]
  children: Block[]
  createdAt / updatedAt / deletedAt
```

The tree is explicit in `Block.children`. Vector order is sibling order, and the containing block is the logical parent. A normalized store may persist equivalent `parentId` and `position` columns, but those are a serialization of the same tree rather than additional domain facts.

A real root block is useful because document-level displayed text can then use the same content-selection machinery as every other level. A storage implementation may use a virtual root if it preserves equivalent semantics.

### 3.2 Content role is contextual

Every block uses the same `BlockContent` representation. The low-level model does not store separate `heading` and `body` fields.

In a conventional section projection:

- content on a non-terminal block introduces or labels its subtree and is normally rendered as a heading;
- content on a terminal block is normally rendered as prose; and
- the outline derives its label from the selected content of the same block.

The heading shown in the document is therefore not duplicated in an outline-only metadata field or an artificial first child.

This is a rendering rule, not a permanent content type. Adding the first child can cause a block's content to become the introduction to a subtree; removing the last child can make it terminal again. Product operations must make that structural consequence understandable.

### 3.3 Child presentation is orthogonal

`childrenPresentation` belongs logically to the parent because it describes how that parent's direct children relate and render as a group.

An initial vocabulary may be:

```text
ChildrenPresentation
  Sections
  Flow
  Bullets
  Numbers
```

This property refines topology without creating separate block classes. For example, a child of a `Bullets` block renders as a list item even when that child has nested children of its own. That child's own `childrenPresentation` determines how the next level renders.

Heading/body/list-item behavior is therefore inferred from structural context: topology plus the incoming child presentation. It is not an intrinsic role on `InlineContent`.

The current direction assumes that `childrenPresentation` is shared by all content lenses within one materialized revision. If a future requirement needs the same children to be sections in one simultaneous representation and bullets in another, that becomes a structural-representation problem. It should not be encoded by attaching an ambiguous free-form tag to an edge.

### 3.4 Empty and introductory structures

Two behaviors remain to be designed explicitly:

1. how a user creates an empty structural section before it has a child; and
2. how introductory prose under a heading is represented.

The default direction for introductory prose is a first child block. This avoids an unordered mixture of a parent's own long-form prose and its children while still allowing the parent to own the displayed heading.

## 4. BlockContent and InlineContent

### 4.1 Minimal low-level definitions

The current logical definitions are:

```text
Block
  id: BlockId
  tags: TagSet
  childrenPresentation: ChildrenPresentation
  contents: BlockContent[]
  children: Block[]
  createdAt / updatedAt / deletedAt

BlockContent
  id: BlockContentId
  tags: TagSet
  value: InlineContent
  createdAt / updatedAt / deletedAt

InlineContent
  text: CollaborativeText
  formatting: RangeAnnotation<Formatting>[]
  provenance: RangeAnnotation<Provenance>[]
```

`BlockContent` gives an independently addressable content value identity, which is needed for editing, comments, provenance targets, copy derivation, and optional simultaneous representations. It does not prescribe why another content value exists.

Most blocks may have one `BlockContent`. Zero contents can represent a purely structural or not-yet-authored block. Additional contents are created only when required.

### 4.2 No mandatory form, stage, or role fields

The low-level model intentionally does not require `ContentForm`, `ContentStage`, or `ContentRole` enums.

- `Summary` is not built into the storage ontology.
- `Working` and `Accepted` are not duplicate live bodies by default.
- `Primary` and `Alternative` are application-level selection concepts.

The application may express these meanings using tag conventions, lens definitions, revision metadata, and validation rules. This keeps the primitive model generic and avoids requiring multiple versions merely because the schema anticipates them.

### 4.3 Tags have distinct owners

Tags may exist on both `Block` and `BlockContent`, but they are independent assertions:

- block tags describe the semantic unit across all its contents, such as `topic:provenance` or `chapter:introduction`;
- content tags describe one particular content value, such as `view:summary` or `user:needs-citation`; and
- `InlineContent` itself has no tags. It contains text and range annotations.

Both levels should use the same normalization rules and may share document-local autocomplete vocabulary. They do not automatically inherit, copy, or synchronize. A query must name whether it is matching block tags, content tags, or both.

Product-significant tags should normally use application-owned namespaces. For example, ownership could be explicit as follows:

```text
Block tag:        topic:provenance
BlockContent tag: view:main
BlockContent tag: view:summary
BlockContent tag: user:needs-citation
Revision tag:     workflow:accepted
```

The low-level store need only persist generic normalized tags. The application owns reserved namespaces, selection rules, validation, and user-facing vocabulary. Namespacing prevents a user topic named `summary` from accidentally becoming a rendering command.

### 4.4 History versus simultaneous contents

Two states of the same content at different times belong in History:

```text
revision 12: accepted wording
revision 13: first subsequent edit
revision 14: current working wording
```

They do not require three live `BlockContent` records.

Two contents that must coexist in one materialized revision do require separate identities:

```text
Block
  BlockContent tags: [view:main]
  BlockContent tags: [view:summary]
```

This boundary prevents History from being confused with optional parallel material.

## 5. Lenses, revisions, and overlays

### 5.1 Lens

A **Lens** is an application-level presentation query. It may select:

- a live or historical base revision;
- one `BlockContent` per visible block using tags and fallback rules;
- blocks by structural or tag predicates;
- associated materials such as comments, discussions, or provenance; and
- a layout for comparing projections.

Selecting a lens is normally non-mutating UI state. Named or saved lenses may later become optional document material, but the core data model does not require them.

### 5.2 Final and draft are normally historical projections

History can provide the distinction between final and draft without storing mandatory stages on every `BlockContent`:

```text
Final view = materialize an accepted revision read-only
Draft view = materialize the current live revision
Final + Draft = show both materializations side by side
```

If acceptance applies to the whole document, `workflow:accepted` belongs naturally on revision metadata. If blocks can be accepted independently, the application may record block/content acceptance as attributed tag operations. A final view assembled from independently accepted block revisions is a composite historical projection and requires explicit tree-coherence rules; it is not automatically equivalent to one revision that once existed.

### 5.3 Summary is optional content selected by a lens

A Summary view may select `BlockContent` values tagged `view:summary`. Blocks without such content may fall back, be omitted, or receive a generated summary according to an explicit lens policy.

Nothing in the low-level model requires a summary content value or a second version of the document.

For example, the same stable blocks may project as:

```text
+--------------------------------+--------------------------------------+--------------------------------------------------------+
| Final View                     | Draft View                           | Summary View                                           |
+--------------------------------+--------------------------------------+--------------------------------------------------------+
| Document                       | Top                                  | Document: Provenance, Implementation                   |
| +-- Why provenance matters     | +-- Provenance: Source, Consequences | +-- Provenance: why it matters, practical consequences |
| |   +-- Practical consequences | +-- Implementation                   | +-- [...summary of the paragraph]                      |
| +-- Implementation approach    |                                      | +-- Implementation                                     |
+--------------------------------+--------------------------------------+--------------------------------------------------------+
```

Final and Draft may be different historical trees. Summary may be a content-selection lens over a chosen base revision.

### 5.4 Structure within and across revisions

Within one materialized revision, all content-selection lenses initially share one `Block.children` spine. A content lens may select, omit, or fall back among contents, but it does not silently reparent a block.

Different historical revisions may have different complete trees. This naturally permits a current draft outline to differ from an earlier accepted outline.

If the product later requires several independently editable outlines to coexist in one revision, the model will need an explicit concept such as `Outline` or `BlockPlacement`. Tags on blocks or contents are not sufficient to represent different parents, sibling orders, or child-presentation rules safely.

### 5.5 Comments and discussions are overlays

A Proofreading view is normally a base content projection plus comment threads. A Discussion view is a base projection plus durable conversations. Provenance coloring is another overlay.

These materials may be tagged and queried, but they remain typed records because their behavior differs from manuscript text. They should not masquerade as ordinary child blocks or `BlockContent` merely to reuse a renderer.

## 6. Fine-grained formatting and provenance

### 6.1 Shared range-annotation abstraction

Formatting and provenance should reuse the same generic range mechanism:

```text
RangeAnnotation<T>
  range: StableTextRange
  value: T

StableTextRange
  start: TextAnchor
  end: TextAnchor

Formatting
  bold / italic / underline / strikethrough / link / durable font styling

Provenance
  contributionId
  contributorId
  origin
  derivedFrom[]
```

This permits the same range-resolution and decoration machinery to render formatting or optional attribution overlays such as one color per contributor.

The domain-level abstraction does not require both annotation kinds to have identical persistence or mutation implementations.

### 6.2 Formatting and provenance have different edit semantics

Formatting often inherits across insertion boundaries; provenance must not blindly do so.

- typing inside bold text normally remains bold;
- typing inside text attributed to author A must be attributed to the current contributor;
- copying formatted text normally preserves its formatting;
- copying attributed text should apply an explicit provenance policy, potentially preserving origin while recording a new copy contribution; and
- deleting text removes it from the current projection but not from historical attribution.

Shared representation and rendering do not imply shared inheritance rules.

### 6.3 Yjs relative-position behavior

Yjs relative positions are a plausible implementation of `TextAnchor` for sparse annotations.

A relative position refers to a specific Yjs shared type, a CRDT item identity, and an association direction. It does not need to be recomputed whenever text is inserted before it. It resolves to the appropriate current absolute index, and peers that integrate the same updates converge on the same position.

Important limitations are part of the design:

- an anchor cannot resolve on a peer until the referenced update is present;
- deletion may collapse a range to a surviving boundary;
- deletion or garbage collection of the containing shared type may make an anchor unresolvable;
- undo-following behavior must be configured consistently for shared anchors; and
- reconstructing content from plain text creates new CRDT identities and invalidates old anchors.

See the official [Yjs relative-position documentation](https://github.com/yjs/docs/blob/main/api/relative-positions.md) and implementation behavior before committing the format.

### 6.4 Copy, paste, split, and move

Relative positions do not automatically follow copied text between `BlockContent` values. Copy/paste creates new CRDT items in another shared type. Editor operations such as splitting a ProseMirror node may also recreate text with new identities.

An internal clipboard operation should therefore be capable of carrying:

```text
text
formatting annotations
source provenance
source BlockContent and range
```

The destination creates new text and new annotations according to an explicit derivation policy. Plain-text or external paste may begin an imported provenance chain.

Moving an entire block while retaining its `BlockContent` and Yjs state is different: internal text identities and anchors can remain intact because the content itself was not copied.

### 6.5 Dense provenance remains an implementation question

Relative endpoints are attractive for sparse comments, selections, and decorations. Provenance may cover nearly every character, so storing two external anchors for many short runs may be inefficient.

Candidate implementations include:

- Yjs/ProseMirror attributes or marks;
- attribution attached to inserted CRDT items or updates;
- contribution-linked spans; or
- a derived materialized run index backed by the contribution ledger.

The chosen representation must preserve the domain behavior above and support optional author-colored rendering. It requires a focused design and realistic performance experiments.

## 7. History as a first-class domain concept

### 7.1 History and provenance answer different questions

**History** answers how the document changed over time.

**Provenance** answers where a current or historical text range came from.

History may show that an AI rewrite was accepted at revision 92. Provenance may show that two current sentences still descend from it while another has been substantially rewritten by a human.

### 7.2 Required History behavior

The existing direction remains authoritative:

1. each accepted mutation appends an attributed contribution and advances revision;
2. historical materialization is detached and read-only;
3. entering and leaving historical viewing does not mutate live state;
4. restoration creates a new compensating contribution and revision;
5. earlier ledger entries and snapshots remain intact; and
6. semantic grouping may improve presentation without erasing physical contributions.

History must cover the complete document aggregate: block structure, block/content tags, child presentation, all `BlockContent` values, inline content and annotations, conversations, comments, and relevant contributor/session records.

### 7.3 Yjs state and annotation anchors travel together

A historical snapshot containing range anchors must also contain the Yjs state whose item identities those anchors reference. Rebuilding a historical `InlineContent` from rendered HTML or plain text is insufficient.

If History relies on separate complete Yjs states per product revision, an older state can retain the old identities even when the live document later garbage-collects content. If it instead relies on snapshots over one perpetually evolving Yjs document, deleted-content retention and garbage collection require special design. Yjs's own snapshot mechanism does not replace the product contribution ledger, tree operations, revision grouping, or restore semantics.

Snapshot-versus-delta retention and compaction remain persistence-design questions. They must not weaken historical inspectability or compensating restore.

### 7.4 Acceptance is revision-oriented by default

An accepted/final state is normally a marked historical revision rather than a second mandatory `BlockContent` with a persistent stage enum.

Editing after acceptance creates newer working revisions while the accepted revision remains inspectable. Accepting again records another attributed mutation or revision marker. Whether acceptance is document-wide or independently block-scoped remains a product decision.

## 8. Conversations, comments, and AI proposals

### 8.1 Durable conversations

An AI discussion is durable working material associated with semantic context, not an ephemeral external chat log.

At minimum:

```text
Conversation
  id
  target: BlockId | BlockContentId | TextRangeTarget
  tags
  messages[]
  createdAt / updatedAt

ConversationMessage
  id
  conversationId
  contributorId
  timestamp
  content
  model metadata, when applicable
  contextual revision and references
```

Future requirements may allow document-level or multi-block conversations. The target must remain explicit.

### 8.2 Comments

Comments are durable proofreading annotations attached to a block, content value, or text range. They may have threads, contributors, resolution state, and tags. A Comments lens controls visibility; hiding comments does not delete them.

### 8.3 AI proposals and operations

An LLM should eventually be able to propose typed operations such as:

- insert, delete, or replace a range in `BlockContent`;
- create or delete `BlockContent`;
- create, move, restore, or delete a `Block`;
- change `childrenPresentation`;
- retag a block, content value, conversation, comment, or revision where permitted;
- create an alternate or summary content value using application tag conventions; and
- create a comment or conversation message.

The author may preview and accept operations as one attributed group or selectively where supported. An AI provider must not mutate persistence directly.

```text
human action -----\
automation --------> typed document operations -> contribution ledger -> durable state
AI proposal -------/
```

Contributor identity, context, and review differ; the mutation system does not.

## 9. Unified projections and workspace

The rendered workspace is derived from:

```text
materialized document revision
+ lens content/tag selection
+ overlays
+ layout and local presentation state
= rendered workspace
```

Examples include:

- **Live writing:** current revision, default content, no overlays;
- **Final:** accepted historical revision, default content;
- **Final + Draft:** accepted historical and live revisions side by side;
- **Summary:** chosen base revision, `view:summary` content selection;
- **Proofreading:** chosen base projection plus comments;
- **Discussion:** chosen base projection plus conversations;
- **AI provenance:** chosen projection plus contributor/origin decorations; and
- **History:** any historical revision, read-only.

The product may use panes, lanes, drawers, overlays, or stacked layouts. No fixed three-column arrangement is required. Several projections may be visible simultaneously while only one editable `BlockContent` owns active rich-text editor machinery.

## 10. Contribution model

The existing append-only contribution architecture remains aligned with this direction.

A persisted mutation should continue to record, at minimum:

- stable contribution identity;
- contributor identity and kind;
- session/group context;
- timestamp;
- typed operation or operation set;
- affected blocks, contents, and/or ranges;
- base and resulting revision/state verification data; and
- human-readable context where useful.

Fine-grained provenance extends this ledger; it does not replace it. A contribution may contain several coordinated operations when atomicity and attribution remain explicit.

## 11. Relationship to the current implementation

### 11.1 Foundations to retain

The following remain strong foundations:

- portable local-first `.coedit` documents;
- stable hierarchical identities and deterministic order;
- normalized free-form tags and document-local suggestions;
- contributor kinds including human, automation, AI, and imported;
- writing sessions and semantic contribution groups;
- typed operations and append-only attributed contributions;
- full-state historical materialization and deterministic verification goals;
- read-only historical viewing;
- compensating restoration rather than destructive rewind;
- Tiptap/ProseMirror and Yjs as the current rich-text substrate;
- controlled editor ownership and draft-transition barriers;
- explicit application/gateway boundaries; and
- separation of persisted domain state from UI state.

### 11.2 MVP assumptions not to harden

The following are transitional:

- one node combines a title, tags, and exactly one body;
- title and body are permanently different content entities;
- a node's tags are sufficient for both semantic and content-specific classification;
- editor ownership is fundamentally node ownership rather than `BlockContent` ownership;
- an AI proposal is replacement HTML for one node;
- node-level attribution is sufficient provenance; and
- History alone answers current-content origin questions.

### 11.3 Continuous-canvas work remains useful

The continuous document direction remains useful. It should evolve from:

```text
one visible node -> title metadata + one body
```

to:

```text
one visible Block -> selected generic BlockContent + projected children and overlays
```

This is not a return to master/detail or separate outline/editor applications.

## 12. Migration direction

This document does not define a format migration. The conceptual evolution is:

```text
CURRENT

Document
  -> DocumentNode
       -> title
       -> tags
       -> bodyHtml / yjsState

TARGET

Document
  -> root Block
       -> block tags
       -> childrenPresentation
       -> BlockContent[]
            -> content tags
            -> InlineContent
                 -> formatting annotations
                 -> provenance annotations
       -> Block[]
       -> associated conversations/comments
  -> contribution ledger and revision history
```

Mapping current nodes is not purely a rename. A current node may contain both a title and a body while also having children. A future migration must decide whether to create wrapper/child blocks, split body material into terminal blocks, or preserve transitional compatibility fields. It should not silently discard either title or body semantics.

The first migration design should prioritize:

1. stable block/node IDs where semantically possible;
2. contribution and revision integrity;
3. deterministic reconstruction of tree order;
4. Yjs state and annotation-anchor consistency;
5. explicit classification of current node tags as block or content tags; and
6. reversible validation before old documents remain writable.

## 13. Recorded decisions

The following decisions constitute this snapshot:

1. The durable structural core is one recursive `Block` tree.
2. `Idea`, `Heading`, `Body`, and `Leaf` are not persisted entity types.
3. Every block may own generic content; heading/prose/list-item behavior is inferred from structure and child presentation.
4. The displayed section heading and outline label normally reuse one selected `BlockContent`.
5. `childrenPresentation` belongs to the parent and describes its direct children.
6. A block may have zero, one, or several `BlockContent` values; several are optional rather than mandatory.
7. `BlockContent` has identity, tags, and `InlineContent`, without required form/stage/role enums.
8. Block tags and content tags share normalization but have independent ownership and query scope.
9. Product-significant tag conventions should be application-owned and namespaced.
10. Earlier working/final states normally live in History, not duplicate live content values.
11. Acceptance is revision-oriented by default; restore remains a compensating mutation.
12. Summary is an optional application-selected content value, not a built-in content form.
13. Comments, conversations, and provenance are overlays over a selected base projection, while remaining durable typed material.
14. Formatting and provenance reuse a generic range-annotation abstraction but have different edit/inheritance semantics.
15. Yjs relative positions are plausible stable anchors within one retained shared type, not portable identities for copied text.
16. Yjs state and annotations that reference it must be snapshotted and restored together.
17. Different historical revisions may have different trees; simultaneous alternate outlines would require an explicit future structural model rather than tags.

## 14. Open product and technical questions

The following remain explicit:

### Block granularity

What editing conventions help users create useful terminal blocks without pretending that every human "idea" has an objectively detectable boundary?

### Empty structural blocks

How are empty chapters/sections created and represented before they receive children?

### Children presentation

Which initial values are required, how are nested lists represented, and is presentation ever allowed to vary between simultaneous projections?

### Default content selection

What lens rule selects content when a block has several values or none? How are application namespaces and fallback behavior validated?

### Acceptance scope

Is acceptance normally document-wide, block-specific, content-specific, or available at several explicit scopes?

### Summary lifecycle

Are summaries manually authored, generated and refreshable, frozen at a revision, or some combination? How is their derivation recorded?

### Conversation and comment targeting

Which target scopes are required initially, and what happens to range-targeted material after its text is deleted, copied, or restored?

### Fine-grained provenance

Which representation provides useful lineage through realistic Yjs/ProseMirror editing without unacceptable complexity or storage growth?

### Boundary association

For each annotation type, should inserted text at its start or end join the annotation? How do deletion, replacement, undo, and concurrent insertion affect that policy?

### Copy and derivation

Should copied text preserve origin, add a derivation edge, attribute the copy to the current contributor, or record several of those facts separately?

### History retention

What checkpoint, delta, snapshot, compaction, and Yjs garbage-collection policy keeps History complete while bounding realistic document growth?

### Named lenses

Which lenses remain transient UI state, and which may become saved document-local queries?

### Export semantics

How does export select a revision, contents, structural presentation, and overlays? The default likely needs a conventional accepted projection with explicit alternatives.

## 15. Near-term design work

Before revising the durable `.coedit` schema, the project should:

1. validate the minimal `Block` / `BlockContent` / `InlineContent` model with realistic documents;
2. define tree-rendering and `childrenPresentation` semantics;
3. define lens selection and namespaced-tag behavior independently of layout;
4. prototype live versus accepted historical projections side by side;
5. prototype an optional summary content value without requiring it globally;
6. specify conversation/comment targets and overlays;
7. design and benchmark fine-grained provenance, including copy/paste and dense attribution;
8. define Yjs anchor, snapshot, garbage-collection, and restore requirements;
9. design the format migration and operation vocabulary only after those behaviors are validated; and
10. migrate existing continuous-canvas interactions without expanding the one-title/one-body assumption.

## 16. Directional acceptance criteria

Future proposals align with this direction only if they preserve these properties:

1. An ordinary projection reads and feels like a conventional document.
2. The same block content can serve the rendered heading and outline label without duplication.
3. One generic recursive block type supports terminal and non-terminal structure.
4. Optional additional contents do not make multiple versions mandatory.
5. Historical final/draft comparison does not require duplicating live state.
6. Tags remain generic while application conventions are unambiguous and validated.
7. Comments and discussions remain durable, attributable, and linked to explicit context.
8. AI actions become ordinary reviewed and attributed operations.
9. Attribution can evolve to range-level provenance and optional visualization.
10. Copy, split, restore, and Yjs identity behavior are specified rather than assumed.
11. Historical viewing remains non-mutating and restoration remains append-only compensation.
12. Local-first portability, verification, and recovery remain product constraints.
13. UI layout, lens state, and navigation do not leak accidentally into durable semantic state.
14. Implementation convenience does not force `one node = one title + one body + one author` as a permanent ontology.

## 17. Summary

The central domain object is one recursive `Block`. Every block owns semantic tags, optional generic `BlockContent` values, an ordered child list, and a presentation rule for those children. The same selected content may render as a document heading, outline label, paragraph, or list item according to structural context.

`BlockContent` deliberately does not encode mandatory summary/draft/final/primary roles. Application-level lenses, namespaced tags, and revision metadata provide those meanings. History preserves earlier states; additional live contents exist only for material that must genuinely coexist.

Formatting and provenance operate over ranges in `InlineContent` through a shared abstraction, while retaining different editing semantics. History, provenance, comments, conversations, and lenses remain distinct but composable concepts.

This direction preserves the project's current strengths in local persistence, stable identity, attributed operations, historical viewing, and compensating restore while replacing the transitional title-plus-one-body node assumption with a smaller and more extensible core.
