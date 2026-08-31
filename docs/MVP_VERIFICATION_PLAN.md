# MVP verification plan

**Status:** Accepted verification strategy.

## 1. Purpose and authority

This document defines how the document-engine MVP is verified. It maps the MVP contract and implementation risks to executable evidence.

It does not redefine product behavior. `MVP_CONTRACT.md` defines what must be proved. The focused technical specifications define the behavior under test.

This document is the RUP-inspired Test Plan for the MVP. It is intentionally lightweight.

## 2. Verification principles

Use tests at the lowest meaningful boundary.

Prefer deterministic tests with injected IDs, clocks, and limits. Use browser end-to-end tests only for behavior that requires a real browser integration boundary.

A successful happy path is insufficient when a capability can lose, reorder, corrupt, or silently replace user work. Data-loss and failure-path tests are required for those capabilities.

Do not use a test-count target. Require coverage of behavior, invariants, boundaries, and identified risks.

## 3. Test layers

Use these layers in order:

1. pure domain invariant tests;
2. headless attributed CollaborativeContent and carrier-qualification tests;
3. operation and History tests;
4. Markdown planning, export, and round-trip fixtures;
5. `.coedit` round-trip and hostile-input tests;
6. in-memory and IndexedDB repository-adapter contract tests;
7. editor integration tests with real collaborative state;
8. component interaction and accessibility tests; and
9. a small browser end-to-end suite for the complete vertical slice.

A higher-level test does not replace a lower-level invariant test.

## 4. Documentation baseline and carrier gate

Before implementation begins, verify documentation consistency manually and mechanically where practical.

The Step 0 gate requires:

- every current authority to be local to `main`;
- the documentation index to identify direct authority;
- the preserved-branch reconciliation record to classify material decisions;
- retained/adapted decisions to agree with current authoritative documents;
- superseded decisions to identify the replacement and rationale;
- deferred decisions to be explicit; and
- no implementation-blocking decision to remain open.

The documented baseline closes the former `TextAnchor` blocker by assigning intrinsic formatting, content-native Origin, external CommentTargets, and transient selections to distinct mechanisms. A mechanical scan must find no normative external formatting/provenance range or per-InlineContent carrier assumption outside an explicitly superseded historical statement.

The accepted reconciliation closes Step 0. A separate Elaboration carrier gate must pass before Step 3 CollaborativeContent, carrier-dependent History effects, editor integration, or `.coedit` version 1 is frozen.

The carrier qualification compares pinned Yjs v13 and Automerge under the same fixtures from `ATTRIBUTED_TEXT_AND_ANNOTATIONS.md` and `STRUCTURAL_CARRIER_MODEL.md`. It records exact dependency versions, license review, adapter complexity, representative target devices, performance budgets, measurements, and the selection rationale. Yjs v14 is rerun only after stable release; Loro remains a benchmark unless a later decision changes the candidate set.

### 4.1 Step 1 tooling and platform evidence

Before Step 1 exits, verify the coding/tooling contract in `CODING_STYLE.md`.
From clean checkouts, run this exact sequence:

```text
npm run bootstrap
npm run check
npm run build
```

Retain successful evidence from one native Windows environment and one Linux
environment. The Linux environment can be native, a disposable VM, or a
container; the Windows run must exercise native Windows package-script behavior
rather than WSL. Run a macOS smoke check when hardware or a hosted environment is
available, but absence of that optional evidence does not block Step 1.

Verify that:

- package, Node.js, and pnpm versions are pinned as specified;
- npm is sufficient to bootstrap the exact pinned pnpm version, with no global
  pnpm or Corepack prerequisite;
- the lockfile is committed and frozen installation does not change it;
- `npm run test` runs once and exits while only `npm run test:watch` watches;
- ESLint uses flat typed configuration, accepts zero warnings, and excludes
  generated build output from source linting;
- TSDoc syntax, exported-API documentation, internal links, documentation paths,
  and exported-symbol references validate with warnings treated as failures;
- Prettier check performs no write and repository text is UTF-8/LF;
- dependency-cruiser rejects cycles and forbidden architectural edges;
- import path spelling works on a case-sensitive Linux filesystem;
- required scripts use no OS-specific shell, utility, path, symlink, permission,
  environment-assignment, or glob assumption;
- the production build performs no unexpected outbound request;
- the production build emits relative asset URLs, keeps JavaScript minified, and
  emits usable external source maps for the JavaScript bundles;
- `npm run preview` serves the production build locally over HTTP;
- `npm run check` and `npm run build` are non-interactive and leave tracked
  source unchanged;
- after `npm run build` creates `dist`, a subsequent `npm run check` still passes
  without linting generated bundle files; and
- the root README documents commands and platform tiers accurately.

There is no current CI pass to verify. When CI is added, its Linux job must call
the same canonical sequence; a separate CI-only build or test path fails this
contract.

## 5. Domain and structural verification

Verify at least:

- `createEmptyDocument(...)` or its equivalent creates exactly one root from trusted, supplied IDs;
- the root is present in genesis, is never created by `CreateBlock`, and cannot move or delete;
- pure reducers never generate IDs and reject duplicate Block and InlineContent IDs in the live candidate;
- Step 2 keeps no lifetime-ID registry; retained-lifetime non-reuse is verified at the History and portable boundaries;
- no Block has two parents;
- no InlineContent has two owners;
- Step 2 creates InlineContents only with the typed, opaque, valid empty `InlineContentValue` and never with partially valid attributed content;
- structural operations never inspect `InlineContentValue` internals;
- cycles are rejected;
- vector order is exact;
- invalid indices fail without mutation;
- count, depth, tag, and scalar limits work at and immediately beyond boundaries;
- a depth-1,000 tree can be operated on without recursive stack growth;
- moving a subtree retains identity;
- moving into self or a descendant fails;
- subtree deletion removes all live descendants and owned InlineContents;
- contentless grouping Blocks remain valid; and
- every failed operation leaves its input unchanged.

## 6. Attributed CollaborativeContent and carrier verification

Run the same carrier-neutral suite against both candidates before selecting one,
then retain it as a production regression suite for the winner.

### 6.1 Formatting carrier

Verify:

- empty and realistic rich text, hard breaks, overlapping marks, and safe links;
- bold, italic, underline, strikethrough, inline-code, and link toggle/clear;
- `none`, `start`, `end`, and `both` boundary expansion at the exact start and end;
- replacement, empty selection, mark exclusion, split, merge, and hard break;
- editor-to-carrier-to-editor projection without a second formatting authority;
- formatting clear/change never alters Origin; and
- malformed or over-limit state fails without changing the base.

### 6.2 Protected Origin carrier

Verify:

- every live text item and hard break has exactly one valid Origin;
- insertion before, inside, and after another Contributor's text receives only
  the inserting actor's new Origin;
- separate Contributions by the same author receive distinct Origin records
  whose `agentId` can still support an author-level projection;
- ordinary client and formatting operations cannot assign, inherit, spoof,
  clear, or rewrite Origin;
- imported, unknown, automation, and AI fixtures can be represented even when
  their product UI is deferred;
- derived display runs can coalesce equal Origin without becoming durable range
  entities; and
- detached values and caller-owned bytes cannot mutate engine state.

### 6.3 Complete editor paths and lineage

Use a real browser where required to verify typing, backspace/delete, selection
replacement, split/merge, hard break, IME, cut, paste, undo, redo, formatting,
and editor mount/unmount.

Verify same-document internal paste and entity copy create new carrier identities
but preserve Origin and record the acting Contributor plus derivation. Verify
ordinary HTML/plain paste strips private Origin and receives imported/unknown
Origin rather than false authorship. Verify a private fragment from another
document also follows the imported/unknown path until cross-document lineage is
implemented. Verify restore uses fresh carrier identities,
preserves historical Origin, and records the restoring actor and target Version.

### 6.4 Convergence, atomicity, anchors, and growth

Verify:

- pairwise and three-way insert/delete/format at identical and adjacent
  boundaries under duplicate, delayed, reordered, partitioned, and reconnected
  updates;
- equal logical collaborative state, formatting/Origin projection, and future
  cursor behavior rather than merely equal text;
- one atomic command spanning Block structure, two InlineContents, Origins, and
  Contribution metadata publishes all or none;
- a command that explicitly targets only one InlineContent cannot mutate
  unrelated InlineContents or Block structure;
- stable cursor plus affinity survives ordinary edits and explicitly fails when
  its containing content is unavailable;
- quote/prefix/suffix/position fallback can represent attached, ambiguous, and
  orphaned future comment targets without silent ambiguous reattachment;
- retained Version and cursor behavior after the candidate's supported
  garbage-collection/compaction cycle; and
- 100,000-character content and 5,000-Contribution load, edit, growth,
  materialization, and portable-open behavior against recorded budgets.

### 6.5 Structural carrier qualification

Run the structural suite in `STRUCTURAL_CARRIER_MODEL.md` against both candidates.
Verify at least:

- one logical collaborative document contains the Block registry and Block-local
  payload namespaces;
- `CreateBlock` and `MoveBlock` map to projected preorder at first, middle, and
  last child positions;
- a moved subtree receives the correct depth delta, fresh ordered positions, and
  preserves identity and internal order;
- ordinary allocation avoids exact primary-position collisions where practical;
- equal positions use the stable identity tie-break;
- insertion inside two-way and multi-way collision runs preserves the previous
  projected order and replicates required normalization;
- concurrent moves to different destinations converge;
- move versus delete keeps the moved Block alive;
- payload update versus delete keeps the updated Block alive;
- a payload mutation and its Block activity marker publish together;
- descendant activity does not keep a deleted ancestor alive;
- any residual normalization-versus-delete behavior is recorded;
- concurrent subtree/run insertion measures non-interleaving behavior;
- narrow-gap stress records key growth, comparison/sort cost, and serialized
  carrier growth; and
- duplicate, delayed, reordered, partitioned, and reconnected updates converge to
  equal projected structure and logically equivalent carrier state.

Functional invariants are mandatory and cannot be traded for a faster carrier.
Select Yjs unless Automerge passes the same suite and materially reduces custom
protected-metadata, structural, heads, cursor, or storage machinery enough to
outweigh its integration maturity risk.

## 7. History verification

Verify at least:

- genesis contains the initial root and no Contribution;
- the first successful user mutation creates the first Contribution and resulting Version;
- later successful durable commands each create exactly one logical Contribution and resulting Version;
- assigning any durable ID from a retained lifetime to a different entity, record, or lifetime is rejected even when the original entity is no longer live;
- a failed command publishes neither;
- same-base concurrent commands produce one success and one conflict;
- stale commands publish nothing;
- exact CommandId retry returns the original receipt and creates no new Contribution;
- conflicting CommandId reuse fails;
- historical materializations are exact, detached, and read-only;
- semantic Checkpoint creation adds one attributed Contribution and one content-identical Version;
- multiple semantic Checkpoints remain separately materializable;
- restore appends a new Contribution and does not rewind History;
- local restore preserves historical Origin while recording the restoring actor and target Version;
- restore preserves prior Contributions, Checkpoints, and Contributors; and
- successful publication emits one invalidation event while failures and exact retries emit none.

## 8. Editor durability and semantic-group verification

One successful editor command is one immutable Contribution and Version. Several
prompt Contributions can share a semantic group ID for presentation. The
repository Contribution/effect records are the crash journal; no later process
turns unsealed private rows into Product History.

Verify:

- IME composition is not split mid-composition;
- paste, cut, replacement, formatting, undo, and redo are atomic actions;
- unrelated dirty work submits before an atomic action;
- insertion/deletion mode change, configured idle, real focus/owner departure,
  and controlled transitions seal the current semantic group;
- clean navigation creates no command;
- a controlled transition freezes, submits required work in FIFO order, and
  drains before replacing or invalidating the editor context;
- every successful command is durably committed before notification/success;
- a failed commit retains the exact detached command/draft for retry;
- no later command overtakes a failed head;
- quota/conflict/degraded durability is visible;
- typing is not blocked merely because two complete artifact writes are
  pending; and
- History grouping never deletes, rewrites, or changes the Version identity of
  underlying Contributions.

Use fake clocks and deterministic semantic group IDs for grouping tests. Treat
the preserved 20-grapheme, 30-second, and two-capture settings as comparison
fixtures, not normative assertions.

## 9. Markdown verification

Every successfully imported Markdown fixture must run the full round-trip property defined in `MARKDOWN_INTERCHANGE.md`:

```text
Markdown A -> Coedit X -> Markdown B -> Coedit Y
```

Verify `X` and `Y` with the documented Markdown equivalence relation.

The suite must also verify stable diagnostics for normalization, literal fallback, unsafe links, unsupported nodes, malformed input, and resource limits.

Do not compare source Markdown text for equality. Canonical export spelling is allowed.

## 10. Portable-format verification

Treat `.coedit` input as hostile.

Verify:

- realistic current and historical state round trips;
- Contributors, Origins, Contributions, derivation, semantic Checkpoints, Version identity, and command idempotency survive;
- corrupt checksum fails;
- unsupported versions fail;
- unknown properties fail for version 1;
- unknown carrier/schema, malformed base64/binary values, missing/mis-hashed chunks, and unreachable references fail;
- malformed trees and ownership fail;
- broken graph/frontier links and Contributor/Origin references fail;
- identity reuse across retained lifetimes fails;
- all documented resource limits fail safely when exceeded;
- a failed open never replaces the active engine;
- stale serialization returns no artifact;
- intrinsic formatting, boundary policies, Origin, copy/restore lineage, and actor distinction round trip exactly;
- reconstruction from physical checkpoint plus effects equals direct materialization; and
- successful format-version-1 encode is always accepted by the format-version-1 decoder.

## 11. Browser durability verification

Run the same repository contract against the in-memory and IndexedDB adapters where applicable.

Verify:

- atomic Contribution/effect/head commit and reopen;
- browser reload;
- document isolation;
- failed-commit reporting;
- corrupt local record handling;
- stale-head and competing-writer detection;
- explicit overwrite behavior where supported;
- browser storage never parses or becomes authoritative for semantic engine state;
- injected failure at every transaction boundary leaves no published partial state;
- checkpoint-plus-effect recovery and safe unreachable-chunk cleanup;
- quota exhaustion, storage unavailability, and persistent-storage denial;
- visible degraded durability, exact retry, and explicit `.coedit` backup; and
- `BroadcastChannel` acts only as invalidation, never ordering authority.

## 12. UI and accessibility verification

Verify keyboard-only structural creation and movement, predictable focus after operations, single-editor ownership, historical read-only behavior, visible failure/retry state, and no direct React mutation of durable document state.

Use a real browser for IME, focus transfer, clipboard behavior, and other interactions that cannot be qualified reliably in a simulated DOM.

## 13. End-to-end MVP suite

Keep the end-to-end suite small and high value. It must prove at least:

1. obtain a free-form human Contributor display name and create a blank document;
2. import a realistic Markdown fixture;
3. inspect and edit structure;
4. edit attributed formatted inline content through semantic grouping;
5. verify internal and external paste lineage;
6. create a semantic Checkpoint;
7. inspect and restore History while preserving Origin and attributing the restore actor;
8. export Markdown and re-import it to an equivalent Coedit document;
9. save `.coedit` and reopen it;
10. persist and reload through the incremental IndexedDB repository; and
11. recover safely from representative stale, quota, failed-commit, and malformed-open cases.

## 14. Pre-network collaboration gate

Before real clients connect, qualify:

- the exact causal Contribution envelope and atomic metadata/effect publication;
- Principal, Contributor, Origin, Replica, Session, and connection separation;
- a two-engine fault bus with duplicate, delay, reorder, missing dependency,
  partition, reconnect, and conflicting-ID cases;
- convergence of Contribution graph/frontier, hidden carrier state, Block tree,
  formatting/Origin projection, and every advertised materialization;
- causal restore that compensates only work observed by its author, preserves
  unseen concurrent inserts, and surfaces unresolved overlap;
- relay-coordinated provisional structural proposals or a separately qualified
  replicated-tree algorithm;
- restart-safe outbox/inbox, catch-up, bootstrap, authorization/schema/limit
  rejection, and quarantine; and
- checkpoint/compaction that preserves retained Versions, Origins, and comment
  target behavior.

Carrier text synchronization alone cannot pass this gate. History/convergence and
the selected structural-conflict policy pass together.

## 15. Later feature gates

- **Comments:** cursor-plus-quote targets, attached/ambiguous/orphaned state,
  explicit repair, restore, and compaction fixtures.
- **AI:** explicit source Version, typed operations, software-agent Origin,
  separate human acceptance, provider/model/version/derivation, and stale
  proposal behavior.
- **Cross-document lineage:** private fragment versioning, origin-catalog import,
  source accessibility/privacy, and spoof resistance.
- **Signed publication:** local assertion versus authenticated enforcement versus
  C2PA/equivalent export attestation, including tamper/key/revocation tests.
- **Fully offline Block tree:** deterministic move/order/delete/cycle semantics
  and the complete convergence suite.
- **Storage/platform replacement:** measured evidence plus the existing
  engine/repository/portable contract suite for OPFS, SQL, or a native shell.

## 16. Traceability rule

Each MVP-contract scenario must link to one or more tests or qualification records before the MVP is declared complete.

When an implementation or specification changes a behavior that affects a recorded preserved decision, update `PRESERVED_BRANCH_RECONCILIATION.md` and the affected verification cases in the same change.
