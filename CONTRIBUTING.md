# Contributing to Coedit

This document defines the minimum submission standard for implementation work.
It does not replace the engineering or verification specifications.

Read these documents before you change implementation code:

- [`docs/CODING_STYLE.md`](docs/CODING_STYLE.md) for source, documentation,
  dependency, tooling, and command-line rules; and
- [`docs/MVP_VERIFICATION_PLAN.md`](docs/MVP_VERIFICATION_PLAN.md) for required
  verification evidence and test coverage.

The authoritative documentation index is [`docs/README.md`](docs/README.md).

## Definition of done

Every commit that remains in a submitted pull request must be a valid repository
state. Do not submit a known-broken intermediate commit.

Before you push such a commit, verify that its contents pass:

```text
npm run check
npm run build
```

Use `npm run bootstrap` first on a clean checkout or when dependencies are not
installed. `npm run check` is the complete non-interactive source-verification
gate. It includes formatting, TypeScript, ESLint, dependency rules, API
documentation validation, and the complete default unit-test suite.

A pull request is complete only when the final submitted contents pass the
canonical clean-checkout sequence:

```text
npm run bootstrap
npm run check
npm run build
```

Do not describe work as complete when a required gate has not run successfully.
If verification cannot run because of an external limitation, keep the work
explicitly incomplete and state which evidence is missing.

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

## Pull-request hygiene

Submit only files that belong to the change. Remove temporary scripts,
diagnostic logs, local verification artifacts, generated output, and other
working files before review unless the repository explicitly requires them.

Before you mark a pull request ready for review:

- inspect the complete diff against its target branch;
- confirm that no unrelated or generated files remain;
- confirm that all new or changed behavior has the required tests;
- run the canonical verification sequence on the final contents; and
- ensure that the pull-request description states the implemented contract and
  the verification that actually ran.

Keep commits reviewable and bisectable. Do not retain a commit that fails the
repository gates, depends on a later fix to become valid, or leaves the source,
tests, and documentation intentionally inconsistent.

## Generated output

Generated build output, generated API documentation, coverage output, caches,
and local diagnostic artifacts are not source. Do not modify or commit generated
files only to satisfy source checks.

After `npm run build`, `npm run check` must still pass. Generated `dist` output
must remain excluded from source linting and formatting as defined by the
engineering contract.
