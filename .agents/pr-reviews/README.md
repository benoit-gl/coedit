# Testing the PR Review Protocol

Start a fresh Codex session at the repository root. Use `gpt-5.6-sol` with medium reasoning effort for the coordinator, then send a prompt like:

> Run the repository iterative PR review protocol on the current branch versus `<base-branch>`. Include `<whether uncommitted changes are in scope>`. Keep me in the loop for material design choices, and otherwise continue until the workflow converges or reaches its stopping bound.

For a small, localized PR, `gpt-5.6-terra` at medium effort is a cheaper coordinator option. For a high-risk PR, keep `gpt-5.6-sol` and raise the coordinator to high effort only if triage or reconciliation is genuinely difficult. Reserve `gpt-6-astra` for exceptional architecture, security, or debugging ambiguity that the normal escalation path cannot resolve.

During the run, confirm that:

1. The coordinator creates or resumes a file under `.agents/pr-reviews/state/`.
2. Broad review rounds use fresh, read-only `pr_reviewer` agents.
3. Only `pr_fixer` changes source files, and only after findings are accepted.
4. Material choices are presented to you and then recorded in the state file.
5. Targeted verification and a fresh broad re-review occur after fixes.
6. The final report states whether the review converged, rather than equating a clean model response with proof.

The state directory is ignored by Git. Move a completed state record to a tracked documentation location only when you deliberately want it in repository history.
