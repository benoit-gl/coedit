# Coedit documentation

These documents describe the clean-slate application on `main`. Each document has one primary authority. This split keeps product meaning, MVP scope, architecture, focused technical contracts, verification, work order, and future replication separate.

## Current authoritative documents

| Document | Authority |
|---|---|
| [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) | Logical product ontology and domain vocabulary |
| [`MVP_CONTRACT.md`](MVP_CONTRACT.md) | Required proof boundary for the document-engine MVP |
| [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) | Component authority, public engine behavior, and adapter workflows |
| [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) | Private MVP implementation rules that are not owned by a focused specification |
| [`MARKDOWN_INTERCHANGE.md`](MARKDOWN_INTERCHANGE.md) | Markdown import, export, diagnostics, and normalized round-trip behavior |
| [`PORTABLE_DOCUMENT_FORMAT.md`](PORTABLE_DOCUMENT_FORMAT.md) | Lossless `.coedit` version-1 wire format and hostile-input validation |
| [`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) | MVP test strategy, risk coverage, and qualification evidence |
| [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) | Post-MVP replication, convergence, and causal History direction |
| [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) | RUP-inspired work order, phase gates, and completion criteria |

All current design authority is local to `main`.

[`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) is a supporting traceability record. It classifies material decisions from `tauri-experimental-orphan` as retained, adapted, superseded, or deferred. It also identifies selectively reusable code and tests. It is not a competing design authority.

## Authority rules

Use the document with direct authority for the subject.

- A private implementation type does not override `MVP_ARCHITECTURE.md`.
- A codec or storage detail does not override `PRODUCT_DOMAIN_MODEL.md`.
- A focused Markdown or `.coedit` specification overrides duplicated technical wording elsewhere.
- `MVP_IMPLEMENTATION_SPEC.md` does not expand `MVP_CONTRACT.md`.
- `SCAFFOLDING_PLAN.md` owns order and gates, not detailed technical behavior.
- Local MVP shortcuts do not override `COLLABORATION_MODEL.md`.

When implementation evidence invalidates an accepted rule, update the responsible authority in the same change.

## Step 0 status

The documentation set is not yet an implementation-ready Step 0 baseline.

The concrete representation and update semantics of the opaque `TextAnchor` used by external formatting ranges remain open. The preserved branch treated Yjs relative positions as a plausible implementation, not a final decision. Do not infer an anchor representation from editor or CRDT convenience.

Step 0 closes only after that decision is recorded in the relevant authoritative documents and verification plan.

## Preserved experimental evidence

The earlier implementation and its documentation remain on `tauri-experimental-orphan`. The recorded reference tip is:

```text
f63ce8f59547dc0d84b5f086301ddaf4ee20a89b
```

The branch is read-only evidence and a source of selected behavior and tests. It is not current architecture and is not an implementation base.

Use [`PRESERVED_BRANCH_RECONCILIATION.md`](PRESERVED_BRANCH_RECONCILIATION.md) before copying or adapting preserved material. It records which decisions still apply and which preserved assumptions are obsolete.

Examples of useful evidence include tag normalization, tree invariants, semantic edit grouping, controlled editor transitions, History behavior, and recovery tests.

Examples of assumptions that are not current authority include Tauri, SQLite, `DocumentNode`, title/body separation, separate current `BlockContent`, and the old SQLite `.coedit` bytes.

Inspect preserved material without changing branches, for example:

```powershell
git show tauri-experimental-orphan:src/domain/tags.ts
git show tauri-experimental-orphan:src/editor/BodyEditBatchCoordinator.ts
git show tauri-experimental-orphan:docs/proposals/BODY_CHECKPOINT_STRATEGY.md
```

Do not merge, rebase, reset, or otherwise alter `tauri-experimental-orphan`.
