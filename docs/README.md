# Coedit documentation

These documents describe the clean-slate application on `main`. They are split
by responsibility so that domain vocabulary, component boundaries, future
replication, and implementation order do not become one inseparable design.

## Current documents

| Document | Authority |
|---|---|
| [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) | Ordered implementation plan and exit criteria |
| [`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) | MVP component boundaries, public engine behavior, and adapter workflows |
| [`COLLABORATION_MODEL.md`](COLLABORATION_MODEL.md) | Post-MVP collaboration, convergence, and causal History direction |

Step 1 of the scaffolding plan will add `PRODUCT_DOMAIN_MODEL.md`. That document
will own the logical ontology (`Block`, `InlineContent`, tags, presentation,
provenance, and related concepts). Until it has been reviewed and copied to
`main`, inspect the preserved decision snapshot without checking out its branch:

```powershell
git show tauri-experimental-orphan:docs/PRODUCT_DOMAIN_MODEL.md
```

The documents have complementary scopes:

- the domain model says what the document means;
- the MVP architecture says who may read or change it;
- the collaboration model says what a future replicated implementation must
  make converge; and
- the scaffolding plan says in which order to build and verify it.

If an illustrative type in the scaffolding plan exposes a full snapshot, a
single head, a numeric sequence, or another prototype storage detail, the public
boundary in `MVP_ARCHITECTURE.md` takes precedence. The collaboration constraints
in `COLLABORATION_MODEL.md` take precedence over treating those local-only MVP
details as permanent contracts.

## Preserved experimental evidence

The complete earlier implementation and its documentation remain at the tip of
`tauri-experimental-orphan`. That branch is read-only evidence, not current
architecture and not an implementation base. In particular, its Tauri target,
SQLite persistence, `DocumentNode` format, and older content vocabulary are not
clean-slate commitments.

Read preserved files with `git show` or selectively copy a reviewed file from
the recorded reference commit as described in the scaffolding plan. Do not
merge, rebase, or otherwise alter the reference branch.
