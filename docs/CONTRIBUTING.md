# Contributor guide

Use [Traceability](./TRACEABILITY.md) to find ownership, [Architecture](./ARCHITECTURE.md) for boundaries, [Testing](./TESTING.md) for verification, and [Known limitations](./KNOWN_LIMITATIONS.md) before strengthening any product claim.

## Setup

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm build
```

Native work additionally requires the Rust/Tauri commands listed in [Testing](./TESTING.md). Use `corepack pnpm tauri:build` for a real desktop package; raw Cargo release output is not the complete application artifact.

## Current baseline

WP-1 through WP-7 are implemented, including WP-5 grouped History. Do not write new code as though the former master/detail outline/editor is still current.

Remaining continuous-workspace work:

- WP-7A optional navigation-only sidebar;
- WP-8 browser/accessibility qualification;
- WP-9 standalone qualification;
- WP-10 native revision/exact-group query parity and broader Tauri hardening.

The current decision record is [`docs/proposals/README.md`](./proposals/README.md).

## Architectural contribution rules

- Keep shared UI free of Tauri imports/runtime probing.
- Supply host behavior through composition roots and focused capabilities.
- Route every persisted visible mutation through typed `DocumentOperation` plus contribution context.
- Preserve append-only contribution history; restoration is compensating history, not rewind.
- Preserve tree invariants and stable node IDs.
- Keep presentation-only state out of `DocumentState`, hashes, snapshots and exports.
- Treat persisted/rich HTML and `.coedit` input as untrusted.
- Do not change schema/wire/hash/recovery formats without explicit compatibility/migration work.
- Do not claim native parity because a capability type exists; use `host-deferred` honestly until implemented.

## Cross-layer change playbooks

These are durable dependency maps, not exhaustive file inventories. Use Traceability/source for exact current symbols; use these playbooks to avoid implementing only one side of a contract.

### Add or change a persisted document operation

Review/change together:

1. TypeScript `DocumentOperation` shape and pure domain/tree semantics, including affected-node reporting and invalid cases.
2. Controller initiation through the normal draft-transition/serialization path.
3. Memory-gateway semantics and tests.
4. Mirrored Rust operation/wire shape, validation and transactional SQL behavior.
5. Contribution attribution/type/payload, revision/hash/snapshot behavior and rollback/reopen evidence.
6. UI initiation/failure handling plus use-case, traceability, security and format documentation where affected.

Do not land an operation only in the UI, memory adapter or Rust store; that creates silent host divergence.

### Add or change a persisted field/schema/wire shape

First classify the value as transient presentation state, existing generic metadata, typed document state, ledger-only metadata or normalized persisted relationship. If it is persisted/typed:

- update TypeScript and Rust models plus constructors/cloning/serialization;
- update schema/load/write/restore/hash/snapshot/export/recovery paths that include the value;
- define old-document/default semantics;
- because no migration framework exists, design/version/test migration before claiming old documents remain writable;
- update `DOCUMENT_FORMAT.md` and compatibility/hostile fixtures.

A fresh-database success is not format compatibility evidence.

### Change rich text or checkpoint semantics

Treat Tiptap schema/extensions, browser sanitization, Rust sanitization, Yjs state/update capture, `BodyEditBatchCoordinator`, checkpoint policy, transition drains, History grouping and export as one boundary.

- An allowed formatting feature must survive the intended editor→sanitizer→persistence→reload/restore path without creating an unsafe native bypass.
- Changes to `groupId`, threshold/boundary or retry/backpressure semantics must be reviewed against grouped History and storage-growth expectations.
- Define Markdown behavior explicitly; it remains lossy rather than a recovery format.
- Test malicious HTML/URLs, paste, reload/restore, undo/redo/IME and failure/ordering at the appropriate seam.

### Add a gateway capability or another host

Use the smallest capability that states what the host really supports. For a shared capability:

- define the focused TypeScript port/capability and absence semantics;
- implement/test memory behavior when applicable;
- map Tauri through a narrow command and authoritative Rust validation/store behavior when applicable;
- orchestrate through the controller rather than importing adapters into components;
- define durability, attribution, limits, sanitization, hashes, history/revision semantics, recovery/export and platform evidence.

For native-only behavior, prefer a discriminated capability over a method that exists on every host only to reject. A new host should get its own explicit composition root rather than runtime host detection in shared UI.

### Add import/export/recovery behavior

Classify each format as lossless recovery, interchange or presentation output before implementation. Specify identity/history/snapshot behavior and validation before calling anything an importer or round trip.

- Centralize format/filename/dialog dispatch rather than adding one-off host paths.
- Desktop output should preserve atomic replacement/failure behavior; standalone uses browser download semantics.
- Test large/hostile content and overwrite/failure cases.
- The current standalone and desktop JSON exports are not equivalent and neither imports; do not build new guarantees on an undocumented assumption of parity.

### Add contributor/session management

The types/tables are not a complete identity system. A real workflow must define registration/selection/reconciliation, local-profile-to-document matching, explicit session lifecycle, attribution behavior across hosts, and UI that never silently impersonates an existing contributor. Update the current P0 attribution risk and tests as part of that work.

### Add AI, automation or collaboration

These are product/security boundary changes, not simple provider wiring. Before accepted output can mutate a document, define endpoint/auth/authorization/consent/cancellation/privacy/retention behavior, provider versus approving-human attribution, sanitized proposal/preview semantics, offline/error behavior and CSP/capability changes. Collaboration additionally needs structural-operation conflict semantics, replica identity, ledger/revision ordering and recovery design; local Yjs presence does not supply those decisions.

## Changing History

History has two separate contracts:

1. raw contribution paging/filtering through `ContributionHistory`;
2. semantic presentation through `historyProjection.ts` and `HistoryPanel`.

When changing grouped History, preserve these WP-5 invariants:

- collapse only contiguous `updateBody` rows with the same non-null `groupId`;
- use the newest/final checkpoint as the canonical collapsed revision;
- keep raw contribution count distinct from visible row count;
- merge across ordinary raw-page boundaries by reprojecting accumulated rows;
- mark the oldest potentially incomplete group honestly;
- use exact `ContributionGroupQueryCapability` expansion for page-spanning groups;
- exact expansion must not inherit ordinary History filters;
- preserve exact physical revision actions when expanded;
- never mutate/delete ledger rows to implement grouping.

If implementing WP-10 native group queries, add a narrow read-only Rust/Tauri command and shared contract evidence rather than emulating expansion through broad history scans or restore.

## Changing the continuous canvas

`DocumentCanvas` is the sole document surface. `NodeBlock` owns one visible row, and at most one live row owns `RichTextEditor`.

Any action that may transfer/hide/remove the editor owner must use the existing draft-transition barrier. Do not introduce a second editor in a navigator or resurrect master/detail behavior.

## Adding a document operation

Update together:

1. TypeScript `DocumentOperation`;
2. pure tree/domain semantics and affected-node reporting;
3. TypeScript tests;
4. mirrored Rust operation model;
5. Rust validation/SQL transaction behavior;
6. persistence/restore/hash/snapshot tests as relevant;
7. controller/UI initiation through the normal queue/drain path;
8. traceability, use-case/design/security/format docs when affected.

## Changing a persisted field/schema

There is no migration framework. A persisted schema/type change requires an explicit format-version and transactional migration design before old documents can safely remain writable. Update `DOCUMENT_FORMAT.md`, fixtures, Rust/TypeScript models, snapshots/hashes/exports and compatibility tests together.

## Changing rich text/checkpoint behavior

Review Tiptap extensions, browser sanitization, Rust sanitization, Yjs capture/state, `BodyEditBatchCoordinator`, checkpoint policy, History grouping implications, export behavior and transition draining as one cross-boundary change.

Changing `groupId` semantics is not merely a UI tweak because History depends on it to identify one semantic writing episode.

## Adding another host

Implement the smallest focused capabilities the host actually supports. Define durability, revision/group query support, attribution, sanitization, limits, hashes, restore, recovery/export and platform testing explicitly. Do not give a host rejecting placeholder methods when a discriminated capability can state the absence honestly.

## Definition of done

A change is not complete when code and docs disagree. For behavior visible to users or contributors, update the relevant as-built architecture/design, use case/UX, traceability, testing evidence and known limitations in the same PR. Avoid exact inventory counts or repeated status prose that is likely to drift; link to the owning source instead.
