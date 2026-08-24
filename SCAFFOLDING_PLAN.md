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
git restore --source=tauri-experimental-orphan -- docs/PRODUCT_DOMAIN_MODEL.md
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

The minimum model is:

```text
Document
  id
  revision
  root: Block
  contributors[]
  conversations[]
  comments[]

Block
  id: BlockId
  tags: TagSet
  childrenPresentation: ChildrenPresentation
  contents: BlockContent[]
  children: Block[]

BlockContent
  id: BlockContentId
  tags: TagSet
  inlineContentId: InlineContentId

InlineContent
  collaborative text
  formatting range annotations
  provenance range annotations
```

Required invariants:

1. There is one recursive `Block` type.
2. `Idea`, `Heading`, `Body`, `Paragraph`, and `Leaf` are not persisted entity types.
3. Heading, prose, and list-item presentation is inferred from topology and the incoming child presentation.
4. A rendered section heading and its outline label normally use the same selected BlockContent.
5. `childrenPresentation` belongs to the parent and describes its direct children.
6. A Block may contain zero, one, or several BlockContents. Several are supported but never mandatory.
7. BlockContent has no mandatory form, stage, or role enum.
8. Block and BlockContent tags use the same normalization rules but have independent ownership.
9. Application-owned tag namespaces express product conventions such as `view:summary`.
10. Earlier working and accepted states normally live in History rather than parallel live content records.
11. Acceptance is revision-oriented by default.
12. Historical viewing is detached and read-only.
13. Restore appends a compensating revision and never rewinds or deletes History.
14. Formatting and provenance share a generic range mechanism but have different insertion and copy semantics.
15. Inline-content state and any anchors into it must be snapshotted together.

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

The canonical InlineContent representation should be Yjs/ProseMirror state. Rendered HTML is derived for display and interchange export. A cache is permissible only if it is explicitly disposable or verifiably derived.

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
    yjsContentStore.ts
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

Create `docs/` and selectively copy:

```powershell
git restore --source=tauri-experimental-orphan -- docs/PRODUCT_DOMAIN_MODEL.md
```

Add a short `docs/README.md` that distinguishes:

- current clean-slate behavior;
- intended domain direction; and
- read-only legacy evidence on `tauri-experimental-orphan`.

Do not copy the old Architecture, Frontend Design, Persistence Design, or Document Format as current documentation. They describe the preserved implementation.

Exit criteria:

- the new README and documentation index identify this plan as the work order;
- the domain model is available on `main`; and
- no documentation claims that Tauri, SQLite, or format version 1 is current behavior.

Suggested commit boundary:

```text
docs: establish clean-slate domain and implementation direction
```

### Step 2 — Implement the pure Block domain

Implement:

- branded or otherwise non-confusable IDs;
- `TagSet` normalization;
- `Block`, `BlockContent`, and `Document`;
- child-presentation values;
- tree validation;
- deterministic sibling order;
- typed operations; and
- a pure operation reducer/materializer.

The first operation vocabulary should cover:

```text
CreateBlock
MoveBlock
DeleteBlock
RestoreBlock
CreateBlockContent
DeleteBlockContent
SetBlockTags
SetBlockContentTags
SetChildrenPresentation
SetInlineContentReference
```

Text editing may initially use a placeholder InlineContent reference. Do not block the domain kernel on editor integration.

Required tests:

- duplicate IDs are rejected;
- cycles are rejected;
- no Block is owned by two parents;
- sibling order is deterministic;
- moving a subtree retains identity;
- deleting/restoring a subtree has explicit semantics;
- Block and BlockContent tag scopes do not leak into each other;
- adding content does not clone structural identity; and
- child presentation is a parent property.

Exit criteria:

- a realistic tree fixture can be built and modified entirely through operations;
- all domain functions are independent of React, Yjs, IndexedDB, and browser globals; and
- invalid state produces actionable diagnostics.

Suggested commit boundary:

```text
feat(domain): add recursive Block model and operations
```

### Step 3 — Establish first-class in-memory History

Implement:

```ts
interface DocumentSession {
  commit(operations: readonly DocumentOperation[], context: ContributionContext): Promise<Revision>;
  current(): MaterializedDocument;
  materialize(revision: RevisionId): MaterializedDocument;
  restore(revision: RevisionId, context: ContributionContext): Promise<Revision>;
}
```

Use full snapshots initially. This is a deliberate simplicity choice, not the final retention design.

History must cover the complete aggregate, including structure, all BlockContents, tags, content references, contributors, and later comments/conversations.

Required tests:

- every successful commit advances revision exactly once;
- a failed operation commits nothing;
- a historical materialization is detached;
- historical reads mutate nothing;
- restore creates a new revision based on current state;
- restoring preserves the earlier and intervening revisions;
- contributor identity is required and never silently substituted; and
- a coordinated operation group is atomic.

Do not yet add:

- SQL-style paging;
- semantic text checkpoint grouping;
- snapshot compaction;
- retention policies; or
- UI-specific History rows.

Exit criteria:

- domain operations can be committed, viewed historically, and restored entirely in memory; and
- History behavior is proven without a UI or persistence adapter.

Suggested commit boundary:

```text
feat(history): add attributed revisions and compensating restore
```

### Step 4 — Define the lossless native interchange format

Create a versioned, validated JSON format before browser storage:

```text
format identifier
format version
export timestamp
current aggregate snapshot
canonical InlineContent/Yjs state
contributors
complete contribution ledger
revision snapshots
integrity metadata
```

Keep file transport separate from encoding:

```ts
encodeNativeDocument(session): Uint8Array | string
decodeNativeDocument(input): ValidatedDocumentSession
```

Treat input as hostile. Decode into untrusted values, validate limits and invariants, and only then create domain objects.

Required tests:

- encode/decode round trip preserves IDs, tree, contents, tags, revisions, attribution, and restore behavior;
- unknown format identifiers are rejected;
- newer versions fail safely and explicitly;
- malformed trees and tags are rejected;
- altered integrity metadata is detected;
- hostile rich text cannot execute; and
- a failed import leaves the current session unchanged.

Do not call Markdown a recovery format. Native JSON is the initial lossless recovery/interchange format.

Exit criteria:

- native fixtures can be loaded without React or IndexedDB;
- an exported session reimports with equivalent current and historical materializations; and
- the format has an explicit version but no speculative migration framework.

Suggested commit boundary:

```text
feat(format): add validated lossless native JSON format
```

### Step 5 — Implement structured Markdown import

Use a Markdown AST parser. Do not parse structural Markdown with regular expressions.

Initial mapping:

```text
first suitable H1       -> root Block content
other headings          -> non-terminal Blocks using a heading stack
paragraphs              -> terminal Blocks
unordered list          -> contentless grouping Block with Bullets children
ordered list            -> contentless grouping Block with Numbers children
list item               -> child Block
nested list             -> children of the containing list-item Block
emphasis/strong/link    -> formatting annotations
plain text              -> imported provenance
```

Heading-level jumps must follow a documented deterministic rule and emit a warning when structure is inferred.

The importer returns:

```ts
interface MarkdownImportResult {
  document: Document;
  diagnostics: readonly ImportDiagnostic[];
}
```

Each import must commit one attributed `ImportMarkdown` contribution or coordinated contribution group. Record source filename and an imported contributor/origin.

Initial fixtures must cover:

- a conventional essay;
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
- malformed or unusually large input.

Unsupported constructs must be preserved approximately or reported. Never silently discard source material.

Exit criteria:

- every fixture produces a valid Block tree or a clear rejection;
- diagnostics explain every lossy mapping;
- import is deterministic;
- imported text is attributed; and
- no UI is required to verify the result.

Suggested commit boundary:

```text
feat(import): map Markdown ASTs to attributed Block trees
```

### Step 6 — Build the read-only domain laboratory

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

The outline/navigation projection must derive labels from the same selected BlockContent used in the document. Do not introduce a separate title field.

Exit criteria:

- a user can drag or choose a Markdown file and immediately inspect the resulting document;
- realistic sample documents render without manually creating toy nodes;
- the raw domain inspector agrees with the visual structure; and
- invalid documents fail visibly rather than partially rendering.

Suggested commit boundary:

```text
feat(ui): add importable read-only Block workspace
```

### Step 7 — Add structural editing

Wire UI actions to the Step 2 operations through `DocumentSession`.

Support:

- create first Block;
- create sibling;
- create child;
- move up/down;
- indent/outdent;
- drag/reorder only after button/keyboard semantics work;
- delete/restore;
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

### Step 8 — Integrate canonical InlineContent editing

Use one document-scoped `Y.Doc` with stable content fragments keyed by `BlockContentId`, unless experiments prove that another ownership model is necessary.

Conceptually:

```text
Y.Doc
  content/<BlockContentId> -> Y.XmlFragment
```

Moving a Block changes the semantic tree while retaining the content ID and fragment identity.

Implement:

- one active Tiptap editor owner at a time;
- read-only rendering for all other contents;
- light inline formatting;
- safe paste;
- capture of canonical Yjs state;
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
- save/reload and history/restore retain exact rich text; and
- only one content instance owns active editor machinery.

Suggested commit boundary:

```text
feat(editor): add Yjs-backed InlineContent editing
```

### Step 9 — Add lenses and optional simultaneous contents

Implement lenses as application-level queries over a selected revision.

Initial lenses:

- default/main content;
- summary content selected by an application-owned tag;
- accepted historical revision;
- live/current revision; and
- accepted-versus-live comparison.

Lens selection is transient UI state. Do not persist it unless a later named-lens feature is deliberately designed.

Define deterministic behavior when:

- several contents match;
- no content matches;
- a summary is missing;
- a parent is omitted while a child matches; and
- historical and live trees differ.

Exit criteria:

- most documents still use one BlockContent;
- a summary is optional rather than schema-mandated;
- final/draft comparison uses historical materialization rather than cloned live state; and
- changing lenses creates no document mutation.

Suggested commit boundary:

```text
feat(lenses): project optional contents and historical comparisons
```

### Step 10 — Add browser durability

Define a repository port around complete sessions/documents, then implement:

- an in-memory repository for tests and fallback;
- an IndexedDB repository for ordinary browser use;
- local document listing;
- autosave after committed revisions;
- explicit native JSON import/export; and
- recovery behavior when browser storage is unavailable or corrupt.

IndexedDB is an application convenience, not the portable file format.

Required tests:

- create/save/reload/open;
- two local documents remain isolated;
- failed save does not claim success;
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

### Step 11 — Prototype provenance, comments, and discussions

Formatting and provenance share:

```text
RangeAnnotation<T>
  start anchor
  end anchor
  value
```

Their mutation policies remain distinct.

Prototype:

- sparse range anchors using Yjs relative positions;
- author-colored provenance rendering;
- explicit insertion attribution;
- copy/paste derivation;
- behavior under split/merge/delete/undo;
- comments targeted to Block, BlockContent, or range; and
- durable conversations targeted to explicit semantic context.

Do not finalize the native provenance representation until dense-attribution size and realistic editing behavior have been measured.

Exit criteria:

- contributor coloring works on realistic documents;
- inserted text never inherits the previous author's identity accidentally;
- copied text follows a documented origin/derivation policy;
- range deletion and restoration behavior is explicit;
- snapshots carry anchors with the Yjs state they reference; and
- comments/discussions are overlays, not disguised manuscript Blocks.

Suggested commit boundary:

```text
feat(provenance): prototype attributed ranges and overlays
```

### Step 12 — Reassess persistence and packaging

Only after Steps 0–11 have produced realistic measurements should the project decide:

- whether SQLite is justified;
- whether the portable artifact should be SQLite, an archive, or another format;
- how History checkpoints/deltas/compaction should work;
- whether Tauri is useful for packaging or filesystem access;
- which platforms matter;
- whether any validation must be implemented outside TypeScript; and
- how attachments and large assets affect the artifact.

Do not resume native work merely to obtain parity with the preserved experiment. Choose it only when the validated product requires it.

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
| `src/editor/yjsEncoding.ts` | Encoding helpers only; do not retain per-node ownership assumptions |
| `src/application/serializedTaskQueue.ts` and tests | Generic serialization behavior if still needed |
| `assets/app-icon.svg` | Visual asset |
| `LICENSE` | Project license |
| `THIRD_PARTY_NOTICES.md` | Starting notice inventory; update for new dependencies |

Copy only after the destination module and tests exist. Prefer copying the smallest useful function rather than restoring an entire directory.

### Port behavior and tests, not implementation structure

| Reference path | Preserve |
|---|---|
| `src/domain/tree.ts` and tests | Move/order/cycle/delete/restore invariants |
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
2. operation/History tests;
3. native-format and Markdown fixture tests;
4. repository adapter contracts;
5. editor integration tests with real Yjs state;
6. component interaction/accessibility tests; and
7. a small browser end-to-end suite for import/edit/reload/history/export.

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

### Gate A — Before rich editing

Do not integrate Tiptap/Yjs until the pure Block model, operations, History, native codec, Markdown importer, and read-only workspace are usable.

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
