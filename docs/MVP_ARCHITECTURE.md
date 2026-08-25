# MVP architecture

**Status:** Accepted clean-slate MVP direction.

This document is authoritative for component ownership and the public document
engine boundary. The future logical ontology belongs in
`PRODUCT_DOMAIN_MODEL.md`; the implementation order belongs in
[`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md); and post-MVP replication
belongs in [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md).

The document engine is a logical backend. In the MVP it runs locally in the
browser process and need not be a server, worker, native process, or separate
package.

## 1. MVP definition

The prototype has two principal components:

1. A headless document engine owns the durable document model, validation,
   commands, queries, product History, portable serialization, and change
   notification.
2. A browser UX renders query results, gathers edits, invokes engine commands,
   and handles browser capabilities and transient interaction state.

Markdown import, Markdown export, file transport, browser persistence, and
future AI tools are adapters around this boundary. They are not alternate
document authorities.

```text
Browser UX ------------------+
Markdown importer -----------|
Markdown renderer -----------+--> public engine API --> Document engine
Future AI tools -------------|                              |
Portable storage transport --+                      private representation
                                                   snapshots, deltas,
                                                   storage indexes, caches
```

The first useful vertical slice can import a realistic Markdown document,
inspect its Block tree and diagnostics, edit structure and rich inline content,
use optional content lenses, inspect and restore History, create semantic
checkpoints, export Markdown, save and reopen a lossless portable document, and
survive a browser reload.

Tauri, Rust, SQLite, multi-user networking, AI providers, production provenance,
attachments, and a final History-compaction strategy are not MVP requirements.

## 2. Responsibility boundary

### Document engine

The engine owns:

- `Block`, `InlineContent`, `CollaborativeText`, tags, and durable overlays;
- document and History invariants;
- typed, attributed, version-checked, atomic command application;
- stable document, content, Contribution, and version identities;
- current projections and exact read-only historical materialization;
- lightweight History listing and semantic changeset summaries;
- checkpoint creation as a first-class durable Contribution;
- restore as a new compensating mutation;
- validation and lossless serialization of portable documents;
- change notifications after successful publication; and
- all choices about snapshots, deltas, CRDT updates, storage indexes, caching,
  compaction, private state representation, and portable encoding.

Every client-originated durable mutation enters through `execute`, including
interactive edits, imports, checkpoints, restorations, and future AI edits.
Integrated remote work enters through a private replication-ingress path that
preserves its original Contribution identity and causal metadata. Both paths
share validation, invariants, History integration, atomic publication, and
notifications. No client receives a privileged tree mutation path.

### Browser UX

The UX owns:

- rendering query results and diagnostics;
- selection, focus, disclosure, active lens, dialogs, and editor lifecycle;
- gathering and batching user intent into commands;
- uncommitted editor drafts and composition state;
- file pickers, downloads, clipboard access, and browser-storage interactions;
- deciding where an opaque portable artifact is transported; and
- tracking the version most recently saved by a particular transport.

The UX does not mutate returned domain objects, read a private ledger/archive,
reconstruct History, parse the native artifact, or apply raw Yjs/replication
updates. Historical materializations are detached read-only values, not live
references into engine state.

### Adapters

Adapters translate between an external concern and the engine:

- the Markdown importer parses an AST and plans ordinary typed operations;
- the Markdown renderer queries a chosen version, lens, or subtree and emits a
  lossy representation plus diagnostics;
- file, clipboard, and IndexedDB adapters transport opaque portable artifacts;
  and
- a future AI adapter will query explicit versions and submit attributed command
  groups.

An adapter may live in the same source tree and process as the engine. The
important boundary is authority, not deployment.

## 3. Public engine behavior

The API promises behavior rather than a storage layout. It should be
asynchronous from the start so that later workers, IndexedDB reads, historical
materialization, or remote storage do not require a frontend rewrite.

The following TypeScript is illustrative; the semantic boundary is normative,
not these exact names:

```ts
type VersionToken = string & { readonly __brand: "VersionToken" };

interface Versioned<T> {
  readonly documentId: DocumentId;
  /** Version from which value was materialized. */
  readonly version: VersionToken;
  /** Current engine frontier against which selectors/policy were evaluated. */
  readonly observedAt: VersionToken;
  readonly value: T;
}

interface CommandRequest {
  readonly commandId: CommandId;
  readonly expectedVersion: VersionToken;
  readonly command: DocumentCommand;
  readonly context: ContributionContext;
}

interface ContributionContext {
  readonly contributorId: ContributorId;
  readonly sessionId?: SessionId;
  readonly summary?: string;
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
  readonly suggestedExtension: string;
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

The initial portable bytes may be UTF-8 JSON. They remain opaque to the UX so a
later encoding or internal History representation does not change the UI API.
Changing an already-published wire format still requires explicit versioning and
migration; it does not require changing the engine boundary.

`VersionToken` has a small but important public contract. Tokens are
equality-comparable, but not orderable or decodable; they are scoped to one
document and rejected by another document's engine. A token for an advertised
Version is stable across a lossless portable Save/Open round trip. This permits
dirty tracking and compare-and-swap without exposing whether the token names one
local revision or a multi-head causal frontier.

### Command contract

Commands are typed, validated, attributed, atomic, and checked against an opaque
base `VersionToken`. Each command group has a stable, globally unique idempotency
ID. A successful command publishes one logical Contribution and returns its
stable identifiers and resulting version. A failed command publishes nothing.

Idempotency survives portable Save/Open. The engine persists the command ID and
enough canonical request identity to distinguish an exact retry from conflicting
reuse. It checks an already successful ID before rejecting a now-stale base
version: an exact retry returns the original receipt and emits no Contribution
or notification; reuse with different content is an error.

`VersionToken` deliberately hides whether the MVP uses one local head or a later
replica uses a causal frontier. Public code must not infer a numeric sequence,
one parent, or one permanent global head from it.

Commands that touch structure and several InlineContents publish atomically from
the viewpoint of queries and notifications. A rich-text editor may have a
transient local draft, but committing canonical text must still pass through the
engine; a live Y.Doc is not a side door around commands.

A `checkpointCurrent` command is a normal durable command. It produces one
attributed checkpoint Contribution and one new Version with document material
identical to its base Version. It does not imply approval, publication, or
immutability.

### Query and History contract

The frontend can, without accessing storage internals:

- query the current or an exact historical Version and receive both the
  materialized token and the frontier at which the query was evaluated;
- query a document descriptor (identity and derived display title) for browser
  storage/listing without parsing the portable artifact;
- list paginated Contribution summaries without materializing historical
  documents, while treating advertised VersionTokens as separate materialization
  identities;
- identify checkpoint Contributions through their semantic kind and resulting
  VersionToken;
- request a semantic summary either for one Contribution or for the difference
  between two Versions;
- materialize any advertised version exactly and read-only; and
- restore a historical version by submitting a new attributed command.

Every current-state query carries the `VersionToken` of the state it returned.
The UX uses that token as the base of an edit derived from the projection; it
must not call `currentVersion()` separately and assume the two reads were atomic.
`currentVersion()` is only a convenience for cases that need no correlated data.

The initial History read models are conceptually:

```ts
type VersionSelector =
  | { readonly kind: "current" }
  | { readonly kind: "exact"; readonly version: VersionToken };

type DocumentQuery =
  | { readonly kind: "document"; readonly at: VersionSelector }
  | { readonly kind: "outline"; readonly at: VersionSelector }
  | { readonly kind: "descriptor"; readonly at: VersionSelector }
  | {
      readonly kind: "editor-content";
      readonly at: { readonly kind: "current" };
      readonly inlineContentId: InlineContentId;
    }
  | {
      readonly kind: "lens";
      readonly at: VersionSelector;
      readonly lens: LensRequest;
      readonly subtreeRootId?: BlockId;
    };

interface DocumentDescriptor {
  readonly documentId: DocumentId;
  readonly displayTitle: string | null; // derived through normal projection rules
}

type ContributionKind =
  | "operations"
  | "importMarkdown"
  | "checkpoint"
  | "restore";

interface ContributionSummary {
  readonly contributionId: ContributionId;
  readonly dependencies: readonly ContributionId[];
  readonly resultingVersion: VersionToken;
  readonly contributorId: ContributorId;
  readonly committedAt: string;
  readonly kind: ContributionKind;
  readonly summary?: string;
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedInlineContentIds: readonly InlineContentId[];
}

interface GenesisSummary {
  readonly kind: "genesis";
  readonly version: VersionToken;
}

type HistoryEntrySummary = GenesisSummary | ContributionSummary;

interface HistoryListQuery {
  readonly limit: number;
  readonly observedAt?: VersionToken; // omitted on a first current listing
  readonly cursor?: string; // opaque; fixes observedAt when continuing a page
}

interface HistoryPage {
  readonly documentId: DocumentId;
  readonly observedAt: VersionToken;
  readonly entries: readonly HistoryEntrySummary[];
  readonly nextCursor?: string; // opaque and scoped to observedAt
}

type ChangesetQuery =
  | { readonly kind: "contribution"; readonly contributionId: ContributionId }
  | {
      readonly kind: "between-versions";
      readonly from: VersionToken;
      readonly to: VersionToken;
    };

interface ChangesetSummary {
  readonly target: ChangesetQuery;
  readonly summary: string;
  readonly affectedBlockIds: readonly BlockId[];
  readonly affectedInlineContentIds: readonly InlineContentId[];
}
```

The first History page fixes `observedAt`; subsequent opaque cursors retain that
consistent view. Page order is deterministic and respects causality, but is a
display order rather than identity. A later concurrent Contribution may appear
earlier-looking in a new listing without changing existing IDs.

A deliberately persisted human summary is Contribution metadata. A derived or
LLM-generated summary is a disposable query projection unless an explicit
attributed command persists it.

Checkpoint Contributions are part of ordinary History. There is no singular
"accepted" Version and no mutable checkpoint pointer. A caller that wants a
specific checkpoint uses the exact resulting VersionToken from History.

Restore never rewinds, deletes, or mutates old History. It creates a new
Contribution against the current base version whose result restores the chosen
historical material according to the engine's restore semantics.

React presentation normally consumes semantic projections. The trusted content
adapter used by the editor may query a detached canonical CollaborativeText
value for one InlineContent only from `current`, reconstruct a local Y.Doc, and
submit incremental updates against the token returned by that query. Editing
requires `result.version === result.observedAt`; exact historical projections
remain read-only. To continue from historical material, the user first submits
restore with the current `observedAt` as the command base and the historical
`version` as the target. Editor bytes are copied values, never engine-owned
buffers or update logs, and changing the local Y.Doc does not mutate canonical
state.

### Change notification contract

Notifications are invalidation and change hints, not an alternate state stream:

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

The MVP need not emit `remote`, but reserving it preserves the intended boundary.
After a notification, the UX re-queries the projection it needs. Implementations
may coalesce events and report the unique origins/causes represented by the
batch. Failed commands and exact idempotent retries emit none.

## 4. Required workflows

### Interactive editing

```text
UX gathers and flushes an edit
  -> execute attributed command group against VersionToken
  -> engine validates and publishes atomically
  -> engine emits DocumentChanged
  -> UX re-queries affected projections
```

Transient selection and editor state do not create Contributions. A failed
commit leaves the canonical model unchanged and the UX retains a recoverable
draft or presents an explicit retry/discard choice.

### Checkpoint

```text
current VersionToken
  -> execute attributed checkpointCurrent command
  -> engine publishes one checkpoint Contribution
  -> engine creates one content-identical resulting Version
  -> engine emits DocumentChanged
  -> checkpoint is visible through ordinary History listing
```

A checkpoint is a durable semantic event. It does not clone live document
entities, create a separate final document, or change the document material.

### Markdown import

```text
Markdown bytes
  -> parser and planner
  -> diagnostics + ordinary typed operation group
  -> create a candidate engine
  -> one atomic attributed import command
  -> replace the active UX session only after success
```

The importer does not write a tree directly, access a private session, or create
one revision per paragraph. Its special concerns are parsing, source metadata,
fallbacks, and diagnostics; mutation semantics remain ordinary engine semantics.

### Markdown export

```text
chosen VersionToken + optional lens/subtree
  -> engine query/materialization
  -> Markdown renderer
  -> text or bytes + loss diagnostics
  -> UX copies, downloads, or otherwise transports the result
```

Markdown is a potentially lossy rendering/interchange format. It is not native
Save, a storage snapshot, or sufficient recovery for all Coedit data.

### Native Save and Open

“Save” is a user-facing command, but the engine operation is a non-mutating,
consistent serialization query:

```text
UX flushes pending editor state
  -> UX supplies the VersionToken observed after that flush
  -> engine verifies it is still current and serializes it consistently
  -> returns opaque bytes and transport metadata
  -> UX transports them to a file, clipboard, or browser store
```

If the engine has advanced before serialization begins, including because of a
future remote edit, serialization returns `VersionConflict`; the UX re-queries
and decides whether to retry. The returned artifact's token is authoritative for
the bytes produced.

The portable artifact contains everything needed for exact reopening, including
product History and any convergence state required by the implemented version.
The UX does not know whether it contains full snapshots, deltas, indexes, or
caches. Required convergence state can include causal/CRDT document truth and
unsynchronized durable Contributions. It excludes credentials, relay URLs,
presence, cursors, acknowledgements, and inbox/outbox delivery bookkeeping.

Open validates an opaque input and builds a replacement engine off to the side.
Only a fully successful open replaces the active session; malformed or
unsupported data leaves it untouched. The factory copies caller-owned input
bytes before retaining them or crossing an asynchronous boundary.

### Browser durability

An IndexedDB adapter may list local document descriptors and store portable
artifacts. On load it passes the artifact to `openPortableDocument`. It does not
persist or reconstruct private engine objects. A compare-and-swap or equivalent
transport check may use the opaque saved `VersionToken` to avoid silently
overwriting work from another tab.

## 5. Committed and transient state

Serialization and export observe committed engine state. Before Save, export,
navigation, or editor-owner transfer, the UX must flush the active editor or
make a deliberate discard decision.

The portable artifact reports the version it serialized. “Dirty” and “saved”
are UX/transport concepts, normally computed by comparing the current token with
the token last transported successfully. Selection, focus, disclosure, active
lens, dialogs, presence, cursor state, retry queues, and unfinished input do not
belong in portable document History.

## 6. History is first-class; its representation is private

The public promise is:

> Every retained Contribution can be listed and summarized. Every advertised,
> retained VersionToken can be materialized exactly and restored through the
> engine API.

This does not imply that every mutation permanently stores a deep copy of the
entire document. A complete snapshot per Contribution is an acceptable private
MVP implementation because it is simple to verify, but it is not a public data
type or long-term contract.

The engine may later use structural sharing, immutable shared byte buffers,
incremental Yjs updates, Contribution deltas, periodic storage snapshots,
materialization caches, retention/compaction policies, IndexedDB, SQL, a worker,
or a service. Defensive copies are required at mutable trust boundaries;
immutable internal values may share storage safely.

These optimizations must preserve engine contract tests and logical portable
behavior. The frontend must never receive `RevisionRecord.snapshot`,
`DocumentSessionArchive`, raw storage-snapshot/delta records, or Yjs update logs
as its state API.

## 7. Compatibility with later consumers

A future AI tool queries an explicit version and submits an attributed command
group. It has no privileged mutation path.

For collaboration, each UX talks to its local engine. Engines integrate remote
work through a private replication adapter and surface ordinary change
notifications; frontends neither exchange nor apply replication payloads.
Product Contributions, including checkpoints, remain distinct from CRDT
transport updates. The full constraints are in
[`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md).

## 8. MVP capability and test boundary

The MVP is complete only when the headless boundary is real, not merely an
interface drawn around React state. Contract and failure-path tests must prove:

- engine commands, queries, History, and serialization require no React, DOM,
  file API, or IndexedDB;
- interactive editing and Markdown import receive the same validation,
  attribution, atomicity, and History behavior;
- import publishes one atomic Contribution or none;
- checkpoint creation publishes one attributed Contribution and one
  content-identical resulting Version;
- checkpoint Contributions are listable through History and their resulting
  Versions are exactly materializable;
- every query result identifies the Version it observed, so commands never use a
  separately raced base token;
- History summaries do not require materializing every version;
- historical materializations are exact, detached, and read-only;
- editor-content bytes are detached and changing them cannot mutate engine state;
- restore appends instead of rewinding;
- serialization checks its expected Version and identifies one consistent
  Version or reports a conflict;
- a failed Save/Open does not claim success or replace the active engine;
- a portable round trip preserves current and historical behavior;
- command idempotency and original receipts survive a portable round trip;
- exact retries and failed commands emit no notification; and
- a different private History representation can pass the same public contract
  suite.

The MVP deliberately does not prove network convergence. It does preserve the
opaque version, notification, identity, command-boundary, checkpoint, and
serialization seams needed to investigate it later.
