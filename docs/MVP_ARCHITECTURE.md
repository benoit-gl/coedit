# MVP architecture

**Status:** Accepted clean-slate MVP direction.

This document is authoritative for component ownership and the public document-engine boundary. Product ontology belongs in [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md). Implementation order belongs in [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md). Attributed text, Markdown interchange, `.coedit`, and browser persistence details belong in their focused specifications. Post-MVP replication belongs in [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md).

The document engine is a logical backend. In the MVP it runs locally in the browser process. It does not need to be a server, worker, native process, or separate package.

## 1. MVP definition

The prototype has two principal components:

1. A headless document engine owns durable document state, validation, commands, queries, History, portable serialization, and change notification.
2. A browser UX renders query results, gathers edits, invokes engine commands, and handles browser capabilities and transient interaction state.

Markdown import/export, file transport, the browser repository, clipboard handling, and future AI tools are adapters around this boundary. They are not alternate document authorities.

```text
Browser UX ------------------+
Markdown importer -----------|
Markdown renderer -----------+--> public engine API --> Document engine
Future AI tools -------------|                              |       |
Portable file transport -----+                    repository port  portable codec
                                                          |              |
                                                 memory / IndexedDB    .coedit bytes
```

The strict MVP can import Markdown, inspect and edit the Block tree and inline content, use lenses, inspect and restore History, create semantic Checkpoints, export Markdown, save/reopen `.coedit`, and survive browser reload.

Tauri, Rust, SQLite, AI providers, provenance visualization, comments, durable discussions, multi-user networking, attachments, signed claims, and final History compaction are not MVP requirements. Minimum protected Origin metadata is an MVP foundation even though a provenance product is not.

## 2. Responsibility boundary

### 2.1 Document engine

The engine owns:

- `Block`, `InlineContent`, canonical CollaborativeContent, intrinsic formatting, protected Origin, and tags;
- document and History invariants;
- typed, attributed, version-checked, atomic command application;
- stable document, content, Contribution, and Version identities;
- current projections and exact historical materialization;
- lightweight History listing and semantic changeset summaries;
- semantic Checkpoint creation;
- compensating restore;
- validation and lossless `.coedit` serialization;
- change notifications after successful publication;
- private choices about snapshots, deltas, CRDT updates, indexes, caching, compaction, and storage representation; and
- atomic publication through a supplied in-memory or durable repository port.

Every client-originated durable mutation enters through `execute`. No client receives a privileged persistence path.

### 2.2 Browser UX

The UX owns:

- rendering query results and diagnostics;
- selection, focus, disclosure, active lens, dialogs, and editor lifecycle;
- gathering and grouping user intent;
- uncommitted editor drafts and composition state;
- semantic edit-group presentation and controlled editor transitions;
- file pickers, downloads, clipboard access, and browser-storage interactions;
- obtaining a free-form human Contributor display name before new-session creation;
- deciding where an opaque `.coedit` artifact is transported;
- presenting repository durability, quota, persistence, conflict, retry, and backup status; and
- tracking the Version most recently transported successfully.

The UX does not mutate returned domain objects, read a private ledger/archive, reconstruct History, parse `.coedit`, or apply raw replication state as durable truth.

### 2.3 Adapters

Adapters translate between an external concern and the engine:

- the Markdown importer plans ordinary typed operations and imported Origin claims;
- the Markdown renderer queries an explicit Version and emits Markdown plus diagnostics;
- file adapters transport opaque `.coedit` artifacts;
- the browser repository persists private immutable engine records behind its port;
- clipboard adapters validate private Coedit fragments and sanitize ordinary HTML; and
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
  readonly semanticGroupId?: SemanticGroupId;
  readonly summary?: string;
}

interface CommandRequest {
  readonly commandId: CommandId;
  readonly expectedVersion: VersionToken;
  readonly command: DocumentCommand;
  readonly context: ContributionContext;
}

type DocumentCommand =
  | {
      readonly kind: "operations";
      readonly operations: readonly DocumentOperation[];
    }
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
  execute(
    request: CommandRequest,
  ): Promise<Result<CommandReceipt, CommandError>>;
  currentVersion(): Promise<VersionToken>;
  query(
    request: DocumentQuery,
  ): Promise<Result<Versioned<DocumentProjection>, QueryError>>;
  listHistory(
    request: HistoryListQuery,
  ): Promise<Result<HistoryPage, QueryError>>;
  summarizeChanges(
    request: ChangesetQuery,
  ): Promise<Result<ChangesetSummary, QueryError>>;
  materialize(
    version: VersionToken,
  ): Promise<Result<Versioned<MaterializedDocument>, QueryError>>;
  serializePortableDocument(
    request: SerializeRequest,
  ): Promise<Result<PortableDocument, SerializationError>>;
  subscribe(listener: DocumentChangedListener): Unsubscribe;
}

interface DocumentEngineFactory {
  create(
    request: CreateDocumentRequest,
  ): Promise<Result<DocumentEngine, CreateError>>;
  openPortableDocument(
    input: PortableDocumentInput,
  ): Promise<Result<DocumentEngine, OpenError>>;
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

The trusted document factory creates genesis with one real root from supplied durable IDs and no Contribution. Root creation is not a structural command. The first successful user mutation creates the first Contribution and resulting Version.

Commands are typed, validated, attributed, atomic, and checked against an expected VersionToken.

Each successful command atomically publishes one logical Contribution, its exact content/structure effect, any new Origin records, one resulting Version, and its successful idempotency receipt. When a durable repository is attached, publication occurs only after the repository transaction commits. A failed command publishes nothing.

Several immutable Contributions can share a semantic group ID for History presentation. Grouping never changes their identities, Versions, or durability.

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
  readonly content: DetachedCollaborativeContent;
}
```

`DetachedCollaborativeContent` contains visible text/hard breaks, native formatting semantics, and protected Origin information required for correct editing. It is carrier-neutral at the public boundary.

The editor adapter can reconstruct or bind transient ProseMirror/Tiptap/carrier state from this value or a controlled engine session. Mutating detached local state does not mutate engine state.

A durable content commit must pass through `execute` and preserve the accepted atomic text-plus-formatting-plus-Origin contract. The client can request ordinary editing intent but cannot assign arbitrary Origin through formatting or raw carrier updates.

Do not expose a live engine-owned Y.Doc/Automerge object, a formatting-only side channel, or an Origin mutation side channel.

## 7. Change notification contract

Notifications are invalidation hints, not an alternate state stream.

Conceptually:

```ts
interface DocumentChanged {
  readonly version: VersionToken;
  readonly changeSources: readonly ("local" | "remote")[];
  readonly causes: readonly ("edit" | "import" | "checkpoint" | "restore")[];
  readonly contributionIds: readonly ContributionId[];
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedInlineContentIds: readonly InlineContentId[];
}
```

The MVP need not emit the `remote` change source. Implementations can coalesce notifications. Failed commands and exact idempotent retries emit none.

## 8. Required workflows

### Interactive editing

```text
UX holds transient editor/composition state
  -> a minimal safe editor action is ready for durable commit
  -> UX submits one attributed command and semantic group ID against observed VersionToken
  -> engine validates text + formatting + Origin atomically
  -> repository commits immutable effect/Contribution + CAS head
  -> engine publishes one logical Contribution and Version
  -> engine emits invalidation
  -> UX re-queries
```

IME is not split mid-composition, and paste/cut/replacement/formatting/undo/redo are atomic editor actions. Idle/focus/mode boundaries seal semantic groups; they do not create a second durability ledger. A physical recovery checkpoint is not a semantic History Checkpoint.

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
UX commits required editor work
  -> supplies observed VersionToken
  -> engine verifies expected Version
  -> engine assembles retained logical records into opaque .coedit bytes + metadata
  -> UX transports bytes
```

If the engine advanced before serialization begins, return `VersionConflict`.

Open validates into a candidate engine. Only a successful open replaces the active session.

### Browser durability

The browser composition root supplies an IndexedDB repository to the engine. Normal commits append immutable Contribution/effect records and advance a small compare-and-swap head in one short transaction. Periodic physical checkpoints bound recovery. Explicit `.coedit` serialization is not the autosave path.

The UX uses StorageManager capabilities where available, reports quota/persistence status, retains retryable work after failure, and offers explicit `.coedit` backup. `BROWSER_PERSISTENCE.md` owns detailed behavior.

## 9. Committed and transient state

Serialization and export observe committed engine state.

Before Save, export, navigation, restore, editor-owner transfer, or another operation that can invalidate active editor context, the UX must use the accepted controlled-transition policy: freeze, submit required work, drain required durable commands, then continue or expose a deliberate discard decision.

Selection, focus, disclosure, active lens, dialogs, presence, cursor state, retry UI, and unfinished input are transient unless a later feature explicitly makes them durable.

## 10. History representation is private

The public promise is:

> Every retained Contribution can be listed and summarized. Every advertised retained VersionToken can be materialized exactly and restored through the engine API.

A complete private snapshot per Contribution is acceptable only in bounded in-memory tests or an explicitly identified early prototype because it is simple to verify. It is not the Step 11 browser target, a public data type, or a long-term storage contract.

The browser target uses immutable Contributions/effect chunks, periodic canonical recovery checkpoints, and a small CAS head. The engine can change structural sharing, chunking, caches, indexes, checkpoint cadence, or compaction if it preserves the public contract and every advertised retained Version.

## 11. Compatibility with later consumers

A future AI tool queries an explicit Version and submits typed attributed commands. AI content receives software-agent Origin; human acceptance is a separate Contribution. It has no privileged mutation or raw-carrier path.

For collaboration, each UX talks to a local engine. Replication integrates remote work through private engine machinery and surfaces ordinary invalidation notifications.

Product Contributions remain distinct from carrier transport effects. `COLLABORATION_MODEL.md` defines the later distributed constraints.

## 12. MVP architecture verification

The MVP must prove:

- core commands, queries, History, and serialization require no React, file API, or IndexedDB;
- interactive edits and Markdown import use the same validation, attribution, atomicity, and History boundary;
- text and formatting cannot publish in mismatched state;
- every live inserted content unit has one protected Origin, and ordinary formatting cannot alter it;
- copy and restore preserve Origin while attributing their new Contributions to the acting Contributor;
- semantic Checkpoints publish one attributed Contribution and one content-identical Version;
- historical materialization is exact, detached, and read-only;
- editor-content values are detached and cannot mutate engine state;
- restore appends instead of rewinding;
- `.coedit` serialization checks its expected Version;
- a failed Save/Open does not claim success or replace the active engine;
- `.coedit` round trip preserves current and historical behavior and command idempotency;
- repository commit and CAS-head advancement are atomic, and failure publishes no partial in-memory state;
- IndexedDB recovery, competing-tab conflict, quota denial, and explicit backup paths are verified;
- Markdown imported documents satisfy the export/re-import normalized equivalence property; and
- a different private History representation can pass the same public contract suite.

The strict MVP deliberately does not prove network convergence, a provenance UI, comments, authenticated attribution, signed claims, or AI-provider collaboration. It does prove the minimum content-Origin invariants and carrier feasibility those capabilities require.
