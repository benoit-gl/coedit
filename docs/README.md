# Coedit documentation

These documents describe the clean-slate application on `main`. Each document has one primary authority. This split keeps product meaning, MVP scope, architecture, implementation detail, work order, and future replication separate.

## Current authoritative documents

| Document | Authority |
|---|---|
| [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) | Logical product ontology and domain vocabulary |
| [`MVP_CONTRACT.md`](MVP_CONTRACT.md) | Required proof boundary for the document-engine MVP |
| [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) | Component authority, public engine behavior, and adapter workflows |
| [`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) | Concrete MVP technology choices, private implementation contracts, limits, test rules, and reuse guidance |
| [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) | Post-MVP replication, convergence, and causal History direction |
| [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) | RUP-inspired work order, phase gates, and completion criteria |

All authoritative clean-slate documentation is available on `main`. An implementer does not need another branch to determine current behavior.

Use the documents as follows:

- Use the product/domain model to determine what a document concept means.
- Use the MVP contract to determine what the prototype must prove.
- Use the architecture to determine which component can read or change durable state.
- Use the implementation specification to determine how to implement and verify the current MVP choices.
- Use the collaboration model to evaluate future replicated designs.
- Use the scaffolding plan to determine what to build next and when a phase can advance.

When documents overlap, use the document with direct authority for the subject. In particular:

- a private type in the implementation specification does not override the public engine boundary in `MVP_ARCHITECTURE.md`;
- a storage or codec detail does not override the logical ontology in `PRODUCT_DOMAIN_MODEL.md`;
- the implementation specification does not expand the required proof boundary in `MVP_CONTRACT.md`;
- the scaffolding plan does not define technical contracts; and
- local-only MVP implementation choices do not override the replication constraints in `COLLABORATION_MODEL.md`.

## Preserved experimental evidence

The earlier implementation and its documentation remain on `tauri-experimental-orphan`. That branch is read-only evidence and a source of implementation examples. It is not current architecture and is not an implementation base.

The implementation specification lists the preserved files that can provide useful behavior or test evidence. Examples include ID generation, tag normalization, tree invariants, rich-text sanitization, Yjs helpers, History behavior, editor transitions, and recovery tests.

The preserved branch also contains obsolete current-model assumptions. These include Tauri, SQLite, `DocumentNode`, title/body separation, the old `BlockContent` vocabulary, and the earlier portable format. Do not copy those assumptions into the clean-slate application only to reuse code.

Inspect preserved material without changing branches, for example:

```powershell
git show tauri-experimental-orphan:src/domain/tags.ts
git show tauri-experimental-orphan:src/domain/tree.ts
git show tauri-experimental-orphan:docs/TESTING.md
```

Use the recorded reference commit in `MVP_IMPLEMENTATION_SPEC.md` when reproducible inspection is required. Do not merge, rebase, reset, or otherwise alter `tauri-experimental-orphan`.
