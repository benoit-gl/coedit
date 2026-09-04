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

Verification claims must state evidence that actually ran against the current
pull-request head. Do not describe work as complete when a required gate has not
run successfully. If verification cannot run because of an external limitation,
keep the work explicitly incomplete and state which evidence is missing.

## Test requirements

New or changed behavior must have automated tests at the lowest meaningful
boundary described by the verification plan.

For each change:

- exercise the new successful behavior;
- exercise relevant failure paths and invariants;
- test documented limits and boundary conditions when they apply;
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

Do not suppress a lint, dependency, TypeDoc, or verification failure only to
make a gate pass. A required exception is a design change and must be documented
and reviewed as such.

Call out a new dependency, public API change, architecture-boundary exception,
lint or verification suppression, or toolchain-version change in the
pull-request description and state the reason. Do not add a separate process for
such a change unless an authoritative specification requires it.

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
state the resulting change and relevant verification, not temporary branch or
review-process status. Update the title or description during review whenever
the final change makes the existing text inaccurate or incomplete. Put
transient review notes in the pull-request conversation instead.

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
- run or obtain the required verification on the current head; and
- ensure that the pull-request title and description accurately state the final
  change and verification evidence.

## Generated output

Generated build output, generated API documentation, coverage output, caches,
and local diagnostic artifacts are not source. Do not modify or commit generated
files only to satisfy source checks.

After `npm run build`, `npm run check` must still pass. Generated `dist` output
must remain excluded from source linting and formatting as defined by the
engineering contract.
