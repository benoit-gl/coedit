# Repository configuration

**Status:** Active repository administration contract.

## Purpose and authority

This document defines the required GitHub configuration and trust assumptions for
the Coedit repository. It describes the steady state that repository
administrators must preserve.

[`../CONTRIBUTING.md`](../CONTRIBUTING.md) owns contributor-facing submission
rules. Workflow files own their executable behavior. This document owns the
repository settings that make those rules and workflows effective.

A pull request can introduce a setting that cannot become effective until its
workflow reaches `main`. In that case, the pull-request description must identify
the required post-merge transition. Apply that transition promptly after merge;
do not treat the temporary mismatch as an accepted steady state.

## Merge and protected-branch policy

The repository must allow squash merges only. Merge commits and rebase merges
must remain disabled. The pull-request title and description therefore become
the durable squash commit title and message.

The default branch is `main`. Changes to `main` must arrive through a pull
request. The active `main` ruleset must prevent branch deletion and
non-fast-forward updates, and it must allow no bypass.

Do not enable a merge queue until the required policy workflows support and
validate `merge_group` commits.

## Required checks

The `main` ruleset must require these status contexts from the GitHub Actions
source:

- `verify`;
- `adr-integrity`; and
- `pr-description`.

Require the pull-request branch to be current with `main` before merge. The
trusted-base policy workflows use the current base commit, and a later commit to
`main` does not itself trigger an existing pull request's
`pull_request_target` workflows.

Require the custom `adr-integrity` and `pr-description` commit-status contexts,
not the native `adr-integrity-enforcer` and `pr-description-enforcer` job
names.

CODEOWNERS is used for review routing. Keep Code Owner approval optional while
the repository has only one code owner; the pull-request author cannot provide
an independent approval of their own change. Revisit this setting if an
independent code owner becomes available.

## Actions trust boundary

The ADR-integrity and pull-request-description policies intentionally use
`pull_request_target`. Their workflow and checker code execute from the trusted
`main` commit. Candidate commits and pull-request metadata are untrusted data
and must not become executable input to those workflows.

An applicable GitHub Actions policy must explicitly permit the
`pull_request_target` event for these workflow paths:

- `.github/workflows/adr-integrity.yml`; and
- `.github/workflows/pr-description.yml`.

Scope that permission to these trusted workflows rather than enabling the event
for unrelated workflows. If an organization or enterprise policy also applies,
the effective policy at every level must permit these workflows.

Keep Actions token permissions at least privilege. A workflow that needs write
access must declare only the required permission explicitly. The policy
workflows require `contents: read` and `statuses: write`.

The custom status contexts share the GitHub Actions identity. Only trusted
maintainers may have repository access that lets them create same-repository
branches containing write-capable workflows. Accept contributions from other
contributors through fork pull requests. Re-audit this assumption whenever
collaborator access or Actions permissions change.

## Maintainer merge procedure

Before merging a pull request:

1. Confirm that the branch is current with `main`.
2. Confirm that `verify`, `adr-integrity`, and `pr-description` are successful
   for the current candidate head.
3. Inspect the current pull-request description after its final edit.
4. From the latest Pull-request description workflow run, use **Re-run jobs** and
   then **Re-run all jobs**.
5. Merge only while the current description remains valid and
   `pr-description` is successful for the current head.

The explicit rerun is required because GitHub does not bind pull-request
description edits atomically to the head commit. The workflow detects ordinary
edits and races, but it is a best-effort blocking gate rather than a security
boundary.

## Configuration changes and drift

When a pull request changes a policy workflow, CODEOWNERS behavior, merge policy,
or another setting owned by this document, update this document in the same
change.

After a new policy workflow first reaches `main`, or after a material
repository-configuration change, use a probe pull request to confirm that the
expected status contexts and event policies operate on the current head before
making a new context required.

Periodically compare the live GitHub configuration with this contract. Repeat
the check when collaborator access, Actions permissions or policies, required
checks, merge settings, or the `main` ruleset changes. If a required setting
cannot be changed atomically with a repository commit, record the post-merge
transition in that pull request and remove any obsolete transition text from
later pull requests once the live configuration matches this contract.
