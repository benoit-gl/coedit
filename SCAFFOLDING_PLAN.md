# Coedit clean-slate scaffolding plan

**Target branch:** `main`

**Read-only reference branch:** `tauri-experimental-orphan`

**Reference tip when this plan was written:** `f63ce8f59547dc0d84b5f086301ddaf4ee20a89b`

## 1. Purpose and working agreement

This document is the implementation guide for rebuilding Coedit from a clean browser-first foundation. It records the intended order of work, the minimum domain decisions needed to begin, the evidence to reuse from the preserved implementation, and the conditions that must be met before native packaging or a permanent database is reconsidered.

The complete experimental implementation and its documentation remain available at the tip of `tauri-experimental-orphan`. That branch is evidence and a selective source of reusable utilities; it is not the base of the new implementation.

All new work must occur on `main` or branches created from `main`. Do not commit, rebase, merge into, reset, or otherwise alter `tauri-experimental-orphan`.

Before doing any work, verify:

```powershell
git branch --show-current
git status --short
git rev-parse tauri-experimental-orphan
```

The first command must report `main` or a branch descended from the orphan `main`. The reference branch command should resolve successfully.

Inspect a preserved file without checking out the branch:

```powershell
git show tauri-experimental-orphan:docs/PRODUCT_DOMAIN_MODEL.md
```

Copy a deliberately selected file into the new branch without changing the reference branch:

```powershell
git restore --source=f63ce8f59547dc0d84b5f086301ddaf4ee20a89b -- docs/PRODUCT_DOMAIN_MODEL.md
```

Never merge or cherry-pick the preserved implementation wholesale. Every copied file must be reviewed against the new domain model before it is committed.

Generated directories left in a local working tree, such as `node_modules/`, `dist/`, and `*.tsbuildinfo`, are not source inputs. The new scaffold must ignore them immediately.

## 2. Product objective

The first objective is not a packaged desktop application. It is a durable browser-based domain laboratory in which realistic structured documents can be imported, edited, inspected, viewed historically, restored, exported, and reopened.

The first meaningful vertical slice must allow a user to:

1. import a realistic Markdown document;
2. see the resulting Block tree and import diagnostics;
3. edit headings, prose, and list items;
4. create, move, nest, reorder, and delete Blocks;
5. add an optional second BlockContent, such as a summary;
6. switch content-selection lenses;
7. inspect a previous revision read-only;
8. restore that revision as a new revision;
9. reload the browser without losing the document;
10. export a lossless native file; and
11. reimport that file with the same document state and History.

Native packaging, SQLite, AI providers, real-time networking, attachments, and production provenance storage are outside this first vertical slice.

## 3. Domain decisions that scaffolding must preserve

The authoritative discussion is `docs/PRODUCT_DOMAIN_MODEL.md` on `tauri-experimental-orphan`. Copy that document into the new branch during Step 1 below.

The minimum logical model is:

```text
DocumentSession
  documentId
  currentRevisionId
  contributors[]
  contributions[]
  revisions[]

RevisionedDocument
  root: Block
  conversations[]  (introduced in Step 12)
  comments[]       (introduced in Step 12)

AggregateSnapshot
  document: RevisionedDocument
  inlineContents: Map<BlockContentId, InlineContentSnapshot>

Block
  id: BlockId
  tags: TagSet
  childrenPresentation: ChildrenPresentation
  contents: BlockContent[]
  children: Block[]

BlockContent
  id: BlockContentId
  tags: TagSet

InlineContent identified by BlockContentId
  collaborative text
  formatting marks (logical range annotations)
  provenance range annotations (introduced in Step 12)
```

`BlockContent` is the sole semantic owner of its inline value. Its `BlockContentId` also keys the corresponding InlineContent snapshot; there is no second `InlineContentId` and no independently mutable content reference. This prevents two contents from accidentally sharing one editable value while retaining stable identity when their owning Block moves.

Required invariants:

1. There is one recursive `Block` type.
2. Every document has exactly one real root Block. The root cannot be moved or deleted.
3. Every non-root Block has exactly one parent, and every Block and BlockContent ID is unique within its entity kind.
4. Every BlockContent belongs to exactly one Block and owns exactly one InlineContent keyed by its BlockContentId.
5. `Idea`, `Heading`, `Body`, `Paragraph`, and `Leaf` are not persisted entity types.
6. Root-title, heading, prose, and list-item presentation is inferred from structural context and the incoming child presentation.
7. A rendered section heading and its outline label normally use the same selected BlockContent.
8. `childrenPresentation` belongs to the parent and describes its direct children.
9. A contentless Block is a transparent grouping container: it emits no heading or prose of its own, and its children render according to its `childrenPresentation`.
10. A Block may contain zero, one, or several BlockContents. Several are supported but never mandatory.
11. BlockContent has no mandatory form, stage, or role enum.
12. Block and BlockContent tags use the same normalization rules but have independent ownership.
13. Application-owned tag namespaces express product conventions such as `view:summary`.
14. Blocks and BlockContents do not initially carry `createdAt`, `updatedAt`, `deletedAt`, or tombstone fields. Contributions and revision snapshots record lifecycle and recovery.
15. Deleting a Block or BlockContent removes it from the live revisioned state. Earlier snapshots retain it.
16. Earlier working and accepted states normally live in History rather than parallel live content records.
17. Acceptance is revision-oriented by default.
18. Historical viewing is detached and read-only.
19. Restoring a revision appends a compensating revision and never rewinds or deletes History.
20. Formatting and provenance share a generic range mechanism but have different insertion and copy semantics.
21. Inline-content state and any anchors into it must be snapshotted together.
22. Initial import and editing attribution is contribution-level. Fine-grained range provenance is not claimed until the later provenance prototype defines it.
23. Until named lens rules arrive, the default projection selects the first BlockContent in vector order. Zero contents means no own rendered content; tags do not alter this fallback implicitly.

The initial rendering precedence is explicit:

1. selected content on the root renders as the document title;
2. selected content on a child of `sections` renders as a section heading;
3. selected content on a child of `flow` renders as body flow;
4. selected content on a child of `bullets` or `numbers` renders as a list item; and
5. a contentless Block is transparent and only groups its children.

Topology still matters: a contentful Block may introduce a subtree, and its own `childrenPresentation` controls the next level. Incoming presentation determines how the Block itself renders. This also permits an empty section: a terminal child of a `sections` parent remains a heading even before it gains body children.

A non-root Block with no BlockContents is always a grouping Block. An authored-but-empty section or list item therefore owns one empty BlockContent. A childless Block retains its `childrenPresentation`, but the value is dormant until children are added.

An initial child-presentation vocabulary is:

```ts
type ChildrenPresentation =
  | "sections"
  | "flow"
  | "bullets"
  | "numbers";
```

Do not add more values until an importer fixture or an observed editing workflow requires one.

## 4. Architectural constraints

### Browser first

The only initial runtime target is a normal browser application.

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

Do not initially add:

- Tauri;
- Rust;
- SQLite;
- multiple frontend entry points;
- host capability variants;
- filesystem plugins;
- outbound network providers;
- a service worker or PWA packaging;
- a monorepo package graph; or
- compatibility adapters for the version-1 `DocumentNode` model.

### One implementation of domain behavior

Tree validation, operation application, tag normalization, revision semantics, import rules, hashing, and native serialization must each have one implementation in TypeScript.

A future native shell may provide packaging and file access. It should not automatically become a second implementation of the domain.

### One canonical rich-text representation

Do not persist independently authoritative HTML and Yjs state.

The canonical InlineContent representation should be Yjs/ProseMirror state. Rendered HTML is derived for display, and any later presentation export derives from the same state. A cache is permissible only if it is explicitly disposable or verifiably derived.

### Commands from the beginning

The UI must not mutate domain state directly. Every durable change passes through a typed command/operation and produces an attributed contribution.

React state may own transient UI concerns such as selection, disclosure, focus, open panels, and the active lens.

## 5. Intended source layout

Start with a single application:

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
    model.ts
    schema.ts
    yjsInlineContent.ts
    readModel.ts
    annotations.ts

  serialization/
    nativeFormat.ts
    markdownImport.ts

  storage/
    repository.ts
    memoryRepository.ts
    indexedDbRepository.ts

  application/
    DocumentSession.ts
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

This is a routing guide, not a reason to create empty files in advance. Add a file when the corresponding behavior is implemented.

Do not split the code into separate packages until an actual independent consumer exists.

## 6. Ordered scaffolding work

Each step must end in a usable, tested state. Avoid implementing later-step infrastructure speculatively.

### Step 0 — Establish the clean repository baseline

Create:

- `.gitignore`;
- a concise `README.md` pointing to this plan and the domain model;
- `LICENSE`;
- `package.json`;
- TypeScript/Vite/Vitest configuration; and
- the smallest page that proves development, test, and production builds.

The ignore file must include at least:

```text
node_modules/
dist/
*.tsbuildinfo
coverage/
.vite/
```

Pin the package manager and dependency versions when the scaffold is created. Do not copy the preserved lockfile because it includes Tauri and the obsolete application dependency graph.

Exit criteria:

- development server renders one page;
- production build succeeds;
- one trivial test succeeds;
- the build performs no outbound runtime requests; and
- the working tree contains no generated tracked files.

Suggested commit boundary:

```text
build: establish browser-only clean-slate scaffold
```

### Step 1 — Bring forward the product decisions

Create `docs/` and selectively copy the decision snapshot from the recorded reference commit:

```powershell
git restore --source=f63ce8f59547dc0d84b5f086301ddaf4ee20a89b -- docs/PRODUCT_DOMAIN_MODEL.md
```

The branch name is convenient for browsing, but the recorded commit makes the rebuild reproducible if that name later moves.

Recontextualize the copied document on `main`. Add a clearly marked clean-slate note near its beginning stating that:

- references to the "current implementation" mean the preserved implementation at `tauri-experimental-orphan`;
- the preserved `DocumentNode` format-version-1 schema, Tauri, and SQLite are historical evidence rather than current clean-slate behavior;
- this scaffolding plan resolves the initial implementation questions needed for Steps 2–6; and
- unresolved longer-term questions in the snapshot remain open unless this plan explicitly resolves them.

Do not rewrite the snapshot to pretend those historical observations were made about the new branch.

Add a short `docs/README.md` that distinguishes:

- current clean-slate behavior;
- intended domain direction; and
- read-only legacy evidence on `tauri-experimental-orphan`.

The documentation index must link to this plan as the executable order and to `PRODUCT_DOMAIN_MODEL.md` as the directional ontology. Do not copy the old Architecture, Frontend Design, Persistence Design, or Document Format as current documentation. They describe the preserved implementation.

Exit criteria:

- the new README and documentation index identify this plan as the work order;
- the domain model is available on `main`;
- every reference to current versus preserved behavior is unambiguous;
- no documentation claims that Tauri, SQLite, or the preserved `DocumentNode` format is current clean-slate behavior; and
- the copied snapshot points readers to the concrete initial resolutions in Section 3 of this plan.

Suggested commit boundary:

```text
docs: establish clean-slate domain and implementation direction
```

### Step 2 — Implement the pure Block domain

Implement:

- branded, non-confusable IDs;
- `TagSet` normalization using the preserved behavior as the initial contract;
- `Block`, `BlockContent`, and the structural portion of `RevisionedDocument`;
- child-presentation values;
- tree validation;
- vector-based sibling order;
- typed structural operations; and
- a pure operation reducer/materializer.

All persisted IDs use canonical lowercase UUID-v4 text at the wire boundary and distinct branded TypeScript types in memory. Production generation uses Web Crypto; tests inject valid deterministic UUID sequences. There is no timestamp/random-number fallback.

The initial tag contract is NFKC normalization, trim, internal-whitespace collapse, case-insensitive identity, first-spelling preservation, removal of empty values, rejection of control characters, at most 20 tags per owner, and limits of 64 Unicode code points and 256 UTF-8 bytes per tag. Block and BlockContent tags pass through the same functions but remain separate arrays.

The initial live-domain limits are 50,000 Blocks, 50,000 BlockContents, and Block depth 1,000 including the root. Validation and projection walk the tree iteratively so a hostile but in-limit document cannot overflow the JavaScript call stack. These limits also bound every native snapshot in Step 6.

Use these structural contracts:

```ts
interface RevisionedDocument {
  readonly root: Block;
}

interface Block {
  readonly id: BlockId;
  readonly tags: readonly string[];
  readonly childrenPresentation: ChildrenPresentation;
  readonly contents: readonly BlockContent[];
  readonly children: readonly Block[];
}

interface BlockContent {
  readonly id: BlockContentId;
  readonly tags: readonly string[];
}
```

The content value owned by a BlockContent is supplied by Step 3. The structural reducer works with its stable identity without depending on Yjs.

The first structural operation vocabulary is exact:

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
      readonly kind: "CreateBlockContent";
      readonly blockId: BlockId;
      readonly blockContentId: BlockContentId;
      readonly index: number;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "MoveBlockContent";
      readonly blockContentId: BlockContentId;
      readonly index: number;
    }
  | { readonly kind: "DeleteBlockContent"; readonly blockContentId: BlockContentId }
  | { readonly kind: "SetBlockTags"; readonly blockId: BlockId; readonly tags: readonly string[] }
  | {
      readonly kind: "SetBlockContentTags";
      readonly blockContentId: BlockContentId;
      readonly tags: readonly string[];
    }
  | {
      readonly kind: "SetChildrenPresentation";
      readonly blockId: BlockId;
      readonly value: ChildrenPresentation;
    };
```

Operation payload and application rules are part of the contract:

- `CreateBlock` supplies a new Block ID, destination parent ID, insertion index, initial tags, and initial `childrenPresentation`; its content and child arrays begin empty.
- `MoveBlock` supplies the Block ID, destination parent ID, and insertion index measured after removing the Block from its old siblings.
- `DeleteBlock` removes the selected Block and its complete subtree from the live structure. It cannot target the root.
- `CreateBlockContent` supplies the owner Block ID, new BlockContent ID, insertion index, and initial tags. Its inline value is initially empty.
- `MoveBlockContent` reorders a content value within its existing owner; cross-Block transfer and copy semantics are deferred.
- `DeleteBlockContent` removes that identity from the live structure; Step 3 removes its InlineContent from the live aggregate while History retains earlier snapshots.
- the two tag operations replace, normalize, and validate the complete tag array rather than applying implicit merges;
- `SetChildrenPresentation` accepts only the four initial values; and
- indices are integers in the inclusive range `0..length`. Invalid indices are rejected rather than clamped.

An operation group is applied sequentially, and each operation sees the result of the previous operation in that group. Every reducer is immutable: it returns a new detached structure or a typed `DomainError`, never a partial mutation. Empty groups and operations that make no change are rejected. IDs and clocks are injected at the command/session boundary; reducers never generate either.

There is deliberately no `RestoreBlock`, `SetInlineContentReference`, entity tombstone, or entity timestamp. Whole-revision restoration is defined in Step 4. A later application command may recover a selected subtree from a historical snapshot by emitting ordinary create operations, but that is not a primitive ambiguity in the structural reducer.

Required tests:

- exactly one root is required and it cannot be moved or deleted;
- duplicate IDs are rejected;
- cycles are rejected;
- no Block is owned by two parents;
- no BlockContent is owned by two Blocks;
- sibling and content order follow vector order exactly;
- invalid insertion indices are rejected without mutation;
- Block/count/depth limits are enforced at and just beyond every boundary;
- moving a subtree retains identity;
- moving into self or a descendant is rejected;
- deleting a subtree removes every descendant and owned BlockContent from the live structure;
- Block and BlockContent tag scopes do not leak into each other;
- adding content does not clone structural identity;
- child presentation is a parent property;
- contentless grouping Blocks validate; and
- every failed operation leaves its input deeply equal to the original.

Exit criteria:

- a realistic tree fixture can be built and modified entirely through operations;
- all domain functions are independent of React, Yjs, IndexedDB, and browser globals; and
- invalid state produces stable, actionable error codes and messages.

Suggested commit boundary:

```text
feat(domain): add recursive Block model and operations
```

### Step 3 — Implement the headless InlineContent kernel

Establish the canonical inline representation before History, import, or serialization depends on it.

Initially use one `Y.Doc` per InlineContent, with one fixed `Y.XmlFragment` named `prosemirror`. A BlockContent exclusively owns that document through their shared `BlockContentId`. Moving a Block preserves the same InlineContent; copying content creates a new BlockContent, a new Y.Doc, and new CRDT identities.

This per-content boundary is deliberate for the first browser laboratory: updates are naturally scoped, deletion and validation are explicit, and no document-wide collaboration topology is assumed prematurely. Reconsider it only after measurements demonstrate a need for cross-content Yjs transactions or one synchronization channel.

The immutable domain snapshot is:

```ts
interface InlineContentSnapshot {
  readonly schemaVersion: 1;
  readonly encoding: "yjs-update-v1";
  readonly state: Uint8Array;
}

interface AggregateSnapshot {
  readonly document: RevisionedDocument;
  readonly inlineContents: ReadonlyMap<BlockContentId, InlineContentSnapshot>;
}
```

`state` is a complete Yjs update sufficient to reconstruct that InlineContent in a fresh detached Y.Doc. Snapshot constructors take private ownership by copying the map, every entry, and every mutable `Uint8Array`; accessors return detached copies rather than the backing `ReadonlyMap` or bytes. State vectors and incremental updates are not snapshots. JSON/base64 is an interchange concern introduced later.

Define one inline-only schema:

- nodes named `doc`, `text`, and `hardBreak`, where `doc` contains only zero or more `text`/`hardBreak` inline nodes and the other nodes have no attributes;
- marks named `bold`, `italic`, `underline`, `strikethrough`, `inlineCode`, and `link`, where only `link` has one attribute named `href`;
- no authored headings, paragraphs, lists, images, tables, arbitrary attributes, or other nodes/marks; and
- explicit safe links: `http`, `https`, `mailto`, same-document fragments, and relative references; control characters and every other explicit scheme are rejected by the content kernel.

Use one normalized seed/projection boundary:

```ts
type InlineMark =
  | { readonly kind: "bold" | "italic" | "underline" | "strikethrough" | "inlineCode" }
  | { readonly kind: "link"; readonly href: string };

type InlineAtom =
  | { readonly kind: "text"; readonly text: string; readonly marks: readonly InlineMark[] }
  | { readonly kind: "hardBreak" };

type InlineSeed = readonly InlineAtom[];
```

Normalization removes empty text runs, coalesces adjacent runs with identical marks, rejects duplicate marks, validates link destinations, and stores marks in a fixed order. This normalized projection—not Yjs client IDs or encoded byte order—is the semantic equality boundary.

Font family and size changes are deferred until an observed authoring workflow justifies a durable mark vocabulary. Empty InlineContent is valid. Rendered HTML and plain text are derived views and are never persisted as parallel authorities.

ProseMirror marks are the initial persistence of logical Formatting ranges; do not maintain a duplicate formatting-annotation table. The later provenance work may reuse the same domain-level range-resolution and decoration APIs without assuming that dense provenance must use identical CRDT storage.

Provide headless functions to:

- create empty content or content from a validated `InlineSeed`;
- decode a full snapshot into a fresh Y.Doc;
- project content to a small immutable inline tree/run representation for testing and rendering;
- apply a Yjs update to a detached candidate and validate the resulting schema and limits;
- encode a new full snapshot; and
- coordinate `CreateBlockContent` and `DeleteBlockContent` so the live BlockContent IDs and InlineContent map have exact one-to-one correspondence.

Extend `DocumentOperation` with two content operations:

```ts
type InlineContentOperation =
  | {
      readonly kind: "InitializeInlineContent";
      readonly blockContentId: BlockContentId;
      readonly seed: InlineSeed;
    }
  | {
      readonly kind: "ApplyInlineContentUpdate";
      readonly blockContentId: BlockContentId;
      readonly update: Uint8Array;
    };

type DocumentOperation = StructuralOperation | InlineContentOperation;
```

`InitializeInlineContent` supplies a validated InlineSeed and may target only a BlockContent created earlier in the same operation group. `ApplyInlineContentUpdate` supplies the target BlockContentId and an incremental Yjs update; it applies that update only to the detached per-content Y.Doc, validates the complete result, and stores a new full snapshot. Deleting a Block or BlockContent removes every corresponding InlineContent from the candidate live map.

Creating a BlockContent always creates its empty Y.Doc. Omit `InitializeInlineContent` for an empty seed, reject repeated initialization in one group, and reject every Yjs document containing a top-level shared type other than the one `prosemirror` fragment.

Start with centralized content limits: 8 MiB for an incoming incremental update or encoded full snapshot, 2,000,000 decoded Yjs structs, 1,000,000 Unicode code points, 250,000 projected atoms, at most six marks on one text atom, and 2,048 Unicode code points or 8 KiB of UTF-8 in one link destination. Validate both before and after applying an update to the detached candidate.

The module must have no React, Tiptap UI, DOM, HTML-parser, or browser-storage dependency. Markdown import will construct `InlineSeed` values directly rather than round-tripping through HTML.

Initial attribution is contribution-level: an inline mutation identifies its affected BlockContent, and the enclosing History contribution identifies its contributor. Yjs transaction origins are not durable provenance. Do not add range-provenance marks or side tables at this step.

Required tests:

- empty, marked, linked, and hard-break seeds round trip semantically;
- full snapshot decoding produces a detached Y.Doc;
- malformed updates and schema-invalid content are rejected without changing the base;
- hidden shared types, repeated initialization, and all over-limit boundaries are rejected;
- an update for one InlineContent cannot affect another;
- production Yjs byte equality is not required, but projected inline equality is;
- moving a Block preserves BlockContent identity and projected inline state;
- deleting a BlockContent removes it from the live aggregate; and
- creating or deleting structure and InlineContent rolls back together when either half fails.

Exit criteria:

- realistic headings, paragraphs, and list-item labels can be represented without HTML;
- a complete aggregate snapshot contains exact canonical state for every live BlockContent; and
- later History and import work need no placeholder content representation.

Suggested commit boundary:

```text
feat(content): add headless Yjs InlineContent kernel
```

### Step 4 — Establish first-class in-memory History

Partition History from revisioned state:

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
  readonly tags: readonly string[];
  readonly snapshot: AggregateSnapshot;
}

interface Contribution {
  readonly id: ContributionId;
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
    | { readonly kind: "restore"; readonly targetRevisionId: RevisionId }
    | { readonly kind: "acceptCurrent" };
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedBlockContentIds: readonly BlockContentId[];
  readonly sessionId?: SessionId;
  readonly summary?: string;
}

interface ContributionContext {
  readonly contributorId: ContributorId;
  readonly sessionId?: SessionId;
  readonly summary?: string;
}

interface MaterializedRevision {
  readonly revisionId: RevisionId;
  readonly sequence: number;
  readonly tags: readonly string[];
  readonly snapshot: AggregateSnapshot;
}

interface ImportSourceMetadata {
  readonly sourceName: string | null;
  readonly mediaType: "text/markdown";
  readonly byteLength: number;
  readonly sha256: string;
}
```

A DocumentSession owns five things:

1. an append-only contributor catalog;
2. an append-only contribution ledger;
3. append-only revision records;
4. one moving head-revision pointer; and
5. no durable UI state.

`createDocumentSession(genesis, dependencies)` requires at least one validated initial Contributor and creates the document ID, permanent empty root (`tags=[]`, `contents=[]`, `children=[]`, `childrenPresentation="flow"`), contributor catalog, and genesis revision atomically. Contributor IDs must be unique; display names are trimmed, control-character-free text limited to 128 Unicode code points and 512 UTF-8 bytes; kinds are closed to the four listed values; and conflicting duplicate records are rejected. Genesis is the only bootstrap path allowed to register a contributor without attribution. Adding contributors after genesis is deferred until a concrete AI/collaboration workflow defines an attributed catalog operation; code must not silently invent them.

Snapshots contain the revisioned Block tree, all live BlockContents, the complete InlineContent snapshot map, and later revisioned comments/conversations. Snapshots do not recursively contain the ledger, revision records, contributor catalog, or head pointer.

Revision sequence zero is a genesis snapshot containing the permanent empty root and has no Contribution. Every later revision has exactly one Contribution, and every Contribution has exactly one resulting revision. History is initially linear; a new revision's parent is the head that was current when the commit began.

Implement:

```ts
interface CommitRequest {
  readonly expectedHeadRevisionId: RevisionId;
  readonly effect:
    | { readonly kind: "operations"; readonly operations: readonly DocumentOperation[] }
    | {
        readonly kind: "importMarkdown";
        readonly operations: readonly DocumentOperation[];
        readonly source: ImportSourceMetadata;
      };
  readonly context: ContributionContext;
}

interface RestoreRequest {
  readonly expectedHeadRevisionId: RevisionId;
  readonly targetRevisionId: RevisionId;
  readonly context: ContributionContext;
}

interface AcceptCurrentRequest {
  readonly expectedHeadRevisionId: RevisionId;
  readonly context: ContributionContext;
}

interface DocumentSession {
  commit(request: CommitRequest): Promise<Result<RevisionRecord, CommitError>>;
  current(): MaterializedRevision;
  materialize(revisionId: RevisionId): Result<MaterializedRevision, UnknownRevision>;
  restore(request: RestoreRequest): Promise<Result<RevisionRecord, RestoreError>>;
  acceptCurrent(request: AcceptCurrentRequest): Promise<Result<RevisionRecord, CommitError>>;
}
```

Commits are serialized internally. The expected-head check occurs inside that serialization boundary; a stale request returns `RevisionConflict` and is never silently rebased. Operations inside either commit effect apply sequentially to one detached candidate aggregate, structural and InlineContent validation run on the complete candidate, and only total success appends one Contribution and one revision. `importMarkdown` differs only by carrying durable source metadata; it does not bypass ordinary operations. Every mutable binary operation payload is copied on commit and when read back from the ledger. `affectedBlockIds` and `affectedBlockContentIds` are derived by the session, never supplied or trusted from callers; cascading deletion includes the removed subtree and all owned contents, import includes all created targets, restore includes the union of live targets in the base and target snapshots, and acceptance affects neither array. Two concurrent requests against the same head yield exactly one success.

ID generation and the clock are injected. `committedAt` is canonical RFC 3339 UTC with exactly millisecond precision (`YYYY-MM-DDTHH:mm:ss.sssZ`). Contributor identity must already exist in the session catalog and is never silently substituted. While applying a group, the candidate reservation set contains all historically reserved IDs plus every ID created earlier in that group. A successful create reserves its Block or BlockContent ID for the document's lifetime—even if a later operation deletes it in the same group—so an identity cannot subsequently be reused for a different entity. Failed groups reserve nothing.

Restore semantics are exact. Restoring target `T` while the current head is `H`:

1. verifies that `H` is still the expected head and that `T` belongs to this session;
2. validates a detached clone of `T`'s complete snapshot;
3. appends a restore Contribution with base `H` and target `T`;
4. appends a new revision whose parent is `H` and whose snapshot material is equal to `T`; and
5. advances the head to that new revision.

Restore is whole-aggregate replacement, not a merge, rewind, or operation replay. Material added after `T` disappears from the new live projection, while every revision, Contribution, and contributor remains. Restoring the current head is rejected; restoring an older revision that happens to have equal material still records the historically meaningful restore.

Revision tags use the Step 2 normalization contract but have independent revision ownership. Acceptance is revision-oriented and attributed. `acceptCurrent` rejects a head already tagged as accepted; otherwise it appends an `acceptCurrent` Contribution and a child revision with snapshot material equal to the previous head and the revision tag `workflow:accepted`, then advances the head. Other new revisions begin with an empty tag array. The latest accepted projection is the greatest-sequence revision carrying it. Accepting historical material requires restoring it first, then accepting the restored head. This avoids a mutable pointer or BlockContent stage field.

`current()` and `materialize()` return detached read-only materializations: no mutable array, map, object, or Y.Doc is shared with the live session.

Use full snapshots initially. This is a deliberate simplicity choice, not the final retention design. Do not yet add SQL-style paging, semantic text checkpoint grouping, snapshot compaction, retention policies, branching History, or UI-specific History rows.

Required tests:

- genesis has sequence zero, the permanent root, and no Contribution;
- one successful non-empty operation group appends exactly one Contribution and revision;
- a failed group appends neither and reserves no IDs;
- deleting an entity does not make its ID reusable;
- stale commit and restore requests mutate nothing;
- two concurrent same-base commits produce one success and one conflict;
- every historical materialization is exact, detached, and read-only;
- structural and Yjs changes commit or roll back atomically;
- missing contributor identity fails;
- timestamps and affected-target arrays are session-derived and canonical;
- restore creates a child of the pre-restore head with snapshot material equal to the target;
- restore preserves the target, intervening revisions, ledger, and contributor catalog; and
- deleting content and then restoring an earlier revision recovers its original IDs and InlineContent state;
- accepting current state creates one attributed, content-identical revision tagged `workflow:accepted`; and
- later edits do not mutate or move the earlier accepted revision.

Exit criteria:

- structural and inline operations can be committed, viewed historically, and restored entirely in memory; and
- History behavior is proven without React, IndexedDB, file APIs, or a persistence adapter.

Suggested commit boundary:

```text
feat(history): add attributed snapshots and compensating restore
```

### Step 5 — Implement structured Markdown import

Use `unified` with `remark-parse` and `remark-gfm` for an explicit CommonMark-plus-GFM input dialect. Do not parse structural Markdown with regular expressions.

Separate pure planning from session mutation:

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

`sourceName` is a display basename only; file pickers must not pass or persist an absolute/local path. The planner never reads or mutates a DocumentSession. It creates one Contributor of kind `imported` (display name derived deterministically from the source name, or `Markdown import` when unnamed) and fills `sourceMetadata` with the source name, raw byte length, `text/markdown` media type, and lowercase SHA-256 of the original input bytes. A separate application service receives the current human Contributor, creates the genesis session with both current and imported contributors, then commits the complete operation group with the `importMarkdown` effect attributed to the imported contributor. The initial importer creates a new session; it does not merge into or replace an already-open document. The application swaps to the new session only after planning and commit both succeed.

Production IDs remain random. Determinism means that identical input with the same injected ID sequence and limits produces structurally equal operations, projected InlineContent, and diagnostics; it does not require unrelated production imports or re-encoded Yjs bytes to match.

If parsing yields no manuscript AST nodes, return `empty-markdown` before allocating IDs or creating a session. A user who wants an empty document uses New blank document; Markdown import never creates a metadata-only revision or an empty operation group.

Use this heading algorithm:

1. Always create one real root.
2. Consume an H1 as root content only when it is the first AST child after BOM and blank-line handling. Otherwise the root remains contentless and every H1 is an ordinary top-level section.
3. When the first H1 becomes the title, treat the root as heading depth 1 for skipped-level diagnostics. Otherwise treat it as depth 0. Every later H1 attaches directly to the root.
4. For every other heading, pop the heading stack to the nearest open heading with a lower depth and attach the new section there, or to the root when none exists.
5. A skipped level creates no synthetic heading. Attach to the nearest lower heading and emit `heading-level-skipped`.
6. An empty heading creates one empty BlockContent so it remains a semantic section rather than becoming a transparent group.
7. A source filename is import metadata, never fabricated manuscript text.

For each root or section, collect body nodes and subsection nodes separately, then normalize them as follows:

- body nodes become direct children under `flow`;
- when subsections exist, put them in one transparent contentless grouping Block whose `childrenPresentation` is `sections`;
- the owning root/section uses `flow` when it has body material, with the subsection group following that body;
- an owner with subsections and no body may use `sections` directly without an extra wrapper; and
- source order is preserved within body material and within subsections.

This rule makes paragraphs, lists, and subsections coexist without pretending that one heterogeneous sibling list is simultaneously `flow` and `sections`.

Map supported nodes exactly:

```text
paragraph                 -> terminal Block with one BlockContent
unordered list            -> transparent grouping Block with bullets children
ordered list              -> transparent grouping Block with numbers children
list item first paragraph -> the list-item BlockContent
remaining item material   -> flow children of that list-item
nested list               -> transparent group among those flow children
text / hard break         -> InlineSeed text / hard break
CommonMark soft break     -> one ordinary space
emphasis / strong         -> italic / bold mark
delete / inline code      -> strikethrough / inline-code mark
link                      -> safe link mark; unsafe links use literal-source fallback
```

A list item without a leading paragraph receives one empty BlockContent. An ordered-list start other than one is normalized to one and emits a diagnostic until start-number semantics are represented explicitly. GFM task markers are preserved as literal `[ ]` or `[x]` prefixes with a diagnostic rather than hidden metadata.

Use one universal source-preserving fallback for unsupported Markdown nodes: preserve the node's exact normalized source slice as literal plain InlineContent in a terminal Block, attach the reserved content tag `import:markdown-literal`, and emit a source-positioned warning naming the lost presentation. "Normalized source" means UTF-8 decoded text after BOM removal and CRLF/CR conversion to LF; original byte offsets and line-ending style are not retained. Initially use this for fenced/indented code blocks, tables, block quotes, images, raw HTML, thematic breaks, and unknown block constructs. Unsupported inline nodes and unsafe links become literal source runs with the same warning policy, preserving both label and destination syntax. Never interpret raw HTML. If an unsupported node lacks usable source offsets, reject the import rather than discard it.

Diagnostics have stable fields and stable source order:

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

The initial diagnostic-code vocabulary includes `heading-level-skipped`, `ordered-list-start-normalized`, `task-marker-literalized`, `unsafe-link-removed`, `unsupported-node-literalized`, and `unsupported-node-without-source`. New codes are added with fixtures; user-facing prose is not used as a machine identifier.

Start with named, centrally tested limits: 10 MiB of UTF-8 source, 200,000 Markdown AST nodes, 50,000 generated Blocks, nesting depth 100, 1,000,000 Unicode code points in one InlineContent, and 255 Unicode code points/1 KiB UTF-8 for a control-character-free source name. Decode UTF-8 with fatal error handling and an optional BOM, normalize line endings for parsing, and retain offsets into that normalized source. Invalid UTF-8 or any exceeded limit is an error and creates no session.

Every created BlockContent is listed among the affected targets of the import contribution, so all imported text is attributable at contribution level. Do not claim that Markdown import has created range provenance.

Initial fixtures must cover:

- a conventional essay;
- an empty/whitespace-only file that is rejected as `empty-markdown`;
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
- inline/raw HTML; and
- invalid UTF-8, malformed, or unusually large input.

For each fixture, store either the expected operation/projection shape and diagnostics or the expected rejection. Include at least one golden fixture containing introductory paragraphs, a list, and subsections beneath the same heading to prove the grouping rule.

Exit criteria:

- every fixture produces a valid Block tree or a clear rejection;
- diagnostics explain every normalization and literal fallback;
- no source node is silently discarded;
- import is deterministic under injected dependencies;
- all created text is attributable to the single import contribution; and
- no React component or file picker is required to verify the result.

Suggested commit boundary:

```text
feat(import): map Markdown ASTs to attributed Block trees
```

### Step 6 — Define the lossless native interchange format

Define the native format only after the Markdown fixtures have exercised the actual Block, InlineContent, and History shape. The format serializes that implemented model; it does not speculate about later provenance or persistence internals.

Use one versioned JSON envelope containing:

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

Do not store a duplicate "current aggregate." The current state is the snapshot of `currentRevisionId`.

Keep the in-memory model recursive but normalize each snapshot on the wire so valid deep documents do not violate JSON nesting limits:

```text
rootBlockId
blocks[]:
  id, parentId|null, siblingIndex, tags, childrenPresentation, blockContentIds[]
blockContents[]:
  id, tags
inlineContents[]
```

`blocks` are ordered parent-before-child with siblings in vector order; `blockContentIds` retain content vector order; and `blockContents` follow first ownership appearance. `parentId`, `siblingIndex`, and the flat arrays are only a lossless serialization of the recursive tree, not additional domain facts. Decoding reconstructs and validates exactly one root matching `rootBlockId`, contiguous sibling indices, unique ownership, and the original recursive order.

Every `inlineContents` entry maps one live BlockContentId to:

```text
schemaVersion: 1
encoding: "yjs-update-v1"
state: standard padded base64 of the complete Yjs update
```

JSON/base64 is only the interchange encoding; the in-memory domain continues to use bytes.

Wire rules are explicit:

- branded IDs are JSON strings validated by their entity-specific parser;
- revision snapshots use the flat Block/BlockContent tables above rather than recursive JSON;
- each InlineContent map is encoded as an array of `{ blockContentId, snapshot }` entries sorted lexicographically by ID for canonical output;
- every operation is an object with its exact Step 2/3 discriminator and payload;
- InlineSeed uses the atom/mark JSON vocabulary from Step 3;
- timestamps use the Step 4 canonical UTC syntax and import hashes use exactly 64 lowercase hexadecimal SHA-256 characters;
- optional properties are omitted rather than changed silently between `null` and missing; and
- snapshot bytes and every incremental Yjs update inside a Contribution operation use standard padded base64.

No binary operation payload is silently dropped merely because full revision snapshots also exist. Decoders copy decoded bytes before constructing domain values.

Keep transport separate from encoding:

```ts
function encodeNativeDocument(session: DocumentSession): Promise<string>;
function decodeNativeDocument(
  input: string,
): Promise<Result<ValidatedDocumentSession, NativeFormatError>>;
```

Both functions receive or import the same reviewed asynchronous SHA-256 adapter so tests can run without file APIs and hashing behavior is not duplicated.

Treat input as hostile. Parse into untrusted values and validate, in this order:

1. input byte/depth/collection limits;
2. duplicate-key-free JSON, envelope identifier, exact supported version, allowed properties, and safe-integer numeric fields;
3. base64 shape and decoded-size limits;
4. the corruption checksum over the still-untrusted payload;
5. revision sequence, parent links, current pointer, and the one-to-one relationship between every non-genesis revision and its Contribution;
6. contributor references, stable identity continuity across snapshots, and absence of ID reuse for a different entity;
7. every Block invariant and exact BlockContent-to-InlineContent ownership; and
8. every decoded InlineContent schema and limit.

After shape validation, verify History semantically from genesis in sequence order. Reapply `operations` and `importMarkdown` effects to their parent snapshot and compare the normalized Block structure and InlineContent projections with the stored resulting snapshot. Verify a `restore` snapshot equals its declared target. Verify an `acceptCurrent` snapshot equals its parent and its resulting RevisionRecord has exactly the `workflow:accepted` tag. Recompute affected-target arrays and the document-lifetime reserved-ID set rather than trusting serialized claims. Any mismatch is an integrity error.

Start with centralized native limits: 64 MiB of UTF-8 JSON, JSON nesting depth 128, 5,000 revisions, 5,000 Contributions, 250,000 operations in one Contribution, 1,000,000 operations in the archive, 50,000 Blocks and 50,000 BlockContents in any snapshot, 8 MiB for one decoded InlineContent update, and 48 MiB of decoded binary data across the archive. Validate the raw byte limit before JSON parsing and use iterative bounded validation after parsing. Limits are format-reader policy rather than semantic document fields and may be raised deliberately with tests.

Use SHA-256 as a corruption checksum, not as proof of authenticity. Compute it over a documented canonical UTF-8 JSON representation of the envelope payload with the digest field omitted; object keys are sorted recursively, array order is retained, and one checked-in fixture provides the canonical bytes and expected digest. A malicious party able to rewrite both payload and digest is not detected, and the UI must not claim otherwise.

`exportedAt` is metadata and may differ between exports. Round-trip equivalence means equal IDs, tree, tags, projected inline documents, contributor/Contribution data, every historical materialization, and restore behavior—not identical JSON text or Yjs bytes after re-encoding.

Required tests:

- a realistic imported session round trips with the semantic equivalence above;
- current state is derived from exactly one stored revision snapshot;
- unknown identifiers and unsupported newer versions fail explicitly;
- truncated or duplicate-key JSON, unknown properties, invalid base64, oversized values, malformed trees, identity reuse, broken revision links, and unknown contributors are rejected;
- malformed Yjs updates and schema-invalid inline nodes/marks are rejected;
- operation replay, restore targets, acceptance tags, reserved IDs, and affected-target arrays must agree with every stored snapshot;
- changing payload or digest is detected as corruption;
- failed decoding does not replace the current application session; and
- decoding and validation require no React, IndexedDB, DOM, or file API.

Do not call Markdown a recovery format. Native JSON is the initial lossless recovery/interchange format for capabilities implemented through Step 5. Adding range provenance or another later durable capability requires an explicit compatibility decision and, when necessary, a format-version change.

Exit criteria:

- native fixtures load without UI or browser storage;
- an exported session reimports with equivalent current and historical materializations; and
- the format has one explicit version, one canonical checksum procedure, and no speculative migration framework.

Suggested commit boundary:

```text
feat(format): add validated lossless native JSON format
```

### Step 7 — Build the read-only domain laboratory

Create a deliberately plain UI with:

Welcome:

- New blank document;
- Import Markdown;
- Open native document; and
- Open bundled sample.

Workspace:

- continuous Block rendering;
- disclosure for subtrees;
- selected Block indication;
- selected lens indication;
- import diagnostics; and
- a development-only domain inspector showing the current tree, BlockContents, tags, and revision.

At this step the renderer may display InlineContent read-only.

The renderer must implement the precedence and transparent-group rules from Section 3. The outline/navigation projection flattens contentless grouping Blocks and derives labels from the same selected BlockContent used in the document. Do not introduce a separate title field.

Exit criteria:

- a user can drag or choose a Markdown file and immediately inspect the resulting document;
- realistic sample documents render without manually creating toy nodes;
- the raw domain inspector agrees with the visual structure; and
- invalid documents fail visibly rather than partially rendering.

Suggested commit boundary:

```text
feat(ui): add importable read-only Block workspace
```

### Step 8 — Add structural editing

Wire UI actions to the Step 2 operations through `DocumentSession`.

Support:

- create the root's first child Block;
- create sibling;
- create child;
- move up/down;
- indent/outdent;
- drag/reorder only after button/keyboard semantics work;
- delete, with recovery through whole-revision History restore;
- edit Block tags;
- create/delete/select BlockContent;
- edit BlockContent tags; and
- change `childrenPresentation`.

Preserve one explicit current selection and predictable focus after structural operations.

Required interaction tests:

- keyboard-only creation and movement;
- focus after create/move/delete;
- no cyclic drag target;
- child presentation affects direct children only;
- selection survives unrelated renders;
- failed commits retain editable state and expose retry; and
- no React component mutates the aggregate directly.

Exit criteria:

- an imported document can be substantially reorganized;
- every structural action appears in History; and
- historical materializations reflect the exact prior tree.

Suggested commit boundary:

```text
feat(ui): add operation-backed structural editing
```

### Step 9 — Integrate interactive InlineContent editing

For the selected BlockContent, materialize a fresh live Y.Doc from the current Step 3 snapshot and attach Tiptap/ProseMirror to it. This step adds interactive ownership and transitions; it does not introduce another content representation. Moving a Block changes only the semantic tree and retains the same BlockContent identity and canonical state.

Implement:

- one active Tiptap editor owner at a time;
- read-only rendering for all other contents;
- light inline formatting;
- safe paste;
- validated, content-scoped Yjs updates through DocumentSession;
- derivation of sanitized HTML for preview/export; and
- attributed text commits into product History.

Do not copy the old `bodyHtml + yjsState` contract.

Formatting includes only inline marks at this stage. Lists remain Block structure.

Required tests:

- editor ownership transfer does not lose text;
- a Block move does not recreate its InlineContent;
- native export/import preserves Yjs content;
- historical snapshots restore matching content state;
- HTML is derived rather than trusted as a second source;
- plain-text and rich-text paste are sanitized; and
- forced transition failures retain a recoverable draft.

Exit criteria:

- headings, prose, and list items can be edited in place;
- text changes are attributable revisions;
- native export/import and History restore retain exact rich text; and
- only one content instance owns active editor machinery.

Suggested commit boundary:

```text
feat(editor): add Yjs-backed InlineContent editing
```

### Step 10 — Add lenses and optional simultaneous contents

Implement lenses as application-level queries over a selected revision.

Initial lenses:

- default/main content;
- summary content selected by an application-owned tag;
- accepted historical revision;
- live/current revision; and
- accepted-versus-live comparison.

Lens selection is transient UI state. Do not persist it unless a later named-lens feature is deliberately designed.

Selection rules are deterministic:

- default/main selects the first content tagged `view:main`, otherwise the first content in vector order;
- summary selects the first content tagged `view:summary`, otherwise falls back to that Block's default/main selection;
- several matches select the first in vector order and produce a projection diagnostic;
- zero contents produces no own rendered content;
- initial lenses retain the complete structural tree and never reparent or omit a Block implicitly;
- accepted selects the greatest-sequence revision tagged `workflow:accepted` by Step 4, and is unavailable when none exists; and
- accepted-versus-live aligns matching Blocks by BlockId and displays unmatched subtrees explicitly rather than guessing correspondence.

Exit criteria:

- most documents still use one BlockContent;
- a summary is optional rather than schema-mandated;
- final/draft comparison uses historical materialization rather than cloned live state; and
- changing lenses creates no document mutation.

Suggested commit boundary:

```text
feat(lenses): project optional contents and historical comparisons
```

### Step 11 — Add browser durability

Define a repository port around complete sessions/documents, then implement:

- an in-memory repository for tests and fallback;
- an IndexedDB repository for ordinary browser use;
- local document listing;
- autosave after committed revisions;
- explicit native JSON import/export; and
- recovery behavior when browser storage is unavailable or corrupt.

IndexedDB is an application convenience, not the portable file format.

Repository saves carry the previously loaded head RevisionId. The IndexedDB adapter checks that expected head and writes the complete updated session plus new head in one transaction; a mismatch reports a persistence conflict instead of overwriting another tab's work. It does not reimplement or replay domain operations.

Required tests:

- create/save/reload/open;
- two local documents remain isolated;
- failed save does not claim success;
- two writers from the same loaded head cannot silently overwrite one another;
- imported native files do not overwrite another document without explicit intent;
- corrupt records fail safely;
- native export remains sufficient recovery when IndexedDB is unavailable; and
- History survives reload.

Exit criteria:

- browser reload no longer loses work;
- documents can be reopened from a local list;
- lossless files can move between browser profiles/computers; and
- the UI has no native-host dependency.

Suggested commit boundary:

```text
feat(storage): add IndexedDB durability and browser recovery
```

### Step 12 — Prototype provenance, comments, and discussions

Formatting and provenance share:

```text
RangeAnnotation<T>
  start anchor
  end anchor
  value
```

For Formatting, `RangeAnnotation<Formatting>` is a derived read-model view over the canonical ProseMirror/Yjs marks introduced in Step 3; it is not a second persisted formatting table. Provenance may require new durable anchor data. Their mutation policies remain distinct even when projection and decoration code is shared.

Prototype:

- an attributed post-genesis contributor-registration effect for AI or automation identities before they author durable material;
- sparse range anchors using Yjs relative positions;
- author-colored provenance rendering;
- explicit insertion attribution;
- copy/paste derivation;
- behavior under split/merge/delete/undo;
- comments targeted to Block, BlockContent, or range; and
- durable conversations targeted to explicit semantic context.

Do not finalize the native provenance representation until dense-attribution size and realistic editing behavior have been measured. Persisting provenance, comments, or conversations requires an explicit Step 6 format-compatibility decision; do not silently add fields to version 1. Extend the Step 11 repository schema and contract tests in the same change so native export, IndexedDB reload, History materialization, and restore all preserve the new records.

Exit criteria:

- contributor coloring works on realistic documents;
- every non-genesis contributor has an explicit registration record before their first contribution;
- inserted text never inherits the previous author's identity accidentally;
- copied text follows a documented origin/derivation policy;
- range deletion and restoration behavior is explicit;
- snapshots carry anchors with the Yjs state they reference; and
- comments/discussions are overlays, not disguised manuscript Blocks; and
- native export/import and IndexedDB reload preserve every durable overlay introduced by this step.

Suggested commit boundary:

```text
feat(provenance): prototype attributed ranges and overlays
```

### Step 13 — Reassess persistence and packaging

Only after Steps 0–12 have produced realistic measurements should the project decide:

- whether SQLite is justified;
- whether the portable artifact should be SQLite, an archive, or another format;
- how History checkpoints/deltas/compaction should work;
- whether Tauri is useful for packaging or filesystem access;
- which platforms matter;
- whether any validation must be implemented outside TypeScript; and
- how attachments and large assets affect the artifact.

Do not resume native-host work merely to obtain parity with the preserved experiment. Choose it only when the validated product requires it.

## 7. Selective salvage guide

The reference branch must remain read-only. Treat every candidate below as code to inspect, test, and adapt—not as authority over the new model.

### Copy or adapt early

These are relatively generic:

| Reference path | Intended reuse |
|---|---|
| `src/domain/ids.ts` | Stable ID generation; review API/naming first |
| `src/domain/json.ts` | Generic JSON cloning/comparison helpers |
| `src/domain/tags.ts` and tests | Normalization, limits, case-insensitive identity |
| `src/editor/sanitizeRichText.ts` and tests | Sanitization policy and hostile-input cases |
| `src/editor/yjsEncoding.ts` | Base64/update helpers only; adapt them to the per-BlockContent snapshot contract |
| `src/application/serializedTaskQueue.ts` and tests | Generic serialization behavior if still needed |
| `assets/app-icon.svg` | Visual asset |
| `LICENSE` | Project license |
| `THIRD_PARTY_NOTICES.md` | Starting notice inventory; update for new dependencies |

Copy only after the destination module and tests exist. Prefer copying the smallest useful function rather than restoring an entire directory.

### Port behavior and tests, not implementation structure

| Reference path | Preserve |
|---|---|
| `src/domain/tree.ts` and tests | Move/order/cycle/delete invariants; restoration now belongs to History |
| `src/domain/visibleNodes.ts` and tests | Deterministic visible-tree projection |
| `src/persistence/memoryGateway.ts` and tests | Atomic commit, detached History, compensating restore |
| `src/application/workspaceProjection.ts` and tests | Explicit live versus historical state |
| `src/application/draftTransition.ts` and tests | Freeze/flush/retry behavior |
| `src/editor/bodyCheckpointPolicy.ts` and coordinator tests | Evidence about semantic text grouping; add only when needed |
| `src/application/historyProjection.ts` and tests | Human-readable grouping behavior, not old node targeting |
| `src/components/DocumentCanvasInteractions.test.tsx` | Keyboard and focus expectations |
| `src/components/DocumentCanvasEditorOwnership.test.tsx` | One-editor ownership expectations |

Rewrite these tests in the new vocabulary. Do not introduce `DocumentNode`, title/body separation, old gateways, or host capability types merely to make old tests compile.

### Documentation to inspect as evidence

| Reference path | Use |
|---|---|
| `docs/PRODUCT_DOMAIN_MODEL.md` | Authoritative target ontology and open questions |
| `docs/DOCUMENT_FORMAT.md` | Existing History/restore/hash lessons; not the new format |
| `docs/PERSISTENCE_DESIGN.md` | Gateway and atomicity lessons; not the new architecture |
| `docs/SECURITY.md` | Untrusted rich text/file and offline constraints |
| `docs/TESTING.md` | Data-loss, recovery, transition, and platform test ideas |
| `docs/KNOWN_LIMITATIONS.md` | Failure modes the clean slate should avoid |
| `docs/proposals/BODY_CHECKPOINT_STRATEGY.md` | Text checkpoint experiments |
| `docs/proposals/QUERY_FIRST_HISTORY.md` | Non-mutating History/query semantics |
| `docs/proposals/CONTINUOUS_BLOCK_OUTLINE.md` | Continuous workspace interaction lessons |

When a preserved document describes implemented version-1 behavior, cite the branch explicitly. Do not copy it into current documentation without rewriting its status and assumptions.

### Do not carry into the new scaffold

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

These encode the experimental host, storage, or title-plus-body ontology. Their behavior may be studied on the reference branch when a corresponding new capability is designed.

## 8. Testing strategy

Prefer tests at the lowest meaningful boundary:

1. pure domain invariant tests;
2. headless InlineContent schema/update tests;
3. operation/History tests;
4. Markdown planning fixtures;
5. native-format round-trip and hostile-input tests;
6. repository adapter contracts;
7. editor integration tests with real Yjs state;
8. component interaction/accessibility tests; and
9. a small browser end-to-end suite for import/edit/reload/history/export.

Every feature that can hide, replace, move, restore, export, or close active content must include a data-loss/failure test.

Every importer must include hostile, malformed, oversized, and unsupported-input tests.

Every persisted schema change must update:

- the native format version or explicit compatibility decision;
- fixtures;
- validation;
- round-trip tests;
- History materialization; and
- recovery documentation.

Avoid test-count targets. Require behavior and risk coverage.

## 9. Decision gates

### Gate A — Before interactive rich editing

Headless Yjs is deliberately introduced in Step 3 because History, import, and serialization require canonical content. Do not attach Tiptap or React editor ownership until the Block kernel, headless InlineContent, History, Markdown importer, native codec, and read-only workspace are all usable.

### Gate B — Before finalizing provenance storage

Require experiments covering:

- long documents;
- frequent contributor changes;
- overlapping formatting and provenance;
- concurrent insertion boundaries;
- paragraph/block splits;
- copy/paste between BlockContents;
- deletion and restore; and
- native export/import.

### Gate C — Before SQL

Require measured evidence for:

- document size;
- revision count and growth;
- historical materialization latency;
- query requirements;
- attachment size;
- compaction needs; and
- atomicity not adequately provided by the browser/native archive approach.

### Gate D — Before Tauri

Require a browser application that already satisfies the vertical slice and a concrete native-only need, such as packaging, filesystem integration, or platform capability that cannot be met acceptably in the browser.

Tauri must wrap the validated application rather than define it.

## 10. Completion definition for the scaffolding phase

The scaffolding phase is complete when:

- `main` contains a browser-only application;
- realistic Markdown documents can be imported with diagnostics;
- the recursive Block model is the only structural ontology;
- all durable edits use attributed operations;
- History can inspect and restore any stored revision;
- native JSON round trips current and historical state;
- IndexedDB provides reload durability;
- optional BlockContents and lenses can be exercised;
- one active Yjs-backed editor preserves exact content;
- tests cover loss, corruption, hostile import, and restoration;
- the current documentation describes only the clean-slate application;
- preserved implementation references explicitly name `tauri-experimental-orphan`; and
- no Tauri, Rust, or SQL dependency has been introduced without passing the relevant decision gate.

At that point the project has an experimental product foundation rather than a persistence demonstration, and later infrastructure choices can be made using observed behavior and measurements.
