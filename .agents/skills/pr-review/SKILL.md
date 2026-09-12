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

## Acting on review-bot feedback (CodeRabbit et al.)

When the user asks to *act on* bot feedback — "review the bot comments, fix if legit else reply, and resolve them" or similar — the **Report only** rule above is lifted for that PR: you may fix, reply, and resolve. Default standing workflow, so the user does not have to spell it out each time:

1. **Verify every finding against current source before acting.** Bots are often wrong, stale, or reasoning about a version/config that does not apply here. Trace the claim to the actual code or installed dependency (`node_modules/...`) and confirm it. Never fix or agree on the bot's say-so — and never post a claim you have not verified, because a public walk-back is worse than a slow reply.
2. **Legit → fix minimally, validate, reply.** Make the smallest correct change, run the affected package's `pnpm run validate` + tests, then reply on the thread stating what changed.
3. **Not legit, or a deliberate trade-off → reply, don't fix.** Explain the verified reasoning (why it doesn't apply, or why the naive fix is wrong for this deployment). A deployment-specific or heavy-lift item that can't be safely fixed inline: say so and note it as a follow-up.
4. **Don't invent version-specific workarounds when a real fix is already planned.** If the user is upgrading the dependency (or a proper fix is coming in another PR), defer to that and say so in the reply rather than shipping a band-aid tied to the old version. Confirm with the user before adding any CVE mitigation that the upcoming upgrade would make redundant.
5. **Resolve every thread you addressed** (fixed or replied) before committing back — GraphQL `resolveReviewThread` with the thread's node id (get ids via the `pullRequest.reviewThreads` query; the inline-comment REST id is not the thread id). Leave a thread open only if you're waiting on the user.
6. **Keep it clean and unattributed.** Replies and any commits follow the repo's zero-AI-attribution rule (see `pr-submission`). Outside-diff findings have no inline thread — answer them with one top-level PR comment.
7. **Keep unrelated changes out of the PR.** Fixes for the bot findings go in; tooling/skill edits or drive-by cleanups do not belong in a focused PR — leave those in the working tree for the user.
