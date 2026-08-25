# Coedit documentation

These documents describe the clean-slate application on `main`. Each document has one primary responsibility. This separation keeps domain meaning, prototype scope, component authority, future replication, and implementation order distinct.

## Current authoritative documents

| Document | Authority |
|---|---|
| [`PRODUCT_DOMAIN_MODEL.md`](PRODUCT_DOMAIN_MODEL.md) | Logical product ontology and domain vocabulary |
| [`MVP_CONTRACT.md`](MVP_CONTRACT.md) | Required proof boundary for the document-engine MVP prototype |
| [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) | MVP component authority, public engine behavior, and adapter workflows |
| [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) | Post-MVP collaboration, convergence, and causal History direction |
| [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) | Ordered implementation plan, concrete initial contracts, tests, and exit criteria |

All authoritative clean-slate documentation is available on `main`. An implementer does not need another branch to determine the current domain model or MVP boundary.

The documents have complementary scopes:

- the product/domain model says what the document concepts mean;
- the MVP contract says what the prototype must prove;
- the MVP architecture says which component may read or change durable state;
- the collaboration model says what a future replicated implementation must make converge; and
- the scaffolding plan says in which order to build and verify the prototype.

When documents overlap, use the authority above. In particular:

- an illustrative private type in the scaffolding plan does not override the public engine boundary in `MVP_ARCHITECTURE.md`;
- a prototype storage detail does not override the logical ontology in `PRODUCT_DOMAIN_MODEL.md`;
- the short capability list in `MVP_CONTRACT.md` does not replace the detailed implementation and test rules in the scaffolding plan; and
- the collaboration constraints in `COLLABORATION_MODEL.md` prevent local-only MVP details from becoming permanent distributed-system contracts.

## Preserved experimental evidence

The complete earlier implementation and its documentation remain on `tauri-experimental-orphan`. That branch is read-only evidence and a source of implementation examples. It is not current architecture and it is not an implementation base.

Useful preserved examples include domain utilities, tree invariants, tag normalization, rich-text sanitization, Yjs helpers, History tests, transition behavior, and recovery tests. The scaffolding plan identifies specific files and the intended reuse policy.

The preserved branch also contains obsolete current-model assumptions, including Tauri, SQLite, `DocumentNode`, title/body separation, the old `BlockContent` vocabulary, and the earlier portable format. Do not copy those assumptions into the clean-slate application merely to reuse an implementation.

Inspect preserved material without changing branches, for example:

```powershell
git show tauri-experimental-orphan:src/domain/tags.ts
git show tauri-experimental-orphan:src/domain/tree.ts
git show tauri-experimental-orphan:docs/TESTING.md
```

The recorded reference commit in the scaffolding plan can be used when reproducible inspection of the preserved state is required. Do not merge, rebase, or otherwise alter `tauri-experimental-orphan`.
