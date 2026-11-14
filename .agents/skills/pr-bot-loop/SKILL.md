---
name: pr-bot-loop
description: Use when the user has opened their OWN pull request and asks to watch it, monitor it, babysit it, or keep handling review comments until it is clean — "monitor the bot comments", "the AI bot is running, check after it finishes and fix", "keep checking CodeRabbit and fix until done", "watch my PR and address reviews". Waits for the review bots (CodeRabbit, Strix) to finish each run, fixes or answers every bot and human comment, pushes, and repeats until a finished run leaves nothing to change. Not for reviewing someone else's PR (use pr-review).
---

# PR Bot Loop

Canonical copy. `.claude/skills/pr-bot-loop/SKILL.md` is a stub pointing here, the same way `CLAUDE.md` points at `AGENTS.md`.

The user's standing ask: after they submit a PR, the review bots (CodeRabbit, plus Strix Security) take a while to post, and every push starts them again. Keep going round by round — wait for the run to finish, deal with every comment, push, wait again — until a finished run leaves nothing to change, without the user having to explain it again.

## When this applies, and what it allows

- **Only on the user's own PR that they asked to monitor.** Check the PR author (`gh pr view <n> --json author`) is the user's account, or the user said they opened it. For anyone else's PR use `pr-review` (report only).
- On such a PR, this loop **lifts the "never commit or push without asking" rule for fixes to that PR only**: commit and push each round's fixes to the PR branch without asking. Everything else still holds: zero AI attribution in commits, replies and PR text (see `pr-submission`), nothing unrelated in the PR (skill or tooling edits stay in the working tree), never force-push, never merge, never close.
- Comments from **bots and people** are both handled.

## Works with the other skills

This skill only adds the waiting and the round-by-round loop; it replaces nothing. Each fix is still ordinary work in this repo:

- Handle comments with `pr-review`'s "Acting on review-bot feedback" steps, and treat its checklist (`agent-docs/pr-review-checklist.md`) as the bar a fix must meet.
- Follow `AGENTS.md`, the package guides and `agent-docs/` for every change (strict typing, shared logic in `shared/`, timezone helpers, cache invalidation, docs and guide updates).
- Use the skill that covers what a fix touches: `new-migration` for any SQL or schema change (one migration per PR, edited in place), and `issue-plan` or `enhancement-plan` when a comment turns out to be a bigger bug or feature that needs a plan and the user's decision.
- Commits, replies and PR text follow `pr-submission` (no AI attribution, conventional messages).

## The round

1. **Wait for the bots on the current head commit.** Use whatever the tool offers for waiting without blocking (in Claude Code, a background shell task that exits when the condition is met, written for the shell it runs in: bash or zsh on macOS and Linux, Git Bash or PowerShell on Windows; elsewhere, the tool's own scheduler, or a loop the user runs in a terminal). Never sit in a foreground sleep, and don't keep checking by hand in the meantime.

   - **Check every 5 minutes.** Review time grows with the size of the change, so never wait a fixed time.
   - **Done** when CodeRabbit's check for the _current head commit_ has completed with a successful review conclusion (do not treat a skipped, rate-limited, or failed check as a clean review). Note the head commit when the wait starts (after a push, that is the commit just pushed), and wait about a minute before the first check, because right after a push the previous run's green result is still showing. Strix reviews only when the PR is opened or a re-run is asked for, so it counts as done when it has no check on that commit or its check has finished. After CodeRabbit finishes, wait about another minute: its comments can land just after the check turns green.
   - **Stop early** when the PR is closed or merged, or when the head commit changes under you (someone else pushed: fetch it and start this step again on the new commit before touching anything).
   - **Give up after about 90 minutes.** Look for CodeRabbit's own PR comment saying the review was skipped, paused or rate limited, tell the user, and stop. Don't post `@coderabbitai` commands unless the user asks.

   The facts the wait needs, from the repo directory with `gh` signed in. Each is one line with single quotes, so it runs the same in bash, zsh, Git Bash and Windows PowerShell; `gh` fills in `{owner}/{repo}` from the repo and filters the JSON itself (`--jq`), so nothing else needs installing:

   ```bash
   gh pr view <n> --json state,headRefOid
   gh api --paginate 'repos/{owner}/{repo}/commits/<sha>/check-runs' --jq '.check_runs[] | select(.name|test("CodeRabbit|Strix";"i")) | "\(.name) \(.status) \(.conclusion)"'
   ```

   The first says whether the PR is still open and which commit is the head; the second lists the bots' checks on that commit.

   CodeRabbit and Strix report as check runs on the commit (`status` goes `queued` → `in_progress` → `completed`). No CodeRabbit line for the new commit means its run has not registered yet.

2. **Collect everything still open** — not only the newest comments:
   - Review threads with their node ids via GraphQL (query `pullRequest.reviewThreads(first: 100) { nodes { id isResolved comments(first: 100) { pageInfo { hasNextPage } totalCount nodes { author { login } body path line createdAt } } } }` and paginate if `pageInfo.hasNextPage` is true, so both the original finding in `comments[0]` and all subsequent replies are fetched before inspecting the latest author). Check every unresolved thread, plus any resolved thread whose last comment is not from the user's account (a bot or person answered a reply, so it needs another look; reopen it with `unresolveReviewThread` if it needs more work).
   - Review bodies and top-level PR comments since the last round: CodeRabbit puts "outside diff range", "nitpick" and "duplicate" findings in the review body, not in threads; Strix posts findings as a review or comment.
   - Failing CI checks (`gh pr checks <n>`). A red check is part of the round too.
   - Merge state (`gh pr view <n> --json mergeable,mergeStateStatus`). On a conflict with `main`, do not rebase, merge `main` in or force-push on your own: tell the user and ask how to update the branch.

3. **Handle each item with `pr-review`'s "Acting on review-bot feedback" steps**, for bots and people alike: verify the claim against the current code before acting; fix a valid one minimally; reply with the verified reason for one that is wrong or a deliberate trade-off; resolve every thread you answered. A human's comment that asks for a product or scope decision goes to the user instead — ask, and wait for the answer before acting on that item.

4. **Validate and push once per round.** Run `pnpm run validate` and the tests of each package the fixes touched. Inspect `git diff --staged` before staging to ensure the index is clean; if unrelated changes or staged edits were already present before the round began, ask the user how to proceed (e.g. stashing or separating them) rather than overwriting or committing them together. Then stage only the files the round's fixes changed, by name (`git add <files>`, never `git add -A` or `.`). If a touched file also has unrelated working-tree edits, inspect `git diff` and stage only the fix hunks (`git add -p`), or ask the user how to handle overlapping edits rather than committing unrelated changes; skill, tooling or other unrelated files sitting in the working tree must never ride along (those go in a separate PR). Commit all of the round's fixes together (`fix(<scope>): address review feedback` plus one bullet per change, no attribution) and push to the PR branch. Then reply on the threads you fixed with what changed (and the short commit sha) and resolve them; answer review-body findings with one top-level comment.

5. **Decide whether to go round again.**
   - **Pushed anything** → the bots run again: start step 1 again.
   - **Pushed nothing, but CI checks are still pending/running** → wait for them to finish (check every 5 minutes as in step 1), then return to step 2 to collect the updated checks, handle any failures, and reassess.
   - **Pushed nothing, every thread resolved, every check green, and the bots finished on the current head commit** → done. Report the rounds (what was fixed, what was answered, what is waiting on the user) and send a short push notification, since the user is likely away.
   - **Waiting on the user** (a decision or an approval) → stop, ask, and resume from step 2 once they answer.

## Keeping it honest

- Never fix or agree on a bot's say-so, and never reply with something you have not checked in the source; a public walk-back is worse than a slow reply.
- Do not reply to or resolve a thread you did not actually address; leave it open and list it for the user.
- Between rounds, keep chat updates to a line or two (round number, what changed, waiting). The final report carries the detail.
- The loop runs with no round limit until it is clean or the user says to stop.
- The background wait lives only as long as this Claude Code session. If the session ends, nothing is watching; the user restarts it with `/pr-bot-loop <PR>`, and the loop resumes from step 1 (wait for the current head), then step 2 (collect what is open now).
