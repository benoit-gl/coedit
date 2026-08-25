# MVP implementation specification

**Status:** Accepted clean-slate MVP implementation contract.

**Applies to:** `SCAFFOLDING_PLAN.md`, Steps 1-13.

**Read-only reference branch:** `tauri-experimental-orphan`

**Recorded reference tip:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose and authority

This document defines concrete implementation rules for the document-engine MVP. It contains technology choices, private implementation contracts, limits, source layout, test rules, and selective reuse guidance.

This document does not define product meaning or the public engine contract. Use these authorities first:

1. [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) for the logical ontology and domain vocabulary.
2. [`MVP_CONTRACT.md`](MVP_CONTRACT.md) for the MVP proof boundary.
3. [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) for component authority and public engine behavior.
4. [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) for post-MVP replication constraints.
5. [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) for implementation order and phase gates.

Where an implementation example conflicts with a higher authority, the higher authority controls. Keep the conflicting implementation detail private until the authority changes explicitly.

The preserved branch is evidence only. Do not merge or cherry-pick it wholesale. Review each reused behavior against the current domain model before it enters `main`.

## 2. Repository and technology baseline

### 2.1 Repository safety

Before implementation work, verify the current branch, working tree, and preserved reference:

```powershell
git branch --show-current
git status --short
git rev-parse tauri-experimental-orphan
```

The active branch must be `main` or a branch that descends from `main`. The reference branch must resolve successfully.

Inspect preserved material without changing branches:

```powershell
git show tauri-experimental-orphan:src/domain/tags.ts
git show tauri-experimental-orphan:src/domain/tree.ts
```

Do not commit, reset, rebase, merge into, or otherwise alter `tauri-experimental-orphan`.

Generated directories are not source inputs. The first scaffold must ignore at least:

```text
node_modules/
dist/
*.tsbuildinfo
coverage/
.vite/
```

### 2.2 Browser-first stack

The initial runtime target is a normal browser application.

Use:

- React;
- strict TypeScript;
- Vite;
- Vitest;
- Tiptap/ProseMirror;
- Yjs;
- a maintained Markdown AST parser;
- DOMPurify or an equivalently reviewed sanitizer; and
- IndexedDB for browser-local durability.

Pin the package manager and dependency versions when Step 1 creates the scaffold. Do not copy the preserved lockfile.

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
- compatibility adapters for the version-1 `DocumentNode` model.

The production browser build must make no outbound runtime request unless a later accepted capability requires one.

### 2.3 One implementation of domain behavior

Implement tree validation, operation application, tag normalization, History semantics, import rules, hashing, and native serialization once in TypeScript.

A future native shell can provide packaging and file access. It must not automatically create a second domain implementation.

### 2.4 One canonical rich-text authority

Do not persist independently authoritative HTML and Yjs state.

Each InlineContent owns one canonical CollaborativeText value. Rendered HTML and plain text are derived values. A cache is allowed only when it is disposable or verifiably derived.

### 2.5 Commands from the start

The UI must not mutate durable domain state directly. Every client-originated durable change passes through the asynchronous `DocumentEngine` command boundary in `MVP_ARCHITECTURE.md`.

Queries return detached or read-only projections. Change notifications are invalidation hints. The UI re-queries after a notification.

React can own transient selection, disclosure, focus, open panels, editor composition state, and the active lens.

## 3. Intended source layout

Start with one application:

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
    inlineTypes.ts
    schema.ts
    yjsCollaborativeText.ts
    readModel.ts
    annotations.ts

  serialization/
    nativeFormat.ts
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
    sanitizeRichText.ts

  components/
    Welcome.tsx
    DocumentWorkspace.tsx
    BlockView.tsx
    HistoryView.tsx
    ImportDiagnostics.tsx
    DomainInspector.tsx

  App.tsx
  main.tsx

test/
  fixtures/
    markdown/
    native/
```

`domain/model.ts` owns `Block`, `InlineContent`, and the opaque CollaborativeText value shape. The `content/` directory owns the Yjs interpretation and seed/projection types. It must not define a second content entity or ownership map.

Add `annotations.ts` only when Step 12 starts. Do not create empty files in advance. Do not split the application into packages before an independent consumer exists.

## 4. Step 1 — Browser scaffold rules

Create:

- `.gitignore`;
- a concise root `README.md` that links to `docs/README.md` and the scaffolding plan;
- `LICENSE`;
- `package.json`;
- TypeScript, Vite, and Vitest configuration; and
- the smallest page that proves development, test, and production builds.

Do not copy old architecture documents into `main`. Use the preserved branch only for the reuse items in Section 17.

The initial scaffold must not contain generated tracked files.

## 5. Step 2 — Pure Block domain

`PRODUCT_DOMAIN_MODEL.md` defines the ontology. This section defines the first executable representation and limits.

### 5.1 IDs

Use distinct branded TypeScript types for persisted identities. Grow the set as capabilities appear. The set includes at least:

- `DocumentId`;
- `BlockId`;
- `InlineContentId`;
- `ContributorId`;
- `CommandId`;
- `ContributionId`;
- `RevisionId` for private MVP storage; and
- `SessionId`.

At the wire boundary, persisted IDs are canonical lowercase UUID-v4 text. Production generation uses Web Crypto. Tests inject valid deterministic UUID sequences. Do not use a timestamp or `Math.random()` fallback.

### 5.2 Tag normalization

Use one tag-normalization implementation for Block and InlineContent tags. Keep ownership separate.

The initial contract is:

- normalize with Unicode NFKC;
- trim outer whitespace;
- collapse internal whitespace;
- use case-insensitive identity;
- preserve the first spelling;
- remove empty values;
- reject control characters;
- allow at most 20 tags per owner;
- allow at most 64 Unicode code points per tag; and
- allow at most 256 UTF-8 bytes per tag.

### 5.3 Live-domain limits

Use these initial limits:

- 50,000 Blocks;
- 50,000 InlineContents; and
- Block depth 1,000, including the root.

All domain and session tree walks must be iterative and bounded. This rule applies to lookup, validation, projection, cloning, affected-ID derivation, move, delete, materialization, and restore. A valid depth-1,000 document must not overflow the JavaScript call stack.

### 5.4 Initial executable shape

Use these structural contracts:

```ts
interface RevisionedDocument {
  readonly root: Block;
}

interface Block {
  readonly id: BlockId;
  readonly tags: readonly string[];
  readonly childrenPresentation: ChildrenPresentation;
  readonly contents: readonly InlineContent[];
  readonly children: readonly Block[];
}

interface InlineContent {
  readonly id: InlineContentId;
  readonly tags: readonly string[];
  readonly text: CollaborativeText;
}

interface CollaborativeText {
  readonly schemaVersion: 1;
  readonly encoding: "yjs-update-v1";
  readonly state: Uint8Array;
}
```

Step 2 treats CollaborativeText as an opaque immutable value. Step 3 is the only implementation that interprets its bytes.

### 5.5 Structural operations

Use this initial vocabulary:

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
      readonly text: CollaborativeText;
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

Apply these rules:

- `CreateBlock` supplies a new ID, destination parent, insertion index, initial tags, and initial child presentation. Its content and child arrays start empty.
- `MoveBlock` measures its insertion index after removal from the old sibling vector.
- `DeleteBlock` removes the Block and its full subtree from live state. It cannot target the root.
- `CreateInlineContent` supplies its owner, new ID, insertion index, initial tags, and a complete CollaborativeText value. Creation is atomic.
- `MoveInlineContent` reorders content inside its current owner. Cross-Block transfer is deferred.
- `DeleteInlineContent` removes the entity and its embedded text from live state.
- Tag operations replace the full tag array. They normalize and validate it. They do not merge implicitly.
- `SetChildrenPresentation` accepts only `sections`, `flow`, `bullets`, or `numbers`.
- Create indices use the vector before insertion and accept `0..length`.
- Move indices use the destination vector after removal and accept `0..postRemovalLength`.
- Reject invalid indices. Do not clamp them.
- Reject a move that resolves to the original order as `NoEffect`.

Apply an operation group in order. Each operation sees the previous operation result. Reducers are immutable. A reducer returns a detached structure or a typed `DomainError`. It never leaves a partial mutation.

Reject empty groups and no-effect operations. Inject IDs and clocks at the command/session boundary. Reducers must not generate them.

Do not add `RestoreBlock`, entity tombstones, entity timestamps, or independent CollaborativeText reference/sharing operations. Whole-Version restore belongs to History.

### 5.6 Required Step 2 verification

Verify at least these cases:

- one root is required and cannot move or delete;
- duplicate IDs fail;
- cycles fail;
- a Block cannot have two parents;
- an InlineContent cannot have two owners;
- sibling and content vector order is exact;
- invalid indices fail without mutation;
- count and depth limits work at and beyond each boundary;
- depth-1,000 operations do not recurse on the JavaScript stack;
- subtree moves retain identity;
- moves into self or a descendant fail;
- subtree deletion removes descendants and owned InlineContents from live state;
- Block and InlineContent tag scopes remain separate;
- CollaborativeText byte arrays are copied at mutable boundaries;
- content creation does not clone structural identity;
- child presentation remains a parent property;
- contentless grouping Blocks validate; and
- every failed operation leaves the input deeply equal to its original value.

## 6. Step 3 — Headless CollaborativeText kernel

### 6.1 Yjs boundary

Materialize one transient `Y.Doc` per InlineContent. Use one fixed `Y.XmlFragment` named `prosemirror`.

The persisted authority is the CollaborativeText value in `InlineContent.text`. Reconstruct a live Y.Doc only while content is created, validated, projected, or edited.

Moving a Block or reordering an InlineContent preserves the same InlineContent and CollaborativeText state.

Entity copy and text copy are different operations. An entity copy creates a new InlineContent ID and a fresh Y.Doc from the normalized semantic projection. Ordinary copy/paste inserts projected content into the target InlineContent. It does not transfer the source entity identity.

Keep the one-Y.Doc-per-InlineContent design for the MVP. Reconsider it only after measurements show a need for cross-content Yjs transactions or another synchronization topology.

### 6.2 Inline schema

Use one inline-only schema.

Nodes:

- `doc`;
- `text`; and
- `hardBreak`.

`doc` contains only zero or more `text` or `hardBreak` inline nodes. Nodes have no arbitrary attributes.

Marks:

- `bold`;
- `italic`;
- `underline`;
- `strikethrough`;
- `inlineCode`; and
- `link`.

Only `link` has an attribute. Its only attribute is `href`.

Do not store authored headings, paragraphs, lists, images, tables, or arbitrary nodes in CollaborativeText.

Allow links with these forms:

- `http`;
- `https`;
- `mailto`;
- same-document fragments; and
- relative references.

Reject control characters and all other explicit schemes.

### 6.3 Seed and projection model

Use this normalized boundary:

```ts
type InlineMark =
  | { readonly kind: "bold" | "italic" | "underline" | "strikethrough" | "inlineCode" }
  | { readonly kind: "link"; readonly href: string };

type InlineAtom =
  | { readonly kind: "text"; readonly text: string; readonly marks: readonly InlineMark[] }
  | { readonly kind: "hardBreak" };

type InlineSeed = readonly InlineAtom[];
```

Normalization must:

- remove empty text runs;
- coalesce adjacent text runs with identical marks;
- reject duplicate marks;
- validate link destinations; and
- store marks in a fixed order.

The normalized projection is the user-visible semantic equality boundary. Do not use Yjs client IDs or update-byte order for semantic equality.

Define two separate comparisons:

- `projectionEquivalent(a, b)` compares normalized InlineAtom projections;
- `collaborativeStateEquivalent(a, b)` compares reconstructed Yjs shared-type structure, CRDT identities, and delete sets while it ignores update-byte ordering.

Use projection equivalence for import determinism, rendering, and semantic entity copies. Use collaborative-state equivalence for History replay and cases where future anchors or incremental updates can distinguish state.

Do not add font family or font size until an observed workflow requires them.

### 6.4 Kernel operations

Provide headless functions to:

- create empty CollaborativeText;
- create CollaborativeText from a validated InlineSeed;
- semantically clone CollaborativeText through a fresh Y.Doc;
- decode CollaborativeText into a fresh Y.Doc;
- project content to an immutable inline representation;
- compare projection equivalence;
- compare collaborative-state equivalence;
- apply a Yjs update to a detached candidate;
- validate the resulting schema and limits;
- encode the validated candidate as a new complete CollaborativeText value; and
- validate all embedded CollaborativeText values in a complete document.

Extend the operation vocabulary with:

```ts
type CollaborativeTextOperation = {
  readonly kind: "ApplyCollaborativeTextUpdate";
  readonly inlineContentId: InlineContentId;
  readonly update: Uint8Array;
};

type DocumentOperation = StructuralOperation | CollaborativeTextOperation;
```

`ApplyCollaborativeTextUpdate` must locate one InlineContent, reconstruct a detached Y.Doc, apply the update, validate the full result, and replace only the embedded value. Reject any Y.Doc that contains a top-level shared type other than the `prosemirror` fragment.

Validate each operation boundary and the completed operation group. A later operation must not sanitize an invalid earlier payload.

### 6.5 CollaborativeText limits

Start with these limits:

- 8 MiB for one incoming incremental update or encoded full snapshot;
- 2,000,000 decoded Yjs structs;
- 1,000,000 Unicode code points;
- 250,000 projected atoms;
- at most six marks on one text atom; and
- 2,048 Unicode code points or 8 KiB UTF-8 for one link destination.

Validate bounds before and after an update.

The content kernel must have no React, Tiptap UI, DOM, HTML parser, or browser-storage dependency. Markdown import creates InlineSeed values directly.

Initial attribution is Contribution-level. Yjs transaction origins are not durable provenance.

### 6.6 Required Step 3 verification

Verify at least these cases:

- empty, marked, linked, and hard-break seeds round trip semantically;
- decoding returns a detached Y.Doc;
- malformed and schema-invalid updates fail without base mutation;
- hidden shared types and over-limit content fail;
- invalid content cannot be hidden by deletion later in the same operation group;
- an update for one InlineContent cannot change another;
- semantic clones preserve projection and use fresh CRDT identities;
- collaborative-state equivalence detects identity or delete-set differences when projections match;
- moves and reorders preserve identity and projected text;
- entity copy gets a new InlineContent ID and fresh CRDT identities;
- delete removes the entity and embedded text from live state;
- stored and returned byte arrays are detached from caller-owned mutable input; and
- failed create, update, or delete groups roll back completely.

## 7. Step 4 — Private MVP History implementation

`MVP_ARCHITECTURE.md` is the only public `DocumentEngine` contract. Do not duplicate that public interface here or in implementation-specific code comments as a competing authority.

### 7.1 Private records

The local MVP can use a linear ledger and full revision snapshots. These records remain private:

```ts
interface Contributor {
  readonly id: ContributorId;
  readonly kind: "human" | "ai" | "automation" | "imported";
  readonly displayName: string;
}

interface GenesisRequest {
  readonly documentId: DocumentId;
  readonly rootBlockId: BlockId;
  readonly initialContributors: readonly Contributor[];
}

interface RevisionRecord {
  readonly id: RevisionId;
  readonly sequence: number;
  readonly parentRevisionId: RevisionId | null;
  readonly contributionId: ContributionId | null;
  readonly snapshot: RevisionedDocument;
}

interface MvpContributionRecord {
  readonly id: ContributionId;
  readonly commandId: CommandId;
  readonly contributorId: ContributorId;
  readonly committedAt: string;
  readonly baseRevisionId: RevisionId;
  readonly resultingRevisionId: RevisionId;
  readonly effect:
    | { readonly kind: "operations"; readonly operations: readonly DocumentOperation[] }
    | {
        readonly kind: "importMarkdown";
        readonly operations: readonly DocumentOperation[];
        readonly source: ImportSourceMetadata;
      }
    | { readonly kind: "checkpointCurrent" }
    | { readonly kind: "restore"; readonly targetRevisionId: RevisionId };
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedInlineContentIds: readonly InlineContentId[];
  readonly sessionId?: SessionId;
  readonly summary?: string;
}

interface MaterializedRevision {
  readonly revisionId: RevisionId;
  readonly sequence: number;
  readonly snapshot: RevisionedDocument;
}

interface DocumentSessionArchive {
  readonly documentId: DocumentId;
  readonly currentRevisionId: RevisionId;
  readonly contributors: readonly Contributor[];
  readonly contributions: readonly MvpContributionRecord[];
  readonly revisions: readonly RevisionRecord[];
}

interface ImportSourceMetadata {
  readonly sourceName: string | null;
  readonly mediaType: "text/markdown";
  readonly byteLength: number;
  readonly sha256: string;
}
```

`ContributionContext` and public command/query values remain defined by `MVP_ARCHITECTURE.md`.

### 7.2 Ledger rules

The private engine owns:

1. an append-only contributor catalog;
2. an append-only Contribution ledger;
3. append-only revision records;
4. one moving private head-revision pointer; and
5. no durable UI state.

Genesis requires at least one validated Contributor. It creates the document ID, permanent empty root, contributor catalog, and genesis revision atomically.

The genesis root has:

- `tags=[]`;
- `contents=[]`;
- `children=[]`; and
- `childrenPresentation="flow"`.

Contributor IDs must be unique. Display names are trimmed, contain no control characters, and are limited to 128 Unicode code points and 512 UTF-8 bytes. Contributor kind is closed to `human`, `ai`, `automation`, and `imported`.

Genesis is the only bootstrap path that can register a Contributor without attribution. Do not silently invent post-genesis contributors. An attributed registration operation is deferred until a concrete AI or collaboration workflow requires it.

Revision sequence zero is genesis. It has no Contribution. Every later private revision has exactly one Contribution. Every Contribution has exactly one resulting revision. Sequence is a private display and storage aid. It is not public version identity.

Each private revision snapshot is one complete `RevisionedDocument`. Do not add a parallel content map or a duplicate current-document aggregate.

### 7.3 Public capability staging

Implement the public architecture incrementally:

| Step | Public capability added |
|---|---|
| 4 | blank engine creation; operation, checkpoint, and restore commands; current/exact queries; History pages and summaries; exact materialization; subscriptions |
| 5 | `importMarkdown` command for the importer adapter |
| 6 | version-checked portable serialization and validated open |
| 7 | document, outline, descriptor, and editor-content projections |
| 10 | content lenses, exact historical comparison, and Markdown rendering adapter |

The MVP can map `VersionToken` to a private `RevisionId`. No client can decode, order, or depend on that mapping.

### 7.4 Command publication and idempotency

Capture the complete command request before it enters the internal serialized queue. Copy all caller-owned arrays, objects, tags, CollaborativeText bytes, incremental updates, source metadata, and context.

Use globally unique `CommandId` values. Persist enough canonical request identity to compare a retry after Save/Open.

Check an existing successful `CommandId` before stale-version rejection:

- an exact retry returns the original receipt and emits no new Contribution or notification;
- reuse with different request content is an error.

Serialize commits internally. Perform the expected-version check inside that boundary. A stale command returns `VersionConflict`. Do not rebase it silently.

Apply operation groups sequentially to one detached candidate. Validate every operation boundary and the final candidate. The `importMarkdown` effect carries durable source metadata but uses ordinary operations.

Two concurrent local requests against the same VersionToken must produce exactly one success.

### 7.5 Affected targets

Derive affected-target arrays inside the session. Do not trust caller-supplied values.

Use unique IDs sorted lexicographically.

Rules:

- `CreateBlock` affects the new Block and destination parent.
- `MoveBlock` affects the moved Block and its old and new parents.
- `DeleteBlock` affects the former parent and every Block and InlineContent in the removed subtree.
- Block tags and child presentation affect the target Block.
- InlineContent create, move, or delete affects that InlineContent and its owning Block.
- InlineContent tags or CollaborativeText updates affect that InlineContent.
- An operation or import group records the union of all per-operation targets, including entities that are both created and deleted in the group.
- Restore records all live Block and InlineContent IDs in the union of base and target snapshots.
- Checkpoint records empty affected-target arrays because document material does not change.

### 7.6 Atomic publication, IDs, and time

Inject the ID generator and clock.

Use canonical RFC 3339 UTC timestamps with exactly millisecond precision:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

Contributor identity must already exist. Do not substitute another contributor.

Track a document-lifetime reservation set for Block and InlineContent IDs. A successful create reserves the ID even when a later operation deletes the entity in the same group. Failed groups reserve nothing.

After request capture, head verification, operation application, full validation, affected-ID derivation, and successful ID/timestamp generation, publish the Contribution, revision, reservation changes, and new head in one synchronous critical section. Any error before publication leaves all four unchanged.

### 7.7 Checkpoint implementation

When the current private head is `H`, checkpoint must:

1. verify `H` is the expected base;
2. append one attributed `checkpointCurrent` Contribution;
3. append one child revision whose document material is identical to `H`;
4. return a new VersionToken; and
5. advance the private head.

A checkpoint of a checkpoint is valid. Do not create a mutable checkpoint pointer, an accepted-Version field, revision tags, or an InlineContent stage field.

### 7.8 Restore implementation

When the current private head is `H` and target is `T`, restore must:

1. verify `H` is the expected base and `T` belongs to the same document;
2. validate a detached clone of `T`;
3. append one restore Contribution with base `H` and target `T`;
4. append a child revision of `H` whose material equals `T`; and
5. advance the private head.

Restore is whole-document replacement in the local MVP. It is not a merge, rewind, or replay of old operations.

CollaborativeText bytes in the new revision must be byte-for-byte identical to the target. Do not rebuild target text from InlineSeed, HTML, ProseMirror JSON, or projected atoms.

Reject restore of the current head. An older Version with equal material is still a valid restore target because the historical action is meaningful.

### 7.9 Read isolation

Queries, History listings, summaries, and materializations return detached read models. Do not expose a private `RevisionRecord`, `DocumentSessionArchive`, engine-owned `Uint8Array`, Y.Doc, or mutable internal collection.

The trusted `editor-content` projection can return copied CollaborativeText bytes for one current InlineContent. Ordinary React rendering consumes semantic projections.

Full snapshots are a private MVP simplicity choice. Do not add compaction, retention, or replicated branching before measurements require them.

### 7.10 Required Step 4 verification

Verify at least these cases:

- genesis has sequence zero and no Contribution;
- one successful non-empty operation group adds exactly one Contribution and revision;
- failed groups add neither and reserve no IDs;
- mutations to queued requests or returned read models cannot change committed state;
- reducer, clock, and ID failures publish nothing;
- deleted IDs cannot be reused;
- stale edit, checkpoint, and restore commands publish nothing;
- same-base concurrent commands yield one success and one conflict;
- historical materialization is exact, detached, and read-only;
- queries report the exact VersionToken they observed;
- tokens from another document fail;
- History listing and summary do not require materialization of every document;
- History cursors retain one observed frontier and deterministic display order;
- command retry is idempotent and conflicting ID reuse fails;
- successful publication emits one invalidation event and failures emit none;
- depth-1,000 commit, materialize, and restore paths remain iterative;
- structural and Yjs changes commit or roll back atomically;
- missing contributors fail;
- timestamps and affected targets are session-derived;
- checkpoint creates one Contribution and one content-identical Version;
- later edits do not mutate prior checkpoint Versions;
- multiple checkpoints remain separately materializable;
- restore creates a child of the pre-restore head with target-equivalent material; and
- restore preserves earlier History, checkpoints, and contributor records.

## 8. Step 5 — Structured Markdown import

### 8.1 Parser and planner

Use `unified` with `remark-parse` and `remark-gfm`. The input dialect is CommonMark plus GFM. Do not parse structural Markdown with regular expressions.

Keep pure planning separate from engine mutation:

```ts
interface MarkdownSource {
  readonly bytes: Uint8Array;
  readonly sourceName: string | null;
}

interface MarkdownImportPlan {
  readonly genesis: {
    readonly documentId: DocumentId;
    readonly rootBlockId: BlockId;
    readonly importedContributor: Contributor;
  };
  readonly operations: readonly DocumentOperation[];
  readonly diagnostics: readonly ImportDiagnostic[];
  readonly sourceMetadata: ImportSourceMetadata;
}

function planMarkdownImport(
  source: MarkdownSource,
  dependencies: {
    readonly ids: IdFactory;
    readonly limits: ImportLimits;
    readonly sha256: (bytes: Uint8Array) => Promise<string>;
  },
): Promise<Result<MarkdownImportPlan, MarkdownImportFailure>>;
```

`sourceName` is a display basename only. Do not pass or persist an absolute local path.

The planner creates one imported Contributor. Derive its display name deterministically from `sourceName`, or use `Markdown import` when no source name exists.

Source metadata contains:

- source name;
- raw byte length;
- media type `text/markdown`; and
- lowercase SHA-256 of the original input bytes.

A separate application service creates a candidate engine with the current human Contributor and imported Contributor. It then submits the full operation group as one `importMarkdown` command attributed to the imported Contributor.

The initial importer creates a new engine. It does not merge into an open document. Replace the active engine only after planning and the atomic import command both succeed.

Production IDs remain random. Determinism means that the same input with the same injected ID sequence and limits gives the same operation kinds, IDs, placement, tags, semantic CollaborativeText projections, and diagnostics. Independent Yjs encodings do not need byte identity.

If parsing yields no manuscript AST nodes, return `empty-markdown` before ID allocation or engine creation.

### 8.2 Heading construction

Use this algorithm:

1. Create one real root.
2. Consume an H1 as root content only when it is the first AST child after BOM and blank-line handling.
3. If the first H1 becomes the title, treat the root as heading depth 1 for skipped-level diagnostics. Otherwise use depth 0.
4. Every later H1 attaches directly to the root.
5. For every other heading, pop to the nearest open lower-depth heading and attach there. Attach to root when none exists.
6. A skipped level creates no synthetic heading. Attach to the nearest lower heading and emit `heading-level-skipped`.
7. An empty heading creates one InlineContent with empty CollaborativeText.
8. Source filename is metadata. Do not fabricate manuscript text from it.

For each root or section, collect body nodes and subsection nodes separately.

Normalize them as follows:

- body nodes become direct `flow` children;
- when subsections coexist with body material, put subsections in one transparent contentless grouping Block with `childrenPresentation="sections"`;
- an owner with body material uses `flow`, with the subsection group after the body;
- an owner with subsections and no body can use `sections` directly; and
- preserve source order within body material and within subsections.

### 8.3 Supported mapping

Map supported nodes as follows:

```text
paragraph                 -> terminal Block with one InlineContent
unordered list            -> transparent grouping Block with bullets children
ordered list              -> transparent grouping Block with numbers children
list item first paragraph -> the list-item InlineContent
remaining item material   -> flow children of that list item
nested list               -> transparent group among those flow children
text / hard break         -> InlineSeed text / hard break
CommonMark soft break     -> one ordinary space
emphasis / strong         -> italic / bold mark
delete / inline code      -> strikethrough / inline-code mark
link                      -> safe link mark; unsafe link uses literal fallback
```

A list item with no leading paragraph receives one empty InlineContent.

Normalize an ordered-list start other than one to one. Emit a diagnostic until explicit start-number semantics exist.

Preserve GFM task markers as literal `[ ]` or `[x]` prefixes and emit a diagnostic.

### 8.4 Unsupported source fallback

Use one source-preserving fallback for unsupported Markdown nodes.

Create a terminal Block with one InlineContent tagged `import:markdown-literal`. Its CollaborativeText contains the node's exact normalized source slice as plain text. Emit a source-positioned warning that names the lost presentation.

Normalized source means:

- UTF-8 decoded text;
- BOM removed; and
- CRLF and CR normalized to LF.

Do not retain original byte offsets or line-ending style.

Initially use this fallback for:

- fenced or indented code blocks;
- tables;
- block quotes;
- images;
- raw HTML;
- thematic breaks; and
- unknown block constructs.

Unsupported inline nodes and unsafe links become literal source runs with the same warning policy. Preserve label and destination syntax. Never interpret raw HTML.

If an unsupported node has no usable source offsets, reject the import. Do not discard it.

### 8.5 Diagnostics

Use stable machine fields:

```ts
interface ImportDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly nodeKind: string;
  readonly source: {
    readonly startOffset: number;
    readonly endOffset: number;
    readonly line: number;
    readonly column: number;
  };
  readonly action: "preserved" | "normalized" | "rejected";
}
```

The initial code vocabulary includes:

- `heading-level-skipped`;
- `ordered-list-start-normalized`;
- `task-marker-literalized`;
- `unsafe-link-literalized`;
- `unsupported-node-literalized`; and
- `unsupported-node-without-source`.

Add new codes with fixtures. Do not use user-facing message text as a machine identifier.

### 8.6 Import limits and decoding

Start with these limits:

- 10 MiB UTF-8 source;
- 200,000 Markdown AST nodes;
- 50,000 generated Blocks;
- nesting depth 100;
- 1,000,000 Unicode code points in one InlineContent; and
- 255 Unicode code points or 1 KiB UTF-8 for a source name.

Source names must contain no control characters.

Decode UTF-8 with fatal error handling and optional BOM. Normalize line endings for parsing. Retain offsets into the normalized source.

Invalid UTF-8 or any exceeded limit is an error and creates no engine.

Convert each InlineSeed through the Step 3 kernel and place the complete CollaborativeText value in `CreateInlineContent`.

All imported text is attributable to the single import Contribution. Do not claim range provenance.

### 8.7 Required fixtures

Include fixtures for:

- a conventional essay;
- empty or whitespace-only input;
- several top-level headings;
- skipped heading levels;
- paragraphs before the first heading;
- ordered, unordered, and nested lists;
- mixed paragraphs, lists, and subsections;
- emphasis, strong text, and links;
- empty headings;
- code blocks;
- tables;
- images;
- block quotes;
- inline and raw HTML; and
- invalid UTF-8, malformed, or unusually large input.

Store the expected operation/projection shape and diagnostics, or the expected rejection.

Include one golden fixture with introductory paragraphs, a list, and subsections under the same heading. It must prove the grouping rule.

## 9. Step 6 — Lossless native interchange

### 9.1 Envelope

Define the first portable encoding after Step 5 fixtures exercise the real domain and History shape.

The public engine exposes opaque bytes plus media type and extension metadata. The UX must not parse the payload.

The version-1 payload is a private codec. It is not a permanent History representation.

Use one JSON envelope with:

```text
format identifier: "coedit-document"
format version: 1
export timestamp
document ID
current revision ID
contributor catalog
contributions in chronological order
revisions in sequence order, each with one complete snapshot
integrity: { algorithm: "sha256", digest: lowercase hex }
```

Do not store a duplicate current document. Current state is the snapshot named by `currentRevisionId`.

### 9.2 Flat snapshot wire form

Keep the in-memory tree recursive. Flatten each revision snapshot on the wire:

```text
rootBlockId
blocks[]:
  id, parentId|null, siblingIndex|null, tags, childrenPresentation, inlineContentIds[]
inlineContents[]:
  id, tags, text { schemaVersion, encoding, state }
```

Serialize Blocks with iterative depth-first pre-order and sibling vector order.

For each Block, retain InlineContent vector order in `inlineContentIds`. Serialize InlineContent records in first ownership appearance order.

Only the root has `parentId: null` and `siblingIndex: null`. Every non-root Block records its zero-based sibling index.

These flat records are a serialization of the recursive model. They do not create new domain relationships.

On decode, validate exactly one root, contiguous sibling indices, unique ownership, and exact recursive order.

Each CollaborativeText wire value is:

```text
schemaVersion: 1
encoding: "yjs-update-v1"
state: standard padded base64 of the complete Yjs update
```

### 9.3 Wire rules

Use these rules:

- encode branded IDs as JSON strings and validate them with entity-specific parsers;
- use flat Block and InlineContent tables for revision snapshots;
- do not create a separate CollaborativeText table or ID;
- include stable `CommandId` in every non-genesis Contribution;
- preserve enough canonical request identity for command-idempotency verification;
- encode each operation with its exact discriminator and payload;
- use canonical Step 4 timestamps;
- encode import hashes as exactly 64 lowercase hexadecimal SHA-256 characters;
- omit optional properties instead of changing silently between missing and `null`; and
- encode complete CollaborativeText state and incremental Yjs updates as standard padded base64.

Do not drop binary operation payloads because full revision snapshots also exist.

Copy decoded bytes before domain construction.

### 9.4 Transport separation

Keep transport outside the codec and engine. Use the public serialization and factory methods defined in `MVP_ARCHITECTURE.md`.

The private encoder receives a detached persistence view from inside the engine. Do not add a public `archive()` accessor.

The decoder validates completely and creates a candidate engine before the application replaces the active engine.

Serialization uses an expected VersionToken. If the engine advanced before serialization, return `VersionConflict` instead of saving another Version silently.

Copy caller-owned open bytes before asynchronous work or retention.

### 9.5 Hostile-input validation order

Treat input as hostile. Validate in this order:

1. raw input byte, depth, and collection limits;
2. duplicate-key-free JSON, envelope identifier, exact supported version, allowed properties, and safe-integer numeric fields;
3. base64 shape and decoded-size limits;
4. corruption checksum over the still-untrusted payload;
5. revision sequence, parent links, current pointer, and the one-to-one Contribution/revision relationship;
6. contributor references, stable identity continuity, and absence of conflicting ID reuse;
7. all Block invariants, exact InlineContent ownership, and absence of duplicate or orphan records; and
8. all CollaborativeText schema and content limits.

After shape validation, verify History from genesis in sequence order.

For `operations` and `importMarkdown`, reapply effects to the parent snapshot. Compare normalized Block structure plus `collaborativeStateEquivalent` text with the stored result.

For checkpoints, verify material identity with the parent.

For restore, verify document material against the target. CollaborativeText bytes must be byte-identical to the target.

Recompute affected targets and the document-lifetime reserved-ID set. Do not trust serialized claims.

### 9.6 Native limits

Start with:

- 64 MiB UTF-8 JSON;
- JSON nesting depth 128;
- 5,001 revisions including genesis;
- 5,000 Contributions;
- 250,000 operations in one Contribution;
- 1,000,000 operations in the archive;
- 50,000 Blocks in any snapshot;
- 50,000 InlineContents in any snapshot;
- 8 MiB for one decoded CollaborativeText value or incoming update; and
- 48 MiB decoded binary data across the archive.

Check the raw byte limit before JSON parsing. Use iterative bounded validation after parsing.

The encoder preflights the same limits and the final UTF-8 byte size. Return a typed limit error instead of producing a same-version file that the decoder rejects.

Do not truncate an in-memory engine to fit the portable format.

### 9.7 Checksum

Use SHA-256 as a corruption checksum. Do not present it as authentication.

Compute the digest over a documented canonical UTF-8 JSON representation with the digest field omitted. Sort object keys recursively. Retain array order.

Check in one fixture with canonical bytes and expected digest.

`exportedAt` is metadata and can differ between exports.

An ordinary encode/decode round trip must preserve stored CollaborativeText snapshots and incremental updates byte-for-byte. Separate but state-equivalent engines do not require equal JSON text or equal Yjs byte encoding.

### 9.8 Required Step 6 verification

Verify at least these cases:

- a realistic imported engine round trips semantically;
- CollaborativeText and operation-update bytes survive a round trip exactly;
- advertised VersionTokens remain stable for the same Version after Save/Open;
- stored CommandId retry remains idempotent after Save/Open;
- checkpoints and their VersionTokens survive;
- current state comes from exactly one stored revision snapshot;
- unknown identifiers and unsupported newer versions fail;
- truncated or duplicate-key JSON fails;
- unknown properties fail;
- invalid base64 and oversized values fail;
- malformed trees and duplicate or orphan InlineContent records fail;
- duplicate or conflicting CommandIds fail;
- identity reuse, broken revision links, and unknown contributors fail;
- a depth-1,000 document round trips through flat wire tables;
- malformed Yjs updates and schema-invalid inline content fail;
- replayed operations, checkpoint equality, restore targets, reserved IDs, and affected targets agree with stored snapshots;
- payload or digest changes are detected as corruption;
- stale serialization produces no artifact;
- failed open does not replace the active engine;
- caller mutation of input bytes after open starts cannot affect the candidate; and
- every successful version-1 encode is accepted by the version-1 decoder.

Markdown is not a recovery format. A later durable provenance or replicated-History capability needs an explicit compatibility decision and, when required, a format-version change.

## 10. Step 7 — Read-only domain laboratory

Create a deliberately plain browser UI.

Welcome actions:

- New blank document;
- Import Markdown;
- Open native document; and
- Open bundled sample.

Workspace capabilities:

- continuous Block rendering;
- subtree disclosure;
- selected Block indication;
- selected lens indication;
- import diagnostics; and
- a development-only domain inspector for the current tree, InlineContents, text summaries, tags, and Version.

All workspace and inspector data comes from engine queries. Subscribe to change notifications as invalidation hints. Re-query the projection after a change.

Retain the VersionToken that arrived with each displayed projection. Any later edit derived from that projection uses that token as its expected base.

Render selected InlineContent read-only through the Step 3 semantic projection.

Use the rendering precedence in `PRODUCT_DOMAIN_MODEL.md`. Flatten transparent grouping Blocks in the outline. Derive outline labels from the same selected InlineContent used in the manuscript. Do not add a separate title field.

## 11. Step 8 — Structural editing

Wire all durable UI actions through `DocumentEngine.execute`.

When the UI creates an InlineContent, obtain empty CollaborativeText from the Step 3 kernel and submit it in the atomic `CreateInlineContent` operation.

Support:

- create the root's first child Block;
- create sibling;
- create child;
- move up and down;
- indent and outdent;
- drag/reorder only after button and keyboard behavior works;
- delete, with recovery through Version History restore;
- edit Block tags;
- create, delete, select, and reorder InlineContents;
- edit InlineContent tags; and
- change `childrenPresentation`.

Keep one explicit current selection. Preserve predictable focus after structural operations.

Block and InlineContent selection is transient UI state. Selection does not create a Contribution or Version.

Verify keyboard-only creation and movement, focus after changes, cycle-safe drag targets, direct-child presentation behavior, selection stability, recoverable failed commits, and absence of direct React mutation of revisioned state.

## 12. Step 9 — Interactive InlineContent editing

Use the trusted `editor-content` engine query for the selected current InlineContent. It returns detached CollaborativeText bytes and the VersionToken observed in the same read.

Editing requires the materialized `version` to equal `observedAt`.

Create a fresh Y.Doc from the returned value. Attach one Tiptap/ProseMirror editor owner. Local Y.Doc changes are not canonical until submitted through `DocumentEngine.execute` against the observed token.

Historical content remains read-only until the user restores it.

Implement:

- one active Tiptap editor owner at a time;
- read-only rendering for all other contents;
- the Step 3 inline marks;
- safe paste;
- validated content-scoped Yjs updates through the engine;
- derived sanitized HTML for preview or export; and
- attributed text commits in product History.

Do not reintroduce the preserved `bodyHtml + yjsState` contract. Lists remain Block structure.

Verify editor ownership transfer, identity preservation across Block moves, native rich-text round trip, historical restoration, derived-only HTML, sanitized paste, and recoverable transition failures.

## 13. Step 10 — Lenses, comparison, and Markdown export

Implement lenses as application queries over an explicit selected Version.

Initial lenses:

- default/main content; and
- summary content selected through the application-owned `view:summary` tag.

Version selection and lens selection are separate transient state.

Use these deterministic rules:

- default/main selects the first `view:main` InlineContent, else the first InlineContent in vector order;
- summary selects the first `view:summary` InlineContent, else default/main;
- several matches select the first in vector order and produce a projection diagnostic;
- zero contents gives no own rendered content; and
- initial lenses preserve the complete Block tree and do not reparent or omit Blocks.

Compare historical and live material by explicit VersionTokens. Align Blocks by `BlockId`. Display unmatched subtrees explicitly. Do not guess correspondence.

A checkpoint Version is an ordinary exact Version for projection and comparison.

Implement Markdown rendering in this step. It accepts an explicit VersionToken and optional lens and subtree selection. It queries through the engine and returns Markdown text or bytes plus stable loss diagnostics.

Support the same structural and inline subset that the importer supports. Report unsupported tags, overlays, or presentation. Do not claim losslessness.

The renderer has no file or clipboard API. The UX handles transport.

## 14. Step 11 — Browser durability

Define a browser-storage transport around opaque portable artifacts and local document descriptors.

Implement:

- an in-memory repository for tests and fallback;
- an IndexedDB repository;
- local document listing;
- autosave after committed Contributions;
- opaque portable Save/Open through the engine API; and
- recovery when browser storage is unavailable or corrupt.

IndexedDB is an application convenience. It is not the portable format and not a second engine repository. Store bytes returned by `serializePortableDocument`. Reopen them through the engine factory. Do not parse private session records in the repository adapter.

Repository saves carry the VersionToken last loaded from the local record. Compare that expected token and write the new artifact plus new token in one transaction. A mismatch is a persistence conflict. Do not silently overwrite another tab's work.

The UX tracks dirty state by equality comparison between the current engine token and the last successfully saved token.

Verify save/reload/open, document isolation, failed-save reporting, competing writers, explicit overwrite intent, corrupt-record handling, lossless export recovery within limits, and History checkpoint survival after reload.

## 15. Step 12 — Provenance, comments, and discussions prototype

Formatting and provenance can share a logical range shape:

```text
RangeAnnotation<T>
  start anchor
  end anchor
  value
```

Formatting remains a derived view over canonical ProseMirror/Yjs marks. Do not create a duplicate persisted formatting table.

Prototype:

- an attributed post-genesis contributor-registration effect for AI or automation identities before they author durable material;
- sparse provenance anchors with Yjs relative positions;
- author-colored provenance rendering;
- explicit insertion attribution;
- copy/paste derivation policy;
- split, merge, delete, and undo behavior;
- comments targeted to a Block, InlineContent, or anchored InlineContent range; and
- durable conversations with explicit semantic targets.

Do not finalize the native provenance representation before measuring dense attribution size and realistic editing behavior.

Any durable Step 12 record requires an explicit Step 6 format-compatibility decision. Do not add fields silently to format version 1.

Extend browser-storage schema and contract tests in the same change so native export, IndexedDB reload, History materialization, and restore preserve the new records.

Verify contributor registration order, insertion attribution, copy derivation, range deletion/restoration, anchor co-versioning with CollaborativeText, overlay separation from manuscript Blocks, and durable round trips.

## 16. Step 13 — Persistence and packaging decision evidence

Use Step 13 to choose infrastructure from measurements. Do not use it to regain parity with the preserved application.

Before SQL, require measured evidence for:

- document size;
- Contribution and Version growth;
- historical materialization latency;
- query needs;
- attachment size;
- compaction needs; and
- atomicity that the browser/native archive approach cannot provide adequately.

Before Tauri or another native shell, require a browser application that already satisfies the MVP vertical slice and a concrete native-only need.

A native shell must wrap the validated application. It must not define the document engine.

Storage snapshots, deltas, structural sharing, indexes, caches, and compaction stay behind the engine boundary. Do not call physical persistence snapshots semantic checkpoints.

Before networked collaboration, use `COLLABORATION_MODEL.md` as the baseline. Require an in-process two-engine replication harness and the causal, convergence, identity, authorization, resource-limit, catch-up, and outbox properties defined there.

The first pragmatic network phase may coordinate structural proposals through a relay while it replicates text updates. Do not rebase immutable Contributions. Fully offline structural editing needs a proven replicated-tree algorithm.

## 17. Selective reuse from the preserved branch

Treat every preserved item as code or evidence to inspect. It is not current authority.

### 17.1 Copy or adapt early

| Reference path | Intended reuse |
|---|---|
| `src/domain/ids.ts` | Stable ID generation. Review API and naming first. |
| `src/domain/json.ts` | Generic JSON cloning and comparison helpers. |
| `src/domain/tags.ts` and tests | Tag normalization, limits, and case-insensitive identity. |
| `src/editor/sanitizeRichText.ts` and tests | Sanitization policy and hostile-input cases. |
| `src/editor/yjsEncoding.ts` | Base64 and update helpers only. Adapt to embedded CollaborativeText. |
| `src/application/serializedTaskQueue.ts` and tests | Generic serialization behavior when still needed. |
| `assets/app-icon.svg` | Visual asset. |
| `LICENSE` | Project license. |
| `THIRD_PARTY_NOTICES.md` | Initial notice inventory. Update it for new dependencies. |

Copy only after the destination module and its tests exist. Prefer the smallest useful function to a whole directory.

### 17.2 Port behavior and tests, not structure

| Reference path | Preserve |
|---|---|
| `src/domain/tree.ts` and tests | Move, order, cycle, and delete invariants. Restore now belongs to History. |
| `src/domain/visibleNodes.ts` and tests | Deterministic visible-tree projection. |
| `src/persistence/memoryGateway.ts` and tests | Atomic commit, detached History, and compensating restore behavior. |
| `src/application/workspaceProjection.ts` and tests | Explicit live versus historical state. |
| `src/application/draftTransition.ts` and tests | Freeze, flush, and retry behavior. |
| `src/editor/bodyCheckpointPolicy.ts` and coordinator tests | Semantic text-grouping evidence. The old checkpoint name is not the new semantic Checkpoint. |
| `src/application/historyProjection.ts` and tests | Human-readable grouping behavior, not old node targeting. |
| `src/components/DocumentCanvasInteractions.test.tsx` | Keyboard and focus expectations. |
| `src/components/DocumentCanvasEditorOwnership.test.tsx` | Single-editor ownership expectations. |

Rewrite old tests in current vocabulary. Do not introduce `DocumentNode`, title/body separation, old gateways, or host capability types only to make old tests compile.

### 17.3 Documentation evidence

| Reference path | Use |
|---|---|
| `docs/PRODUCT_DOMAIN_MODEL.md` | Historical rationale. Current authority is the local `main` copy. |
| `docs/DOCUMENT_FORMAT.md` | History, restore, and hash lessons. It is not the new format. |
| `docs/PERSISTENCE_DESIGN.md` | Gateway and atomicity lessons. It is not the new architecture. |
| `docs/SECURITY.md` | Untrusted rich-text/file and offline constraints. |
| `docs/TESTING.md` | Data-loss, recovery, transition, and platform test ideas. |
| `docs/KNOWN_LIMITATIONS.md` | Failure modes to avoid. |
| `docs/proposals/BODY_CHECKPOINT_STRATEGY.md` | Historical text-grouping experiments. It is not semantic checkpoint authority. |
| `docs/proposals/QUERY_FIRST_HISTORY.md` | Non-mutating History and query semantics. |
| `docs/proposals/CONTINUOUS_BLOCK_OUTLINE.md` | Continuous workspace interaction lessons. |

When preserved documentation describes version-1 behavior, cite the reference branch explicitly.

### 17.4 Do not carry into the clean scaffold

Do not initially copy:

- `src/domain/types.ts`;
- `src/domain/hash.ts` or format-version-1 hash fixtures;
- `src/App.tsx`;
- `src/application/useDocumentController.ts`;
- `src/components/NodeBlock.tsx`;
- `src/components/NodeMetadataFields.tsx`;
- the old `DocumentCanvas.tsx` implementation;
- `src/persistence/gateway.ts`;
- Tauri gateways and file-dialog code;
- `src/main-tauri.tsx`;
- any `src-tauri/` code or assets;
- the SQLite schema;
- the old package manifest or lockfile;
- `LOCAL_FIRST_TREE_EDITOR_PLAN.md` as an active roadmap; or
- the old AI proposal interface based on `nodeId + proposedHtml`.

These items encode the experimental host, storage, or title-plus-body ontology. Inspect their behavior only when a corresponding clean-slate capability is designed.

## 18. Test strategy

Prefer tests at the lowest meaningful boundary:

1. pure domain invariant tests;
2. headless CollaborativeText schema and update tests;
3. operation, History, and checkpoint tests;
4. Markdown planning fixtures;
5. native-format round-trip and hostile-input tests;
6. repository adapter contracts;
7. editor integration tests with real Yjs state;
8. component interaction and accessibility tests; and
9. a small browser end-to-end suite for import, edit, checkpoint, reload, History, and export.

Every feature that can hide, replace, move, checkpoint, restore, export, or close active content must include a data-loss or stale-state failure test when the risk applies.

Every importer must test hostile, malformed, oversized, and unsupported input.

Every persisted schema change must update:

- the native format version or an explicit compatibility decision;
- fixtures;
- validation;
- round-trip tests;
- History materialization; and
- recovery documentation.

Do not use test-count targets. Require behavior and risk coverage.

## 19. Technical decision gates

### 19.1 Before interactive rich editing

Do not attach Tiptap editor ownership until the Block kernel, CollaborativeText kernel, History, Markdown importer, native codec, and read-only workspace are usable.

### 19.2 Before final provenance storage

Run experiments with:

- long documents;
- frequent contributor changes;
- overlapping formatting and provenance;
- concurrent insertion boundaries;
- paragraph and Block splits;
- copy/paste between InlineContents;
- deletion and restore; and
- native export/import.

### 19.3 Before SQL

Use the measured evidence in Section 16. Do not adopt SQL because the preserved experiment used it.

### 19.4 Before a native shell

Require a working browser MVP and a concrete native-only need. The shell wraps the validated application.

### 19.5 Before networked collaboration

Apply the full preconditions in `COLLABORATION_MODEL.md`. The local linear ledger, local revision sequence, full snapshots, and one-Y.Doc-per-InlineContent layout are private MVP choices. Do not promote them to distributed-system contracts without an explicit decision.
