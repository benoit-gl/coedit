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
2. headless CollaborativeText, formatting-range, and TextAnchor tests;
3. operation and History tests;
4. Markdown planning, export, and round-trip fixtures;
5. `.coedit` round-trip and hostile-input tests;
6. repository-adapter contract tests;
7. editor integration tests with real collaborative state;
8. component interaction and accessibility tests; and
9. a small browser end-to-end suite for the complete vertical slice.

A higher-level test does not replace a lower-level invariant test.

## 4. Step 0 verification

Before implementation begins, verify documentation consistency manually and mechanically where practical.

The Step 0 gate requires:

- every current authority to be local to `main`;
- the documentation index to identify direct authority;
- the preserved-branch reconciliation record to classify material decisions;
- retained/adapted decisions to agree with current authoritative documents;
- superseded decisions to identify the replacement and rationale;
- deferred decisions to be explicit; and
- no implementation-blocking decision to remain open.

The concrete `TextAnchor` representation is currently an open blocker. Step 0 cannot pass until its decision and required verification cases are recorded.

## 5. Domain and structural verification

Verify at least:

- exactly one root exists and cannot move or delete;
- Block and InlineContent identities are unique and never reused after successful creation;
- no Block has two parents;
- no InlineContent has two owners;
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

## 6. Collaborative text and formatting verification

Step 3 tests must prove the accepted model after `TextAnchor` is decided.

At minimum, verify:

- empty and realistic rich text can be constructed and projected;
- collaborative text state is detached at mutable trust boundaries;
- malformed or over-limit updates fail without changing the base;
- one InlineContent update cannot affect another;
- formatting is represented through external `RangeAnnotation<Formatting>` data, not a competing persisted mark authority;
- formatting ranges survive supported edits according to the accepted anchor semantics;
- copy and entity-copy behavior follows the explicit identity and formatting rules;
- historical materialization retains compatible text and anchor state; and
- `.coedit` serialization preserves the exact state required by the accepted anchor design.

Do not write tests that encode a guessed TextAnchor implementation before Step 0 closes.

## 7. History verification

Verify at least:

- genesis contains no Contribution;
- one successful durable command creates exactly one logical Contribution and resulting Version;
- a failed command publishes neither;
- same-base concurrent commands produce one success and one conflict;
- stale commands publish nothing;
- exact CommandId retry returns the original receipt and creates no new Contribution;
- conflicting CommandId reuse fails;
- historical materializations are exact, detached, and read-only;
- semantic Checkpoint creation adds one attributed Contribution and one content-identical Version;
- multiple semantic Checkpoints remain separately materializable;
- restore appends a new Contribution and does not rewind History;
- restore preserves prior Contributions, Checkpoints, and Contributors; and
- successful publication emits one invalidation event while failures and exact retries emit none.

## 8. Editor semantic-group verification

Adapt the preserved `BODY_CHECKPOINT_STRATEGY.md` behavior into current terminology.

A **physical edit capture** is not a semantic History Checkpoint. One human-visible edit group can contain several physical captures that share one group ID.

Use these accepted default policy values:

- insertion batch threshold: 20 grapheme clusters;
- idle seal timeout: 30,000 ms; and
- maximum detached pending captures: two.

Verify these preserved semantics:

- nineteen inserted graphemes can remain dirty; before the twentieth is accepted, capture the prior nineteen and retain the same semantic group ID;
- insertion-to-deletion and deletion-to-insertion changes seal the preceding group before the new mode begins;
- repeated deletions remain one deletion group;
- a qualifying cursor or focus departure seals dirty work once;
- clean navigation creates no capture;
- accepted dirty activity resets the idle timer;
- IME composition is not split mid-composition;
- paste, cut, replacement, formatting, undo, and redo are atomic edits;
- unrelated dirty work seals before an atomic edit;
- an accepted atomic edit captures and seals its result before later ordinary work;
- controlled transitions freeze, capture required work, respect FIFO ordering, and drain before the transition completes;
- a failed persisted capture retains the exact immutable failed item for retry;
- no later capture overtakes a failed head;
- backpressure blocks unsafe additional changes when the two-capture bound is reached; and
- History grouping never deletes or rewrites the underlying physical Contributions.

Use fake clocks and deterministic group IDs in tests.

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
- Contributors, Contributions, semantic Checkpoints, Version identity, and command idempotency survive;
- corrupt checksum fails;
- unsupported versions fail;
- unknown properties fail for version 1;
- malformed base64/binary values fail;
- malformed trees and ownership fail;
- broken revision links and Contributor references fail;
- identity reuse fails;
- all documented resource limits fail safely when exceeded;
- a failed open never replaces the active engine;
- stale serialization returns no artifact; and
- successful format-version-1 encode is always accepted by the format-version-1 decoder.

After the TextAnchor decision, add exact formatting/anchor portable tests before Step 0 closes.

## 11. Browser durability verification

Run the same repository contract against the in-memory and IndexedDB adapters where applicable.

Verify:

- save and reopen;
- browser reload;
- document isolation;
- failed-save reporting;
- corrupt local record handling;
- competing-writer detection;
- explicit overwrite behavior where supported; and
- browser storage never parses or becomes authoritative for private engine state.

## 12. UI and accessibility verification

Verify keyboard-only structural creation and movement, predictable focus after operations, single-editor ownership, historical read-only behavior, visible failure/retry state, and no direct React mutation of durable document state.

Use a real browser for IME, focus transfer, clipboard behavior, and other interactions that cannot be qualified reliably in a simulated DOM.

## 13. End-to-end MVP suite

Keep the end-to-end suite small and high value. It must prove at least:

1. obtain a free-form human Contributor display name and create a blank document;
2. import a realistic Markdown fixture;
3. inspect and edit structure;
4. edit formatted inline content through semantic grouping;
5. create a semantic Checkpoint;
6. inspect and restore History;
7. export Markdown and re-import it to an equivalent Coedit document;
8. save `.coedit` and reopen it;
9. persist and reload through IndexedDB; and
10. recover safely from representative stale, failed-save, and malformed-open cases.

## 14. Traceability rule

Each MVP-contract scenario must link to one or more tests or qualification records before the MVP is declared complete.

When an implementation or specification changes a behavior that affects a recorded preserved decision, update `PRESERVED_BRANCH_RECONCILIATION.md` and the affected verification cases in the same change.
