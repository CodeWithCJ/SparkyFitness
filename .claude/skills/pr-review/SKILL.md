---
name: pr-review
description: Use whenever the user asks to review, vet, or sanity-check a pull request, or to act on the review comments already on one — a GitHub PR URL pasted with little or no instruction, a bare PR number, "review this PR", "is this PR safe", "can I merge this", "check this contribution", "any issues with #1234", "check the bot comments", "fix the CodeRabbit findings", "address the review comments", "update the PR if required". Runs the standing SparkyFitness review: supply-chain, phishing and code-provenance checks first, then architecture alignment with AGENTS.md and agent-docs, then logic, then the state of existing review-bot and reviewer threads. Reports to the terminal only.
---

# PR Review

See @.agents/skills/pr-review/SKILL.md — that is the canonical skill body. Read it and follow it.

Depth: one pass by default. If the user asked for a *deep*, *deeper*, or *thorough* review, follow the first pass with `/code-review high` scoped to the PR and fold its confirmed findings into the same report. `/code-review ultra <PR#>` is user-triggered and billed — mention it, don't launch it.
