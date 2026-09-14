# Iterative PR Review Workflow

Use this workflow only when requested by the user or required by `AGENTS.md`. The coordinator owns scope, triage, decisions, budget, integration, and the final report. Subagents provide bounded evidence or implement accepted work.

## 1. Establish scope and state

1. Determine the base and head revisions, the requested behavior, acceptance criteria, and whether uncommitted changes are in scope. Prefer the repository's documented base; otherwise determine the likely merge base and state the assumption.
2. Classify the review risk:
   - **Low:** small, localized, well-tested changes with no sensitive boundary.
   - **Medium:** cross-module behavior, persistence, public behavior, or a meaningful test gap.
   - **High:** authentication or authorization, secrets, migrations, concurrency, data loss, cryptography, broad public compatibility, or a large/unclear diff.
3. Create `.agents/pr-reviews/state/<branch-or-pr>.md` from `.agents/pr-reviews/STATE_TEMPLATE.md`, or resume the matching state file. State files are local working memory and are ignored by Git unless the user explicitly chooses to preserve one elsewhere.
4. Confirm that recorded scope and decisions still match the current diff. Mark stale entries rather than silently carrying them forward.
5. Run or inspect the cheapest useful baseline checks once. Record pre-existing failures.

## 2. Choose the least-cost review path

- **Low or medium risk:** spawn one fresh `pr_reviewer` for a broad read-only review.
- **High risk:** start with `pr_reviewer`, then use `pr_risk_reviewer` only for the matching high-risk surface or an uncertain/disputed finding. Independent duplicate review is justified only when the consequence warrants its cost.
- Do not spawn reviewers for mechanical facts already settled by reliable tooling.
- Do not send raw logs or the full conversation. Supply the diff/base, stable requirements, applicable repository rules, accepted decisions, and the minimum code context needed.
- For a blind broad re-review, provide requirements and accepted decisions but omit earlier reviewers' wording, rejected hypotheses, and claimed resolutions. This preserves independence without withholding ground truth.

## 3. Triage findings

The coordinator must validate and deduplicate findings before any edits.

- Use severities consistently:
  - **P0:** immediate catastrophic or actively exploitable failure; stop the workflow.
  - **P1:** likely serious correctness, security, data-loss, or compatibility failure.
  - **P2:** material defect or regression under a credible scenario.
  - **P3:** low-impact improvement; do not block convergence unless the user requests it.
- Assign a stable fingerprint based on invariant or behavior, location or component, and trigger. Reuse it when the same defect reappears under different wording.
- Record each finding as `proposed`, `accepted`, `rejected`, `deferred`, `fixed`, `verified`, `reopened`, or `stale`.
- Reject unsupported, duplicate, purely stylistic, pre-existing, or out-of-scope findings unless they materially affect the PR.
- Ask the user only when there are materially different valid fixes, a public behavior or API decision, a security tradeoff, an irreversible migration, conflicting requirements, or substantial scope expansion. Record the choice and rationale before continuing.

## 4. Fix accepted findings

1. Give one fresh `pr_fixer` the accepted finding IDs, evidence, acceptance criteria, relevant recorded decisions, and owned files. It is the only source-code writer for the round.
2. Do not ask the fixer to conduct another broad review. New suspected issues return to the coordinator for triage.
3. Review the resulting diff for scope discipline and update each accepted finding to `fixed` only when an implementation maps to it.

## 5. Verify and re-review

1. Use `pr_verifier` for focused verification and narrow tests when that work is routine. Escalate only an inconclusive or reasoning-heavy item.
2. Run one proportionate integration check after fixes; do not have every agent repeat the broad suite.
3. Spawn a fresh `pr_reviewer` for a blind review of the current complete diff.
4. Triage new findings and reopen any failed fixes. Begin another fix round only for accepted P0-P2 findings.

## 6. Stop conditions

Declare the loop converged only when:

- no accepted P0-P2 finding remains unverified;
- required deterministic checks pass, or any unrelated/pre-existing failures are explicitly recorded;
- one fresh broad review finds no new actionable P0-P2 issue; and
- the user has made every required material decision.

Default to at most three broad review rounds. Stop earlier when converged. If the bound, available budget, or practical context limit is reached, report the open findings and evidence; do not call the PR clean. A clean model review never replaces required human approval, CI, branch protection, or domain/security review.

## 7. Cost and final report

- Start with `gpt-5.6-terra` at medium effort for general review and fixing, and `gpt-5.6-luna` at medium effort for routine targeted verification.
- Use `gpt-5.6-sol` at high effort only for a specific difficult or high-risk review question. Escalate the uncertain subtask, not the whole workflow.
- Never increase fan-out merely to use available concurrency. Keep no more than three delegated threads active, and normally only one reviewer or writer at a time in this sequential loop.
- When available, record model and effort, rounds, accepted and rejected findings, retries, token or paid-tool usage, latency, and rework. Never invent unavailable usage data.
- Optimize for confirmed actionable findings and escaped-defect reduction, not raw finding count.
- The final report states: convergence status, reviewed diff/base, accepted and rejected findings, recorded decisions, changes made, verification evidence, remaining risks, known failures, rounds used, and available cost metrics.
