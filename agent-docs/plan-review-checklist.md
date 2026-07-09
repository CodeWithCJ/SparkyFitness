# Plan Review Checklist

Before presenting an implementation plan for this repo, self-review it against these questions and fix any gaps.

- **Scope**: Does the plan stay inside the packages it needs? If it touches a package, did you read that package's `AGENTS.md`?
- **Layering**: Does it match the existing route -> service -> repository layering (server) or pages/api/hooks domain mirroring (frontend) instead of inventing parallel abstractions?
- **Duplication (rule of two)**: If the plan would repeat non-trivial logic a second time, does it extract a shared helper instead of copy-pasting? LLM-authored copies drift — don't wait for a third.
- **Database**: If it adds or changes a table or migration, does the plan include every step of `agent-docs/new-migration-checklist.md` (RLS, schema backup, shared Zod schema, docs tiers)?
- **Contracts**: If it changes an API request/response, does the plan cover the shared schema, the server route/schema, and both web and mobile consumers?
- **Dates/timezones**: Are `YYYY-MM-DD` values kept as calendar-day strings with shared timezone helpers (no `toISOString().split('T')[0]`)?
- **Auth**: If auth behavior changes, are both cookie sessions and API-key flows considered?
- **Validation**: Does the plan end with concrete validation — the specific tests to run plus `pnpm run validate` in each touched package?
- **Rewrite guard**: Does the plan modify the working implementation minimally rather than rewriting it, unless a rewrite was explicitly requested?
- **Guide upkeep**: If the plan adds a new domain, route family, or table, does it include updating the affected `AGENTS.md` sections?
