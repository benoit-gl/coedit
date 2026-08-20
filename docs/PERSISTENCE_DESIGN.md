# Persistence design

This document describes the persistence ports and host implementations for Coedit Local `0.1.0` / `.coedit` format version `1`.

## Host boundary

The shared application depends on capability-oriented TypeScript ports. Host selection occurs only in the composition roots.

- `MemoryDocumentGateway` is the volatile standalone implementation.
- `TauriDocumentGateway` is the desktop adapter over Tauri IPC and Rust `DocumentStore`.
- `DocumentFileDialogs` is a separate native-path boundary used only by the desktop composition.

## Core gateway contracts

`src/persistence/gateway.ts` composes several focused concerns:

- `DocumentSession` — close, apply attributed operations, restore revisions;
- `ContributionHistory` — cursor-paged raw contribution listing;
- `DocumentStorage` — discriminated `volatile` or `native-file` storage operations;
- `RevisionQueryCapability` — `available` or `host-deferred` non-mutating revision materialization;
- `ContributionGroupQueryCapability` — `available` or `host-deferred` exact contribution-group expansion.

Capabilities are discriminated instead of represented by methods that only throw. Shared UI must narrow the capability before use.

## Raw History paging

`listContributions` returns newest-first `ContributionPage` values. Filtering is applied before page construction and `beforeRevision` is an exclusive cursor. The shared UI accumulates pages and deduplicates contribution IDs.

The grouped History UI does not change this port. `historyProjection.ts` is a presentation projection over accumulated raw rows.

## Exact group expansion

WP-5 adds an explicit exact-group query because ordinary History pages and filters are insufficient to prove that a semantic edit group is complete.

Conceptually:

```ts
interface ContributionGroupQuery {
  groupId: string;
  beforeRevision?: number;
  limit?: number;
}

interface ContributionGroupQueries {
  listContributionGroup(query: ContributionGroupQuery): Promise<ContributionPage>;
}
```

The query contract is intentionally narrow:

- `groupId` must identify one non-empty persisted contribution group;
- results are newest-first and cursor-paged;
- ordinary History search/node/contributor filters do not apply;
- callers may request every physical contribution in the group;
- the query does not mutate document state, ledger rows, or snapshots.

`App` follows the cursor until `hasMore` is false, deduplicates by contribution ID, and supplies the exact set to `HistoryPanel`.

## Memory adapter

`MemoryDocumentGateway` owns one current `DocumentView`, the complete runtime contribution ledger, and a revision snapshot map.

It implements:

- mutations and restore;
- complete-ledger filtered History paging;
- verified non-mutating revision materialization;
- exact cursor-paged contribution-group queries;
- standalone JSON/Markdown export.

Exact group expansion scans the complete in-memory ledger for the requested `groupId`, independent of the currently visible History filter.

Standalone remains volatile: closing/reloading loses the working document and its internal revision map.

## Tauri adapter and Rust store

`TauriDocumentGateway` delegates current durable behavior to named Rust commands. `DocumentStore` owns one SQLite connection and, for normal mutations, commits materialized state, revision metadata, attributed contribution, resulting hash, and full snapshot atomically.

Current desktop history still has a 100,000-row pre-window in Rust. Native revision materialization and native exact-group queries are not implemented yet. The TypeScript adapter advertises both capabilities as host-deferred, allowing the shared UI to remain explicit about the limitation.

WP-10 is responsible for implementing native query parity and qualifying it against the standalone contracts; WP-5 does not add a Rust command or schema migration.

## `.coedit` data relevant to History

The existing `contributions` table already stores:

- revision and attribution;
- `session_id`;
- `group_id`;
- operation type and affected nodes;
- payload/base revision/resulting hash/message.

WP-5 reuses `group_id`; no table, field, format-version, or migration change is required. Group collapse/expansion is not persisted UI state.

Every physical body checkpoint still gets its own contribution and full snapshot. Collapsing several checkpoints into one visible History row therefore improves readability but does not reduce storage growth.

## Revision materialization

Standalone `materializeRevision` returns a detached, tree-validated state after recomputing and matching the stored snapshot hash. It does not alter current state, revision, contributions, or snapshots.

Tauri snapshots exist in SQLite, but the native query boundary is still host-deferred. Restoration is already implemented and remains a mutation that appends a new compensating revision.

## Format and recovery boundaries

Format version remains `1`. There is still no migration framework.

Standalone recovery JSON and desktop JSON are not equivalent: standalone writes the current versioned recovery envelope and complete runtime ledger; desktop retains an older bounded export. Neither has an importer. Markdown is lossy interchange, not recovery.

## Known parity gaps

See [Known limitations](./KNOWN_LIMITATIONS.md) for the complete risk register. Material persistence gaps include:

- contributor identity portability;
- hash/sanitizer/Yjs semantic parity between TypeScript and Rust;
- missing migrations;
- desktop History pre-window;
- native revision and exact-group queries;
- full-snapshot growth;
- incomplete hostile-data verification on open/restore;
- recovery JSON divergence/no importer;
- renderer-supplied native path authorization.

## Change rule

A change to persisted fields, SQLite schema, hash input, recovery envelopes, or Rust/TypeScript wire shapes is a format/compatibility decision and must update `DOCUMENT_FORMAT.md`, tests/fixtures, migrations or explicit compatibility policy, and this design. A presentation-only History change is not a format change merely because it interprets existing contribution metadata.
