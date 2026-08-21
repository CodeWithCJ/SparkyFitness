---
name: pr-review
description: Use whenever the user asks to review, vet, or sanity-check a pull request — a GitHub PR URL pasted with little or no instruction, a bare PR number, "review this PR", "is this PR safe", "can I merge this", "check this contribution", "any issues with #1234". Runs the standing SparkyFitness review: supply-chain and data-exfiltration check first, then architecture alignment with AGENTS.md and agent-docs, then logic, then the state of existing CodeRabbit and reviewer comments. Reports to the terminal only.
---

# PR Review

See @.agents/skills/pr-review/SKILL.md — that is the canonical skill body. Read it and follow it.

Depth: one pass by default. If the user asked for a *deep*, *deeper*, or *thorough* review, follow the first pass with `/code-review high` scoped to the PR and fold its confirmed findings into the same report. `/code-review ultra <PR#>` is user-triggered and billed — mention it, don't launch it.
