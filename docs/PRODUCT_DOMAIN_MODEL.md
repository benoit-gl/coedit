# Product and domain model direction

**Status:** product-direction draft

**Purpose:** define the intended end-state product model for Coedit before further workspace, navigation, History, or AI integration work hardens assumptions from the current MVP.

This document describes the product Coedit is intended to become and the domain concepts that should guide future design. It is deliberately more stable than a UI mockup and less prescriptive than a storage migration specification. Existing code and format-version-1 documents remain authoritative for current behavior; this document defines the direction against which future changes should be evaluated.

## 1. Product thesis

Coedit should feel like one coherent document, not a tree database with an editor attached.

An author should experience titles, subtitles, paragraphs, sections, notes, drafts, alternatives, and AI-assisted rewrites as related views of the same work. Hierarchy provides semantic structure, but hierarchy is not itself the primary user experience. The primary experience is writing and revising a document while being able to expose additional working material when useful.

The product should make it possible to move naturally through this progression:

```text
idea -> structure -> draft -> discussion -> rewrite -> final text
```

without requiring those stages to overwrite one another or disappear into an external chat log.

Coedit's distinguishing promise is therefore not merely hierarchical writing and not merely AI-assisted editing. It is:

> A unified, local-first writing environment in which the semantic document, its working variants, its AI discussions, and the provenance of every accepted change remain part of one inspectable artifact.

The author should usually see a clean document. The machinery that preserves drafts, discussions, revisions, attribution, and recoverability should remain available without dominating ordinary writing.

## 2. Product principles

### 2.1 The document is the primary object

Users should think in terms of a document composed of headings, sections, paragraphs, and other meaningful units. Internal records may be hierarchical, but the interface should not make ordinary authoring feel like manipulating database rows.

### 2.2 Structure and prose are one surface

There should not be a conceptual split between an outline mode and a writing mode. The same semantic structure should support both high-level organization and detailed prose editing.

### 2.3 Working material is first-class, not disposable

Initial drafts, alternate rewrites, notes, source material, and conversations with an LLM are valuable parts of the creative process. They should not need to be copied to external applications merely to preserve them.

### 2.4 Multiple representations may coexist

An author may need to see the final text, an earlier draft, and an AI conversation simultaneously. The system should treat this as a normal projection of one document rather than as three unrelated modes.

### 2.5 AI is a contributor, not a privileged editor

An LLM may eventually create, edit, move, tag, or delete document content, but it should do so through the same attributable contribution model used by humans and automation. AI actions must not bypass provenance, revision history, or document invariants.

### 2.6 Provenance must survive composition

Attribution at the granularity of a whole node is insufficient for the intended product. A final paragraph may contain text written by a human, inserted by an LLM, subsequently rewritten by the human, and derived from an earlier draft. That lineage should remain queryable even if it is normally hidden from view.

### 2.7 Presentation is a projection

Which content is visible, which lanes are shown, which tags are selected, which branches are collapsed, and which auxiliary panes are open are presentation choices. They should not be confused with the durable semantic document itself.

## 3. The key domain distinction: semantic blocks and content containers

The current MVP `DocumentNode` combines three concerns:

1. a location in the hierarchy;
2. metadata such as title and tags; and
3. one rich-text body.

That is a useful implementation for the current product, but it should not be treated as the final ontology.

The target model separates the **semantic place in the document** from the **content associated with that place**.

### 3.1 Semantic Block

A **Semantic Block** is a stable unit in the document's structural spine.

A block may correspond to a chapter, section, subsection, paragraph-sized idea, argument, scene, note grouping, or another meaningful unit. The model should not prematurely require one block to equal one paragraph.

A block owns structural identity and relationships, not a single canonical body.

Conceptually, a block has:

```text
SemanticBlock
  id
  parentId
  position
  title / heading metadata
  structural metadata
  tags
  contentContainers[]
  conversations[]
  createdAt / updatedAt / deletedAt
```

Hierarchy remains useful because it gives stable identity to concepts while allowing them to be reordered, nested, moved, hidden, and revisited.

### 3.2 Content Container

A **Content Container** is a body of content associated with one semantic block.

A block may have zero, one, or many containers. Containers allow related representations to coexist instead of overwriting one another.

Examples include:

- the initial author draft;
- a later human rewrite;
- an LLM-proposed rewrite;
- the currently accepted/final prose;
- notes or research material;
- an alternative wording;
- a summary or outline representation.

Conceptually:

```text
ContentContainer
  id
  blockId
  role
  stage
  tags
  content
  provenance
  createdAt / updatedAt / deletedAt
```

The exact serialization of rich content remains an implementation question. Tiptap/ProseMirror and Yjs remain plausible foundations.

### 3.3 Role, stage, and free-form tags

The product should preserve the flexibility of tags while avoiding the mistake of making essential semantics depend entirely on unstructured strings.

A content container should therefore support both typed semantics and free-form tags.

For example:

```text
role: prose
stage: draft
tags: [opening, needs-citation]
```

or:

```text
role: prose
stage: final
tags: [approved]
```

or:

```text
role: notes
stage: working
tags: [research, source-check]
```

`role` and `stage` should describe product-significant semantics. Free-form tags should remain user-extensible vocabulary for filtering, organization, workflows, and later automation.

The initial controlled vocabulary does not need to be large. The important requirement is that concepts such as "final" must not depend solely on a user spelling a tag consistently.

## 4. Lenses: selecting what the document shows

The semantic hierarchy should remain stable while the user chooses which associated content to project.

A **Lens** is a presentation query over the document. It determines which containers or related materials are visible and how they are arranged.

Examples:

### Final lens

Show the accepted/final prose for each visible semantic block.

The result should read like an ordinary finished document.

### Draft lens

Show the current draft representation for each block using the same document structure.

### Final + draft comparison lens

Show corresponding final and draft containers side-by-side.

```text
+----------------------+----------------------+
| Final                | Draft                |
|                      |                      |
| accepted paragraph   | earlier paragraph    |
+----------------------+----------------------+
```

### Writing + discussion lens

Show the principal prose container alongside the conversation associated with the currently active block.

### Custom tag lens

Examples:

- show containers tagged `final`;
- hide containers tagged `draft`;
- show `needs-citation` material;
- show AI-originated alternatives;
- show research notes while keeping accepted prose visible.

A lens is normally presentation state. Selecting a lens should not itself create document mutations.

## 5. Multi-pane workspace

The end-state workspace should be able to display multiple content containers at once while still feeling like one document.

One useful composition is:

```text
+----------------------+----------------------+----------------------+
| Main document        | Draft / alternative  | Discussion           |
|                      |                      |                      |
| Heading              | Heading/context      | Human: ...           |
| Final prose          | Draft prose          | LLM: ...             |
|                      |                      | Human: ...           |
| Next section ...     |                      | Proposal: ...        |
+----------------------+----------------------+----------------------+
```

This is not intended to mandate a fixed three-column layout. Screen width, task, and user preference may produce overlays, drawers, stacked views, or two-column layouts.

The durable requirement is that several representations of the same semantic block may be visible simultaneously and remain explicitly related.

The current one-active-editor architecture may still be valuable: many containers can be rendered simultaneously while only the focused editable container mounts active rich-text editor machinery. If retained, editor ownership should migrate conceptually from "node owns the editor" to "content container owns the editor."

## 6. Conversation as durable document material

LLM discussion should not be treated as an ephemeral sidebar whose contents disappear after a response.

A **Conversation** is durable working material associated with a semantic context.

At minimum, a conversation should be attachable to a semantic block. Future requirements may justify document-level or multi-block conversations, but block-local discussion is the primary workflow.

Conceptually:

```text
Conversation
  id
  blockId
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
  contextual document revision / references
```

Conversation messages are not ordinary manuscript paragraphs and should not masquerade as children in the visible document hierarchy merely because both are persisted as records.

They belong to the `.coedit` artifact, can participate in History and provenance, and may be exposed through a chat-like UI, but they have a distinct semantic role.

A conversation should preserve enough context to answer questions such as:

- what document state was being discussed;
- which block or content container was referenced;
- which model produced a response;
- which proposal resulted from the discussion;
- whether that proposal was accepted, modified, rejected, or superseded.

## 7. AI proposals and document operations

The current AI seam models a proposal primarily as replacement HTML for one node. That is a useful placeholder but too narrow for the target product.

An LLM should eventually be able to propose a set of typed document operations such as:

- replace a text range in a content container;
- insert text at a position;
- create a new content container;
- create a semantic block;
- append a child block;
- retag a block or container;
- move a block;
- create an alternate rewrite without replacing the accepted text;
- promote a draft or proposal into the accepted/final role.

The author may preview and accept these operations as a unit or selectively where the product permits.

Accepted AI actions must become ordinary attributed contributions. The AI provider should never directly mutate persistence or bypass the application command boundary.

This keeps the central architecture simple:

```text
human action -----\
automation --------> typed document operations -> contribution ledger -> durable state
AI proposal -------/
```

The difference is contributor identity, context, review workflow, and presentation—not a separate mutation system.

## 8. Fine-grained provenance

### 8.1 Why node-level attribution is insufficient

A whole-container contribution can answer:

> Which contributor last updated this body?

It cannot reliably answer:

> Who originated this sentence?

or:

> Which words in the final paragraph came from the LLM rewrite that followed this conversation?

The target product requires provenance finer than the semantic block and finer than the whole content container.

### 8.2 Required provenance capabilities

The durable model should eventually support queries equivalent to:

- identify the contributor responsible for a selected text range;
- identify the contribution that introduced or replaced that range;
- distinguish human, AI, automation, and imported origins;
- trace accepted text back to an AI proposal or conversation where applicable;
- show human edits made after an AI-generated passage;
- show AI-authored or AI-modified portions of the current document;
- retain provenance across ordinary subsequent edits as far as technically meaningful.

The normal writing view should not need to show this information continuously. Provenance is primarily a durable capability with optional visualization.

### 8.3 Provenance representation remains an open design problem

Yjs already provides a structured editing substrate and incremental updates, but Yjs history alone should not be assumed to satisfy product-level provenance requirements.

A future design must determine how durable attribution is attached to text operations or ranges. Candidate approaches may include provenance annotations, operation-linked spans, retained item metadata, or a derived lineage model.

Whatever representation is selected must define behavior under insertions, deletions, replacement, copy/paste, splitting/merging blocks, accepted AI proposals, and later human revision.

This decision is significant enough to deserve a dedicated design record before AI editing becomes an implementation commitment.

## 9. Contribution model

The existing contribution architecture remains aligned with the target product and should be preserved conceptually.

A persisted mutation should continue to record, at minimum:

- stable contribution identity;
- contributor identity and kind;
- session/group context;
- timestamp;
- typed operation or operation set;
- affected semantic blocks and/or content containers;
- base revision;
- resulting revision/state verification data;
- human-readable context/message where useful.

The model should expand from `affectedNodeIds` toward targets that can identify the appropriate durable entities and fine-grained text effects.

A contribution may eventually contain several coordinated operations, particularly for an AI rewrite or structural transformation, provided atomicity and provenance remain explicit.

## 10. History and provenance are related but different

**History** answers how the document changed over time.

**Provenance** answers where current content came from.

They overlap but should not be conflated.

For example, History may show that an AI rewrite was accepted at revision 92. Provenance may show that sentences one and two still descend from that rewrite while sentence three has subsequently been substantially rewritten by the author.

The current append-only contribution ledger, semantic grouping, historical viewing, and compensating restore are strong foundations for History. Fine-grained provenance adds a separate lineage dimension rather than replacing that machinery.

## 11. Unified document projection

The principal document view should be derived from three things:

```text
semantic structure
+ selected lens / visibility rules
+ current or historical revision
= rendered workspace
```

This implies several important invariants.

1. The hierarchy does not need to change when switching from draft to final visibility.
2. Showing or hiding a content role is normally a projection change, not a document edit.
3. A historical view should apply the same projection concepts to historical semantic/content state.
4. Conversation visibility is independent from whether conversation records are durable.
5. Navigator selection, pane layout, disclosure, current lens, and focus are presentation state unless explicitly promoted into a saved workspace feature in the future.

## 12. Example end-to-end workflow

An author begins with a section called **Why provenance matters**.

The semantic block exists once.

The author writes an initial prose container:

```text
role: prose
stage: draft
tags: [initial]
```

They open a discussion attached to the block and ask an LLM to challenge the argument. The human and LLM messages are preserved in the conversation.

The author then asks for a rewrite. The LLM proposes either a new alternative container or a set of text operations against the draft, depending on the chosen workflow.

The proposal records the AI contributor/model and links back to the conversation.

The author edits that proposal manually. Those edits are attributed to the human without erasing the provenance of unchanged AI-originated passages.

When satisfied, the author promotes the resulting container to the accepted/final stage.

Later they may choose:

- **Final** lens to read the document cleanly;
- **Final + Draft** to compare stages;
- **Discussion** to revisit the reasoning that led to the rewrite;
- **AI provenance** to inspect which current passages retain AI lineage;
- **History** to view the document as it existed before the rewrite.

All of these views refer to one `.coedit` document.

## 13. Relationship to the current implementation

### 13.1 Strong foundations to retain

The following current concepts remain appropriate foundations:

- portable local-first `.coedit` documents;
- stable hierarchical identities using parent/order relationships;
- free-form tags;
- contributor kinds including human, automation, AI, and imported;
- writing sessions;
- typed document operations;
- append-only attributed contributions;
- snapshots and deterministic state verification goals;
- non-mutating historical viewing;
- compensating restoration rather than destructive rewind;
- Tiptap/ProseMirror and Yjs as the current rich-text substrate;
- explicit application/gateway boundaries;
- offline-by-default provider registration;
- separation of persisted domain state from UI presentation state.

### 13.2 Current assumptions that should not be hardened further

The following MVP assumptions should be treated as transitional:

- one semantic node has exactly one authored rich-text body;
- the node's tag set is sufficient to describe all roles/stages associated with that semantic location;
- `NodeBlock` is the final product-level unit of the workspace;
- editor ownership is fundamentally node ownership rather than content-container ownership;
- an AI proposal is fundamentally replacement HTML for one node;
- node-level contribution attribution is sufficient provenance;
- History and revision machinery alone can answer content-origin questions.

### 13.3 Current continuous-canvas work is not discarded

The continuous document direction remains useful. The pivot is not a return to master/detail.

Instead, the continuous canvas should evolve from:

```text
one visible semantic node -> one body
```

into:

```text
one visible semantic block -> one or more projected content containers
```

The document should become more unified, not less.

## 14. Migration direction

This document does not define a format migration, but the expected conceptual evolution is:

```text
CURRENT

Document
  -> DocumentNode
       -> title
       -> tags
       -> bodyHtml / yjsState

TARGET

Document
  -> SemanticBlock
       -> structural metadata
       -> block tags
       -> ContentContainer[]
            -> role / stage / tags
            -> rich content
            -> provenance
       -> Conversation[]
            -> ConversationMessage[]
            -> proposal references
```

A practical implementation may introduce these concepts incrementally rather than renaming every existing type at once.

The first migration design should prioritize preserving stable block/node IDs and contribution/history integrity while extracting body content into independently identified containers.

## 15. Open product questions

The following questions should remain explicit rather than being answered accidentally by implementation convenience.

### Block granularity

Should a typical semantic block correspond to a paragraph, subsection, argument, scene, or user-chosen unit? The model should tolerate different granularity until observed workflows justify stronger conventions.

### Accepted/final semantics

Can a block have several accepted containers for different outputs or audiences, or is there normally one accepted prose container per lens/profile?

### Role and stage vocabulary

Which values must be typed product concepts, and which should remain free-form tags?

### Conversation scope

Are conversations always attached to one block, or can they span several blocks or the whole document while retaining explicit references?

### Proposal workflow

Should LLM rewrites default to new alternative containers, inline tracked operations against the active container, or offer both models?

### Fine-grained provenance

What representation gives useful lineage through realistic rich-text editing without creating unacceptable complexity or storage cost?

### Copy and derivation

When content is copied from one block/container to another, should provenance follow the copied text, record derivation, or start a new origin chain?

### Lens persistence

Which lenses are transient UI selections and which, if any, can become named/saved document-local views?

### Export semantics

How does Markdown/export choose content when multiple containers exist? The default likely needs a clear accepted/final projection, with explicit alternate export profiles later.

## 16. Near-term product-development consequences

Before investing heavily in optional navigation, native History parity, or production AI provider integration, the project should validate this domain direction.

Recommended next design work:

1. define the minimum `SemanticBlock` / `ContentContainer` model and invariants;
2. define lens/filter semantics independently of a particular layout;
3. prototype a continuous block showing two prose containers plus block-local discussion;
4. design the conversation/proposal relationship;
5. design fine-grained provenance requirements and candidate representations;
6. only then revise the durable `.coedit` schema and operation vocabulary;
7. migrate existing continuous-canvas interactions onto the new model rather than expanding the one-body `NodeBlock` assumption.

The goal is not to discard the correctness work already completed. It is to redirect that correctness machinery toward the intended author experience.

## 17. Directional acceptance criteria

Future architecture and UX proposals should be considered aligned with this direction only if they preserve the following properties.

1. An ordinary final-only projection can read and feel like one conventional document.
2. One semantic block can retain multiple related content containers without cloning the block's structural identity.
3. Multiple containers for the same block can be shown simultaneously.
4. Visibility can be selected by typed role/stage and by user tags without mutating underlying content.
5. LLM conversations are durable `.coedit` material and remain linked to the semantic context they discuss.
6. Accepted AI changes become normal attributed document contributions.
7. AI can eventually address content and structure through typed operations rather than privileged direct storage mutation.
8. Attribution can evolve to text-level provenance rather than stopping at node/container ownership.
9. Historical state, current content provenance, and UI projection remain distinct concepts.
10. Existing local-first, append-only, recovery, and portability guarantees remain product constraints rather than casualties of AI integration.
11. The continuous workspace evolves toward richer projections of one semantic document and does not regress into separate outline/editor applications.
12. Implementation convenience must not force `one node = one body = one author` as a permanent domain constraint.

## 18. Summary

The current Coedit implementation has built strong infrastructure for durable local documents, hierarchy, contribution history, safe editing transitions, and future AI attribution. The next product step is to change the abstraction at the center of the workspace.

A semantic location in the document should not own exactly one body. It should anchor multiple related content containers and conversations. The user should be able to project those materials through lenses such as final, draft, comparison, notes, or discussion while continuing to perceive one coherent document.

AI should participate as an attributable contributor operating through typed document commands. The contribution ledger remains the record of change over time, while a finer-grained provenance model records how current text originated and evolved.

This model preserves the strongest parts of the present architecture while creating room for the intended **edit/coedit** workflow: writing, discussing, comparing, rewriting, accepting, and tracing content without losing the unity of the document or the history of how it came to be.
