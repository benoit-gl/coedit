# Contributing to Coedit

This document defines the minimum submission standard for repository changes.
It does not replace the engineering or verification specifications.

Read these documents before you change implementation code:

- [`docs/CODING_STYLE.md`](docs/CODING_STYLE.md) for source, documentation,
  dependency, tooling, and command-line rules; and
- [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md) for required
  verification evidence and test coverage.

The authoritative documentation index is [`docs/README.md`](docs/README.md).

## Definition of done

Draft pull requests and development branches can contain incomplete, fixup, or
checkpoint commits. Intermediate branch commits do not have to pass all
repository gates. The final pull-request head must be a coherent repository
state before the pull request is ready for review or merge.

Use `npm run bootstrap` first on a clean checkout or when dependencies are not
installed. `npm run check` is the complete non-interactive source-verification
gate. It includes formatting, TypeScript, ESLint, dependency rules, API
documentation validation, and the complete default unit-test suite.

A pull request is complete only when its current head passes the repository CI
workflow. The canonical clean-checkout sequence is:

```text
npm run bootstrap
npm run check
npm run build
```

CI runs the same sequence and then runs `npm run check` again after the build to
verify that generated output does not affect source checks.

Verification claims must describe evidence that actually ran against the stated
revision. Do not describe work as complete when a required gate has not run
successfully. If verification cannot run because of an external limitation,
keep the work explicitly incomplete and state which evidence is missing.

## Test requirements

New or changed behavior must have automated tests at the lowest meaningful
boundary described by the verification plan.

For each change:

- exercise the new successful behavior;
- exercise relevant failure paths and invariants;
- test semantic boundaries and every selected or frozen resource guard and
  capacity-failure path when they apply;
- record experimental capacity or performance results without using an
  unpromoted candidate as a correctness failure;
- add a regression test for a corrected defect when practical; and
- keep existing tests passing without weakening assertions only to accept the
  new implementation.

A higher-level test does not replace a lower-level invariant or unit test. Do
not use a test-count or coverage-percentage target as a substitute for testing
the required behavior.

## Contract and documentation changes

Keep implementation, tests, TSDoc, and authoritative documentation consistent.
When a change modifies a documented contract, update all affected artifacts in
the same pull request.

Every finite capacity, resource, or performance number that affects acceptance,
rejection, compatibility, protection, or evaluation must follow
`docs/CAPACITY_AND_PERFORMANCE_TARGETS.md`. Identify its maturity, direct owner,
and promotion gate or change rule. A pull request that promotes an experimental
target or pending selection must include the supporting environment, evidence,
failure behavior, and tests. Do not make an experimental target fail
correctness CI or reject otherwise valid document state.

Do not suppress a lint, dependency, TypeDoc, or verification failure only to
make a gate pass. A required exception is a design change and must be documented
and reviewed as such.

Call out a new dependency, public API change, architecture-boundary exception,
lint or verification suppression, or toolchain-version change in the
pull-request description and state the reason. Do not add a separate process for
such a change unless an authoritative specification requires it.

## Architecture decision records

Follow the ADR lifecycle policy in
[`docs/decisions/README.md`](docs/decisions/README.md) when an architecture
decision changes. Preserve accepted ADR decision text as history. Use ADR status
and relationship metadata to record supersession instead of rewriting the old
decision. A later ADR that only refines or extends an accepted ADR does not by
itself require an edit to the older record.

The `adr-integrity` pull-request check enforces that policy. For every ADR already
present on the target branch, all content beginning with its first level-two
heading (`##`) is immutable. The check also rejects deletion of an existing ADR,
invalid supersession metadata, broken links in mutable ADR headers, and divergence
between ADR lifecycle classes in the metadata and decision index. Historical
links in immutable ADR bodies are deliberately not checked.

Run the same comparison locally after committing with:

```text
npm run adr:check -- --base-ref origin/main
```

## Pull-request workflow and hygiene

Use one pull request for one logical merge unit. Keep unrelated cleanup and
refactoring out of the change. Documentation and implementation that define one
contract can remain in the same pull request. Use a separate design pull request
when a design decision must be reviewed or accepted independently.

Open a draft pull request when the work becomes useful to share, preserve, or
review. Draft work can be incomplete and can contain temporary commits. Before
you mark it ready for review, make its final scope coherent and remove temporary
working state.

Pull requests are always squash-merged. Write the pull-request title and
description as the final squash commit title and message. The description must
state the resulting change, not temporary branch or review-process status.
Update the title or description during review whenever the final change makes
the existing text inaccurate or incomplete. Put transient review notes in the
pull-request conversation instead.

Treat the pull-request description as a durable change record. Describe the
resulting behavior and rationale, and identify any repository configuration or
manual setup that will still be required after merge. Do not add sections for
verification, testing, test plans, checks, CI status, command output, or review
progress. Required GitHub checks are the authoritative verification record. If
an exceptional manual observation is useful during review, put it in the
pull-request conversation instead of the final squash message.

Use Markdown headings in pull-request descriptions. Do not use raw HTML or HTML
character references in headings.

The `pr-description` pull-request check enforces the prohibited section names.
The pull-request template supplies the durable sections expected by this
repository; delete the optional post-merge section when no setup remains.

The `adr-integrity` and `pr-description` workflows execute the workflow and
checker versions from the protected `main` branch. They treat candidate commits
and pull-request metadata as untrusted data and publish policy results for the
candidate commit. A pull request can propose changes to a policy workflow or
checker, but those changes cannot govern that same pull request; they become
active only after merge.

GitHub does not version description edits with the pull request's head commit,
so `pr-description` is a best-effort blocking check rather than an atomic
security boundary. It serializes runs, fetches the current description, and
checks again for edits before reporting success, but a final edit can still
race the result. Before merging, inspect the current description and re-run the
latest Pull-request description workflow after its final edit. From that
workflow run in GitHub Actions, use **Re-run jobs**, then **Re-run all jobs**.
Only merge while the current description is valid and `pr-description` is
successful for the current head.

The `main` ruleset must require the custom commit-status contexts
`adr-integrity` and `pr-description` from the GitHub Actions source, not the
native `adr-integrity-enforcer` and `pr-description-enforcer` job names. It must
also require the branch to be current with `main`, because a later base-branch
commit does not itself trigger these workflows. Observe both custom contexts on
a probe pull request after the workflows first reach `main`, then make them
required. Keep Code Owner review optional while the repository has only one
code owner, and do not allow a ruleset bypass. The custom contexts share the
GitHub Actions identity. Before enabling them as required, audit repository
collaborators and Actions token settings and confirm that only trusted
maintainers can create same-repository branches with write-capable workflows.
Accept changes from everyone else through fork pull requests. Repeat that audit
whenever collaborator access or Actions settings change. Do not enable a merge
queue until these policies support and validate merge-group commits.

Branch history can be rewritten before merge. Coordinate before you force-update
a branch that another contributor is actively using or building on.

Submit only files that belong to the change. Remove temporary scripts,
diagnostic logs, local verification artifacts, generated output, and other
working files before review unless the repository explicitly requires them.

Before you mark a pull request ready for review:

- inspect the complete diff against its target branch;
- confirm that the final head is coherent and has no known broken state;
- confirm that no unrelated or generated files remain;
- confirm that all new or changed behavior has the required tests;
- confirm that implementation, tests, TSDoc, and authoritative documentation
  agree;
- confirm that new capacity/performance numbers have a maturity, owner, and
  promotion gate and that only promoted contracts drive correctness failures;
- run or obtain the required verification on the current head; and
- ensure that the pull-request title and description accurately state the final
  change.

## Generated output

Generated build output, generated API documentation, coverage output, caches,
and local diagnostic artifacts are not source. Do not modify or commit generated
files only to satisfy source checks.

After `npm run build`, `npm run check` must still pass. Generated `dist` output
must remain excluded from source linting and formatting as defined by the
engineering contract.
