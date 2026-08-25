# MVP implementation specification

**Status:** Accepted private MVP implementation contract; Step 3 remains blocked on the Step 0 `TextAnchor` decision.

**Applies to:** `SCAFFOLDING_PLAN.md`, Steps 1-12.

## 1. Purpose and authority

This document defines private implementation rules that are not owned by a more focused specification.

Use these focused authorities first:

- [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) for product ontology and logical range/formatting meaning;
- [`MVP_CONTRACT.md`](MVP_CONTRACT.md) for the MVP proof boundary;
- [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) for public engine behavior and component authority;
- [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md) for Markdown import/export and round-trip behavior;
- [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md) for `.coedit` serialization and validation;
- [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) for verification strategy;
- [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) for post-MVP replication constraints; and
- [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) for work order and phase gates.

[`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) is supporting traceability. It records retained, adapted, superseded, and deferred preserved decisions. It is not a competing authority.

## 2. Repository and runtime baseline

The initial runtime target is a normal browser application.

Use:

- React;
- strict TypeScript;
- Vite;
- Vitest;
- Tiptap/ProseMirror as the interactive editor adapter;
- Yjs for collaborative text state;
- the Markdown parser stack specified in `MARKDOWN_INTERCHANGE.md`;
- DOMPurify or an equivalently reviewed sanitizer; and
- IndexedDB for browser-local artifact storage.

Pin the package manager and dependency versions when Step 1 creates the scaffold.

Do not initially add:

- Tauri;
- Rust;
- SQLite;
- multiple frontend entry points;
- host capability variants;
- filesystem plugins;
- outbound network providers;
- a service worker or PWA package;
- a monorepo package graph; or
- compatibility adapters for preserved `DocumentNode` behavior.

The production browser build must make no outbound runtime request unless a later accepted capability requires one.

Do not merge or cherry-pick `tauri-experimental-orphan`. Reuse behavior or tests only as classified in `PRESERVED_BRANCH_RECONCILIATION.md`.

## 3. Source-layout direction

Start with one application. Add files when their behavior exists; do not create an empty package architecture in advance.

```text
src/
  domain/
    model.ts
    ids.ts
    tags.ts
    operations.ts
    validation.ts
    projection.ts

  history/
    model.ts
    ledger.ts
    materialize.ts
    restore.ts

  content/
    collaborativeText.ts
    formatting.ts
    projection.ts

  serialization/
    portableFormat.ts
    markdownImport.ts
    markdownExport.ts

  storage/
    repository.ts
    memoryRepository.ts
    indexedDbRepository.ts

  application/
    DocumentEngine.ts
    lenses.ts

  editor/
    InlineContentEditor.tsx
    editGroupPolicy.ts
    editGroupCoordinator.ts
    sanitizeRichText.ts

  components/
    Welcome.tsx
    DocumentWorkspace.tsx
    BlockView.tsx
    HistoryView.tsx
    ImportDiagnostics.tsx
    DomainInspector.tsx
```

Do not split the application into packages before an independent consumer exists.

## 4. IDs, tags, and structural limits

Use distinct branded TypeScript types for persisted identities. The MVP needs at least:

- `DocumentId`;
- `BlockId`;
- `InlineContentId`;
- `ContributorId`;
- `CommandId`;
- `ContributionId`;
- private `RevisionId`; and
- optional `SessionId`.

Persisted entity IDs use canonical lowercase UUID-v4 text at the wire boundary. Production generation uses Web Crypto. Tests inject valid deterministic ID sequences.

Use one tag-normalization implementation for Block and InlineContent tags. Keep ownership separate.

Initial tag rules:

- Unicode NFKC normalization;
- trim outer whitespace;
- collapse internal whitespace;
- case-insensitive identity;
- first-spelling preservation;
- remove empty values;
- reject control characters;
- at most 20 tags per owner;
- at most 64 Unicode code points per tag; and
- at most 256 UTF-8 bytes per tag.

Initial live-domain limits:

- 50,000 Blocks;
- 50,000 InlineContents; and
- Block depth 1,000 including the root.

All tree walks that can encounter user-controlled structure must be iterative and bounded.

## 5. Pure structural operations

The logical entity shape is defined by `PRODUCT_DOMAIN_MODEL.md`.

Use these first structural operations:

```ts
type StructuralOperation =
  | {
      readonly kind: "CreateBlock";
      readonly blockId: BlockId;
      readonly parentId: BlockId;
      readonly index: number;
      readonly tags: readonly string[];
      readonly childrenPresentation: ChildrenPresentation;
    }
  | {
      readonly kind: "MoveBlock";
      readonly blockId: BlockId;
      readonly parentId: BlockId;
      readonly index: number;
    }
  | { readonly kind: "DeleteBlock"; readonly blockId: BlockId }
  | {
      readonly kind: "CreateInlineContent";
      readonly blockId: BlockId;
      readonly inlineContentId: InlineContentId;
      readonly index: number;
      readonly tags: readonly string[];
      readonly content: InlineContentValue;
    }
  | {
      readonly kind: "MoveInlineContent";
      readonly inlineContentId: InlineContentId;
      readonly index: number;
    }
  | { readonly kind: "DeleteInlineContent"; readonly inlineContentId: InlineContentId }
  | { readonly kind: "SetBlockTags"; readonly blockId: BlockId; readonly tags: readonly string[] }
  | {
      readonly kind: "SetInlineContentTags";
      readonly inlineContentId: InlineContentId;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "SetChildrenPresentation";
      readonly blockId: BlockId;
      readonly value: ChildrenPresentation;
    };
```

`InlineContentValue` means the complete initial collaborative text plus formatting state required by the accepted Step 3 model. Its concrete TypeScript representation remains blocked on the `TextAnchor` decision.

Operation rules:

- create indices use the vector before insertion and accept `0..length`;
- move indices use the destination vector after removal and accept `0..postRemovalLength`;
- invalid indices are rejected, not clamped;
- a move that resolves to the original order is `NoEffect`;
- operation groups apply sequentially to one detached candidate;
- each operation sees the preceding operation result;
- empty groups and no-effect operations are rejected;
- reducers generate neither IDs nor clocks; and
- a failed group publishes no state and reserves no new identity.

`MoveInlineContent` only reorders within its current owner in the initial MVP. Cross-Block transfer can be expressed later through explicit product operations if required.

Do not add entity tombstones or lifecycle timestamps to the logical live entities. Do not add a primitive `RestoreBlock`; whole-Version restore belongs to History.

## 6. Collaborative text and formatting boundary

Each InlineContent owns canonical collaborative text plus external formatting ranges.

HTML and plain text are derived. Do not persist HTML as a parallel authority.

The interactive editor can use ProseMirror/Tiptap marks transiently as an adapter representation. Those marks are not the independent durable domain authority. Durable formatting is represented through the external range model in `PRODUCT_DOMAIN_MODEL.md`.

The concrete `TextAnchor` representation, formatting-update operation shape, and exact collaborative-state verification method are not accepted yet. Step 0 must close those decisions before implementation begins.

Until then, do not specify or implement:

- Yjs relative positions as the required anchor;
- absolute character offsets as the required anchor;
- ProseMirror document positions as the required anchor;
- a mark-only persisted formatting model;
- a generic `collaborativeStateEquivalent` algorithm based on Yjs internals; or
- a final portable encoding for anchors.

The accepted Step 3 decision must define a single atomic boundary for text and formatting changes so no committed Version can contain mismatched collaborative text and formatting anchors.

## 7. Private MVP History

`MVP_ARCHITECTURE.md` is the public engine contract. The local implementation can use a linear private ledger and full snapshots.

Private records can include:

- a Contributor catalog;
- append-only Contribution records;
- append-only revision records;
- one moving private head; and
- document-lifetime ID reservation sets.

Genesis has sequence zero and no Contribution.

A new document requires at least one human Contributor. For the MVP, the UX asks for a free-form display name before session creation and supplies that Contributor to the engine factory. This does not create an account/profile model.

Contributor display names are trimmed, control-character-free text limited to 128 Unicode code points and 512 UTF-8 bytes.

The domain vocabulary can retain Contributor kinds `human`, `imported`, `automation`, and `ai`, but strict MVP creation needs only human and imported identities. Post-genesis contributor registration is deferred.

Each successful durable command publishes one logical Contribution and one resulting private revision atomically.

Use globally unique `CommandId` values. Check a previously successful CommandId before stale-version rejection:

- an exact retry returns the original receipt and emits no new Contribution or notification;
- reuse with different canonical request content is an error.

Serialize local commits internally. Perform expected-Version checking inside that serialization boundary. Two concurrent requests against the same base produce exactly one success.

Use canonical RFC 3339 UTC timestamps with millisecond precision.

## 8. Semantic Checkpoint and restore

A semantic **Checkpoint** is the `checkpointCurrent` History command defined by the architecture.

It must:

1. validate the expected base Version;
2. append one attributed Checkpoint Contribution;
3. append one resulting Version whose document material equals the base;
4. advance the private head; and
5. expose the resulting VersionToken through History.

Do not use `checkpoint` for interactive editor safety captures.

Restore validates its expected current Version and historical target, then appends a new restore Contribution and resulting Version whose material matches the historical target. Restore never rewinds or deletes History.

## 9. Read isolation and notifications

Queries, History pages, summaries, exact materializations, and editor-content reads return detached values.

No frontend API exposes private `RevisionRecord`, archive objects, engine-owned byte arrays, live Y.Doc references, or storage collections.

After successful publication, emit one invalidation notification. Failed commands and exact idempotent retries emit none.

## 10. Read-only workspace and structural editing

The first browser workspace is deliberately plain.

Welcome actions:

- New blank document;
- Import Markdown;
- Open `.coedit`; and
- Open bundled sample.

Workspace behavior:

- render the continuous Block document from engine queries;
- derive outline labels from the same selected InlineContent as manuscript text;
- show import diagnostics;
- support current/historical selection without mutating History;
- provide a development-only inspector; and
- retain the VersionToken returned with each projection for later edits.

Structural editing uses only `DocumentEngine.execute`. React does not mutate revisioned state directly.

Support create, move, nest, reorder, delete, tag, InlineContent selection/reordering, and `childrenPresentation` changes.

## 11. Interactive editor semantic-group policy

Adapt the implemented preserved `BODY_CHECKPOINT_STRATEGY.md` behavior. In current vocabulary, call the physical durable units **edit captures**, not Checkpoints.

One human-visible semantic edit group can contain several physical edit captures that share one `groupId`.

Initial policy defaults:

```ts
interface EditGroupPolicy {
  readonly batchCharacterThreshold: number;
  readonly idleTimeoutMs: number;
}

const DEFAULT_EDIT_GROUP_POLICY = {
  batchCharacterThreshold: 20,
  idleTimeoutMs: 30_000,
};
```

Keep a maximum of two detached pending edit captures.

Accepted behavior:

- count inserted grapheme clusters, not UTF-16 code units or raw key events;
- before the threshold-triggering grapheme is accepted, capture the preceding dirty insertion segment and retain the same group ID;
- first deletion after dirty insertion seals insertion before deletion;
- first insertion after dirty deletion seals deletion before insertion;
- repeated deletions remain in one deletion group;
- real cursor/focus departure seals dirty work once;
- clean navigation creates no capture;
- accepted dirty activity resets the idle timer;
- IME composition is not split mid-composition;
- paste, cut, replacement, formatting, undo, and redo are atomic edits;
- unrelated dirty work seals before an atomic edit;
- the complete atomic edit result captures and seals before later ordinary work;
- a controlled transition freezes editor state, captures required work, respects FIFO order, and drains required captures before the transition can hide, replace, retarget, export, save, restore, or close the editor context;
- persistence/capture failure retains the exact failed immutable item for retry; and
- backpressure visibly blocks unsafe additional changes at the two-capture bound.

History can collapse contiguous edit Contributions that share one non-null semantic group ID for presentation. Grouping never rewrites or deletes physical History.

The Step 3 atomic text+formatting representation must fit this policy. If the accepted `TextAnchor` model requires changing these semantics, stop and record that as a new design decision rather than changing them implicitly.

## 12. Lenses and comparison

Implement lenses as application queries over an explicit Version.

Initial lenses:

- default/main: first `view:main`, otherwise first InlineContent;
- summary: first `view:summary`, otherwise default/main.

If several contents match, select the first in vector order and return a projection diagnostic. Zero contents means no own rendered content.

Initial lenses preserve the complete Block tree. They do not silently reparent Blocks.

Historical comparison aligns Blocks by stable `BlockId` and reports unmatched subtrees. Do not guess correspondence.

Markdown rendering belongs to `MARKDOWN_INTERCHANGE.md`.

## 13. Browser durability

IndexedDB stores opaque `.coedit` artifacts plus local descriptors. It is not a second document repository.

The storage adapter does not parse private engine History or document records.

Repository saves use an expected previously stored VersionToken. Write the new artifact and new saved token atomically. A mismatch is a persistence conflict; do not silently overwrite another tab's work.

UX dirty state is the comparison between the engine's current token and the token last transported successfully.

## 14. Final infrastructure assessment

After the strict MVP vertical slice works, measure before adopting new infrastructure.

Before SQL, require evidence about document size, History growth, materialization latency, query needs, attachment needs, compaction, and atomicity limits.

Before a native shell, require a concrete browser-inadequate need. The shell wraps the validated application; it does not redefine the document engine.

Before networked collaboration, apply `COLLABORATION_MODEL.md` in full. Local linear History, full snapshots, and any one-Y.Doc-per-InlineContent arrangement are private MVP choices, not distributed-system contracts.

Provenance, comments, durable discussions, AI contributor registration, and collaboration are post-MVP experiments.

## 15. Reuse rule

Use `PRESERVED_BRANCH_RECONCILIATION.md` as the single reuse/traceability inventory.

Do not duplicate a second salvage table here. When a preserved implementation detail conflicts with a current authority, current authority controls. When the conflict reveals a non-trivial design choice, stop and record that choice before implementation.
