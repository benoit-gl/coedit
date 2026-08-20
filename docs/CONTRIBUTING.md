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
