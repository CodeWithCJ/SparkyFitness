# Fork workflow (tonydarcy/SparkyFitness)

Fork-only guide, loaded from the root `CLAUDE.md`. It covers how work moves through this fork and how to keep a fix cheap to make. Repo rules in `AGENTS.md` still apply; where this file is more specific, it wins.

## Branches

- `main` is an exact mirror of upstream `CodeWithCJ/SparkyFitness`. Never commit or push to it; it changes only by syncing from upstream. Any other branch may be pushed without asking (see `AGENTS.md`).
- `tdmain` is the fork's production branch. Fork PRs target it.
- One branch per fix or feature, started from `origin/main` (`git fetch origin main && git checkout -b fix/<topic> origin/main`), so the same branch can be sent upstream unchanged. Name it `fix/<topic>` or `feat/<topic>`.
- If a session was handed a pre-named branch, start that branch from `origin/main` the same way for code fixes. Only fork-only changes (like this file) start from `origin/tdmain`.
- Never mix two fixes on one branch, and never merge `tdmain` into a fix branch. If a fix depends on another unmerged fix, say so instead of stacking it.

## Upstream

- Sessions can reach only the fork on GitHub, not upstream. Tony opens and edits upstream PRs and posts upstream comments himself, so hand him paste-ready text (PR title and body, reply text).
- Upstream PR rules (`.github/pull_request_template.md`, `pr-submission` skill):
  - Title starts with a type: `fix:`, `feat:`, `docs:`, `refactor:`, `security:` (a scope like `fix(mobile):` is fine).
  - Keep every template section and checkbox. Tick the mandatory Integrity box; tick the UI or Mobile boxes only when that proof exists, and say what Tony still needs to attach (screenshots, device test).
  - One SQL migration per PR, edited in place.
  - Unresolved review conversations fail the `Validate & Label` check. After addressing a CodeRabbit or maintainer comment, tell Tony which threads to resolve.
  - When a maintainer asks to drop or split part of a PR, do exactly that and nothing more.
- Commit messages and all upstream-bound text carry no AI attribution (see `AGENTS.md`).

## Working cheaply

Aim for one correct fix with as few reads and runs as possible.

1. Locate before reading. Use `agent-docs/file-and-domain-reference.md`, then `grep -rn` with `--include` for the package, then read only the line range you need. Never read whole package `AGENTS.md` files (400+ lines); grep them for the area you touch (`grep -n -i "<topic>" SparkyFitnessMobile/AGENTS.md`).
2. Read the call site and the closest existing test before editing. Copy the test's pattern rather than designing a new one.
3. Make the smallest change that fixes the cause. No drive-by refactors, renames or formatting outside the touched lines: they bloat the upstream diff and draw review comments.
4. Run checks only for the packages you changed, narrowest first:
   - One test file: `pnpm exec vitest run tests/<file>` (server), `pnpm exec jest <path>` (frontend, mobile; add `--watchman=false` on mobile).
   - Then the package's `pnpm run validate` once at the end. `shared/` changes also need validate in each consuming package.
   - Dependencies are not installed in a fresh cloud container. Run `pnpm install --frozen-lockfile` at the repo root once, only when you need to run checks.
5. Report results briefly: what changed, which checks ran, and anything Tony must test on a device.

## Known environment noise

- `SparkyFitnessServer/tests/outboundProxy.test.ts` fails in the cloud sandbox because the sandbox's own `HTTPS_PROXY`/`NO_PROXY` settings interfere. Ignore that failure; it passes in CI. Do not change the test or the proxy code because of it.
- Do not start the server or run migrations. Ask Tony to restart the server when a migration changes.

## Correctness traps seen on this fork

- Times shown as "Now", "Today" or "Tomorrow" must use the user's local time and calendar day, never UTC. Use the shared day helpers (`@workspace/shared`), not `toISOString().split('T')[0]`. Test date logic with a timezone far from UTC (for example `TZ=Pacific/Auckland`) so day-boundary bugs show up.
- Mobile UI changes need a device or emulator check that a session cannot do. State that as Tony's remaining step rather than ticking the box.
