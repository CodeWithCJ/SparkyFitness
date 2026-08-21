---
name: pr-review
description: Use whenever the user asks to review, vet, or sanity-check a pull request, or to act on the review comments already on one — a GitHub PR URL pasted with little or no instruction, a bare PR number, "review this PR", "is this PR safe", "can I merge this", "check this contribution", "any issues with #1234", "check the bot comments", "fix the CodeRabbit findings", "address the review comments", "update the PR if required". Runs the standing SparkyFitness review: supply-chain, phishing and code-provenance checks first, then architecture alignment with AGENTS.md and agent-docs, then logic, then the state of existing review-bot and reviewer threads. Reports to the terminal only.
---

# PR Review

Canonical copy. `.claude/skills/pr-review/SKILL.md` is a stub pointing here, the same way `CLAUDE.md` points at `AGENTS.md`.

The user's standing ask for every PR: is it safe (no phishing, scam, secret theft, or exfiltrated code), is it architecturally right, is it logically and technically correct, does it follow the `AGENTS.md` / `agent-docs/` conventions the core contributors wrote as the implementation contract, and were the existing review comments actually resolved. Don't make them repeat it.

Read `agent-docs/pr-review-checklist.md` at the repo root and work it in order — section A (trust & supply chain) before you read anything for quality.

Two rules that override the urge to be helpful:

- **Report only.** Never post a comment, approve, request changes, or merge unless the user asks in that same message. On someone else's PR, end with a paste-ready comment for the contributor (section F) — drafting it in chat is not posting it. On the user's own PR, skip the draft and just list what needs action.
- **Never execute an untrusted branch.** Reading a contributor's diff is safe; running it is not. Prefer `gh pr checks` as the test signal, and ask before checking anything out.

Read the surrounding files, not just the diff hunks. Most real findings in this repo are about what the diff *didn't* update: the missing RLS policy, the mobile consumer left behind, the write path that never invalidates the cache.
