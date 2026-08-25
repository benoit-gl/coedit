# MVP architecture

**Status:** Accepted clean-slate MVP direction.

This document is authoritative for component ownership and the public document-engine boundary. Product ontology belongs in [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md). Implementation order belongs in [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md). Markdown interchange and `.coedit` wire details belong in focused specifications. Post-MVP replication belongs in [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md).

The document engine is a logical backend. In the MVP it runs locally in the browser process. It does not need to be a server, worker, native process, or separate package.

## 1. MVP definition

The prototype has two principal components:

1. A headless document engine owns durable document state, validation, commands, queries, History, portable serialization, and change notification.
2. A browser UX renders query results, gathers edits, invokes engine commands, and handles browser capabilities and transient interaction state.

Markdown import/export, file transport, browser persistence, and future AI tools are adapters around this boundary. They are not alternate document authorities.

```text
Browser UX ------------------+
Markdown importer -----------|
Markdown renderer -----------+--> public engine API --> Document engine
Future AI tools -------------|                              |
Portable storage transport --+                      private representation
                                                   snapshots, deltas,
                                                   indexes, caches
```

The strict MVP can import Markdown, inspect and edit the Block tree and inline content, use lenses, inspect and restore History, create semantic Checkpoints, export Markdown, save/reopen `.coedit`, and survive browser reload.

Tauri, Rust, SQLite, AI providers, provenance, comments, durable discussions, multi-user networking, attachments, and final History compaction are not MVP requirements.

## 2. Responsibility boundary

### 2.1 Document engine

The engine owns:

- `Block`, `InlineContent`, canonical collaborative text, formatting ranges, and tags;
- document and History invariants;
- typed, attributed, version-checked, atomic command application;
- stable document, content, Contribution, and Version identities;
- current projections and exact historical materialization;
- lightweight History listing and semantic changeset summaries;
- semantic Checkpoint creation;
- compensating restore;
- validation and lossless `.coedit` serialization;
- change notifications after successful publication; and
- private choices about snapshots, deltas, CRDT updates, indexes, caching, compaction, and storage representation.

Every client-originated durable mutation enters through `execute`. No client receives a privileged persistence path.

### 2.2 Browser UX

The UX owns:

- rendering query results and diagnostics;
- selection, focus, disclosure, active lens, dialogs, and editor lifecycle;
- gathering and batching user intent;
- uncommitted editor drafts and composition state;
- semantic edit-group coordination;
- file pickers, downloads, clipboard access, and browser-storage interactions;
- obtaining a free-form human Contributor display name before new-session creation;
- deciding where an opaque `.coedit` artifact is transported; and
- tracking the Version most recently transported successfully.

The UX does not mutate returned domain objects, read a private ledger/archive, reconstruct History, parse `.coedit`, or apply raw replication state as durable truth.

### 2.3 Adapters

Adapters translate between an external concern and the engine:

- the Markdown importer plans ordinary typed operations;
- the Markdown renderer queries an explicit Version and emits Markdown plus diagnostics;
- file, clipboard, and IndexedDB adapters transport opaque `.coedit` artifacts; and
- a future AI adapter queries explicit Versions and submits attributed commands.

Authority, not deployment, defines the boundary.

## 3. Public engine behavior

The public API promises behavior rather than storage layout. It is asynchronous from the start.

The following TypeScript is illustrative. The semantic boundary is normative; exact names are not.

```ts
type VersionToken = string & { readonly __brand: "VersionToken" };

interface Versioned<T> {
  readonly documentId: DocumentId;
  readonly version: VersionToken;
  readonly observedAt: VersionToken;
  readonly value: T;
}

interface ContributionContext {
  readonly contributorId: ContributorId;
  readonly sessionId?: SessionId;
  readonly summary?: string;
}

interface CommandRequest {
  readonly commandId: CommandId;
  readonly expectedVersion: VersionToken;
  readonly command: DocumentCommand;
  readonly context: ContributionContext;
}

type DocumentCommand =
  | { readonly kind: "operations"; readonly operations: readonly DocumentOperation[] }
  | {
      readonly kind: "importMarkdown";
      readonly operations: readonly DocumentOperation[];
      readonly source: ImportSourceMetadata;
    }
  | { readonly kind: "checkpointCurrent" }
  | { readonly kind: "restore"; readonly target: VersionToken };

interface CommandReceipt {
  readonly commandId: CommandId;
  readonly contributionId: ContributionId;
  readonly resultingVersion: VersionToken;
}

interface DocumentEngine {
  execute(request: CommandRequest): Promise<Result<CommandReceipt, CommandError>>;
  currentVersion(): Promise<VersionToken>;
  query(request: DocumentQuery): Promise<Result<Versioned<DocumentProjection>, QueryError>>;
  listHistory(request: HistoryListQuery): Promise<Result<HistoryPage, QueryError>>;
  summarizeChanges(request: ChangesetQuery): Promise<Result<ChangesetSummary, QueryError>>;
  materialize(version: VersionToken): Promise<Result<Versioned<MaterializedDocument>, QueryError>>;
  serializePortableDocument(request: SerializeRequest): Promise<Result<PortableDocument, SerializationError>>;
  subscribe(listener: DocumentChangedListener): Unsubscribe;
}

interface DocumentEngineFactory {
  create(request: CreateDocumentRequest): Promise<Result<DocumentEngine, CreateError>>;
  openPortableDocument(input: PortableDocumentInput): Promise<Result<DocumentEngine, OpenError>>;
}

interface PortableDocument {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly suggestedExtension: ".coedit";
  readonly version: VersionToken;
}

interface SerializeRequest {
  readonly expectedVersion: VersionToken;
}

interface PortableDocumentInput {
  readonly bytes: Uint8Array;
  readonly mediaType?: string;
}
```

`PORTABLE_DOCUMENT_FORMAT.md` owns the exact wire contract. The UX treats `bytes` as opaque. No specific MIME type is part of the accepted MVP design yet.

## 4. Version and command contract

`VersionToken` is equality-comparable, document-scoped, opaque, and not orderable or decodable by clients.

An advertised VersionToken remains stable across a lossless `.coedit` Save/Open round trip.

Commands are typed, validated, attributed, atomic, and checked against an expected VersionToken.

Each successful command publishes one logical Contribution and one resulting Version. A failed command publishes nothing.

Command idempotency survives `.coedit` Save/Open. A successful `CommandId` exact retry returns the original receipt and emits no new Contribution or notification. Reuse of the same CommandId with different canonical request content is an error.

The implementation checks an existing successful CommandId before stale-base rejection.

## 5. Query and History contract

A query that returns document state returns both:

- the Version from which the value was materialized; and
- the current engine frontier at which the selector/policy was evaluated.

An edit derived from a current query uses the returned correlated token as its expected base. The UX must not issue a separate version read and assume it is atomic with the projection read.

Initial query behavior supports:

- current or exact document projection;
- outline projection;
- local document descriptor;
- one current editor-content projection;
- lens/subtree projection;
- exact historical materialization;
- paginated History summaries; and
- semantic changeset summaries.

Checkpoint Contributions are ordinary History entries with an exact resulting VersionToken.

Historical materialization is detached and read-only. Restore always enters through a new command against the current Version.

## 6. Editor-content boundary

The editor needs one detached, current InlineContent editing value that includes all canonical durable state required to edit that InlineContent.

Conceptually:

```ts
interface EditorContentValue {
  readonly inlineContentId: InlineContentId;
  readonly text: CollaborativeText;
  readonly formatting: readonly RangeAnnotation<Formatting>[];
}
```

The exact `TextAnchor` representation inside formatting ranges is intentionally unresolved until Step 0 closes.

The editor adapter can reconstruct transient ProseMirror/Tiptap/Yjs state from this value. Mutating that local state does not mutate engine state.

A durable text/formatting commit must pass through `execute` and preserve the accepted atomic text-plus-formatting contract.

Do not expose a live engine-owned Y.Doc or a formatting-only side channel.

## 7. Change notification contract

Notifications are invalidation hints, not an alternate state stream.

Conceptually:

```ts
interface DocumentChanged {
  readonly version: VersionToken;
  readonly origins: readonly ("local" | "remote")[];
  readonly causes: readonly ("edit" | "import" | "checkpoint" | "restore")[];
  readonly contributionIds: readonly ContributionId[];
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedInlineContentIds: readonly InlineContentId[];
}
```

The MVP need not emit `remote`. Implementations can coalesce notifications. Failed commands and exact idempotent retries emit none.

## 8. Required workflows

### Interactive editing

```text
UX holds transient editor state
  -> semantic edit-group boundary requires a durable capture
  -> UX submits one attributed command against observed VersionToken
  -> engine validates text + formatting atomically
  -> engine publishes one logical Contribution
  -> engine emits invalidation
  -> UX re-queries
```

A physical editor edit capture is not a semantic History Checkpoint.

If a commit fails, canonical state is unchanged and the UX retains recoverable transient work or presents an explicit retry/discard path.

### Semantic Checkpoint

```text
current VersionToken
  -> checkpointCurrent
  -> one Checkpoint Contribution
  -> one new content-identical Version
  -> one invalidation
```

### Markdown import

```text
Markdown bytes
  -> parser/planner
  -> diagnostics + ordinary operations
  -> candidate engine
  -> one atomic imported Contribution
  -> active session replaced only after success
```

`MARKDOWN_INTERCHANGE.md` owns detailed rules.

### Markdown export

```text
VersionToken + optional lens/subtree
  -> engine query/materialization
  -> Markdown renderer
  -> Markdown + diagnostics
  -> UX transports output
```

For imported/canonical Markdown-representable structures, export/re-import must satisfy the normalized Coedit round-trip invariant.

### `.coedit` Save and Open

```text
UX flushes required editor work
  -> supplies observed VersionToken
  -> engine verifies expected Version
  -> engine returns opaque .coedit bytes + metadata
  -> UX transports bytes
```

If the engine advanced before serialization begins, return `VersionConflict`.

Open validates into a candidate engine. Only a successful open replaces the active session.

### Browser durability

IndexedDB stores opaque `.coedit` artifacts and local descriptors. It does not parse private engine state.

## 9. Committed and transient state

Serialization and export observe committed engine state.

Before Save, export, navigation, restore, editor-owner transfer, or another operation that can invalidate active editor context, the UX must use the accepted controlled-transition policy: freeze, capture required work, drain required durable captures, then continue or expose a deliberate discard decision.

Selection, focus, disclosure, active lens, dialogs, presence, cursor state, retry UI, and unfinished input are transient unless a later feature explicitly makes them durable.

## 10. History representation is private

The public promise is:

> Every retained Contribution can be listed and summarized. Every advertised retained VersionToken can be materialized exactly and restored through the engine API.

A complete private snapshot per Contribution is acceptable for the MVP because it is simple to verify. It is not a public data type or long-term storage contract.

The engine can later use structural sharing, deltas, incremental CRDT updates, caches, indexes, or compaction if it preserves the public contract.

## 11. Compatibility with later consumers

A future AI tool queries an explicit Version and submits an attributed command. It has no privileged mutation path.

For collaboration, each UX talks to a local engine. Replication integrates remote work through private engine machinery and surfaces ordinary invalidation notifications.

Product Contributions remain distinct from CRDT transport updates. `COLLABORATION_MODEL.md` defines the later distributed constraints.

## 12. MVP architecture verification

The MVP must prove:

- core commands, queries, History, and serialization require no React, file API, or IndexedDB;
- interactive edits and Markdown import use the same validation, attribution, atomicity, and History boundary;
- text and formatting cannot publish in mismatched state;
- semantic Checkpoints publish one attributed Contribution and one content-identical Version;
- historical materialization is exact, detached, and read-only;
- editor-content values are detached and cannot mutate engine state;
- restore appends instead of rewinding;
- `.coedit` serialization checks its expected Version;
- a failed Save/Open does not claim success or replace the active engine;
- `.coedit` round trip preserves current and historical behavior and command idempotency;
- Markdown imported documents satisfy the export/re-import normalized equivalence property; and
- a different private History representation can pass the same public contract suite.

The strict MVP deliberately does not prove network convergence, provenance, comments, or AI collaboration.
