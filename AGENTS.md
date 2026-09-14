# Workspace Agent Guidelines

## Cost-conscious parallel delegation

- Use subagents when work divides into concrete, independent, bounded workstreams and parallel execution is likely to improve speed or quality.
- Start with at most three concurrent subagents. Increase fan-out only when additional workstreams are genuinely independent and worthwhile.
- Keep one capable coordinator responsible for planning, assigning non-overlapping scopes, integrating results, and producing the final response.
- Prefer the least expensive model that can reliably complete each assignment:
  - Use `gpt-5.6-luna` at low or medium reasoning effort for bounded exploration, inventories, routine checks, test execution, mechanical edits, and extraction.
  - Use `gpt-5.6-terra` for ordinary implementation, analysis, and substantive review.
  - Use `gpt-5.6-sol` or `gpt-6-astra` for ambiguous architecture, difficult debugging, high-risk review, or final reconciliation when a less expensive model is insufficient.
- Escalate only the failed or uncertain subtask to a stronger model; do not rerun the entire workflow by default.
- Pass each subagent only the requirements, paths, files, and recent context it needs. Prefer context-free or limited-history forks when supported; include full history only when it is essential.
- Give each subagent a unique deliverable and clear ownership. Avoid overlapping writes and duplicate investigation unless independent replication is valuable for a high-stakes decision.
- Require concise, evidence-based results: findings, file and line references, commands run, failures, and recommended action. The coordinator performs synthesis.
- Avoid subagents for small tasks, ordered chains where each step depends on the previous result, work centered on one shared mutable resource, or work dominated by one slow external operation.
- Stop, redirect, or reuse agents whose assignments become redundant. Avoid deep agent trees unless the decomposition clearly justifies them.
- Run one proportionate integration and verification pass after merging results. Do not have every agent repeat the same broad test suite.
- Optimize for cost per successful task. When metrics are available, track uncached input, cached input, output and reasoning tokens, paid tool calls, retries, latency, and rework.
- In API orchestration, keep reusable instructions and shared context in a stable prompt prefix so supported prompt caching can reduce repeated input processing.

## Iterative PR review

- When the user requests an iterative PR review, review-until-converged workflow, or the repository review protocol, read and follow `.agents/pr-reviews/WORKFLOW.md` before starting.
- Keep the primary agent as coordinator and decision owner. Use fresh subagent contexts for broad review rounds so earlier hypotheses do not anchor later reviews.
- Preserve requirements, accepted user decisions, and verified facts in the review state file. Do not rely on chat history to carry them between rounds or invocations.
- Reviewers are read-only. Use only one source-code writer at a time, and give the writer only accepted findings and recorded decisions.
- Use the standard low-cost path first: one general reviewer, one fixer when needed, targeted verification, and one fresh re-review. Add focused reviewers or stronger models only for matching risk signals or unresolved uncertainty.
- Keep the user in the loop for materially different valid fixes, public behavior or API changes, security tradeoffs, irreversible migrations, conflicting requirements, or substantial scope expansion. Record the user's choice before fixing.
- Do not treat a clean model review as sufficient evidence. Require proportionate deterministic checks and preserve human ownership of final acceptance and merge.
- A plain request to review code means one read-only review pass. Do not start the iterative fixing workflow or modify files unless the user requests it.

References:

- https://developers.openai.com/api/docs/guides/responses-multi-agent
- https://developers.openai.com/api/docs/guides/prompt-caching
- https://developers.openai.com/api/docs/models
