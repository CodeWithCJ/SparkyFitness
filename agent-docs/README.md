# Agent Docs: Architecture & Patterns

This folder contains runbooks and architectural docs designed to answer complex questions without making agents scan 20+ files. Read these before asking "where do I start?" or "how does this work?"

## Quick Navigation

**New to the codebase?** Start here → [`file-and-domain-reference.md`](file-and-domain-reference.md) (5 min)
- Quick mental model: every feature has the same folder structure. Find code in seconds instead of scanning the whole repo.

**Need to understand how features are organized?** → [`file-and-domain-reference.md`](file-and-domain-reference.md) (tables + examples)
- Backend, Frontend, Mobile, Shared file paths for each domain (Medications, Foods, Sleep, etc.)

**About to write code and want to avoid common pitfalls?** → [`anti-patterns.md`](anti-patterns.md) (10 min)
- getSystemClient() vs getClient(), cache invalidation, timezone bugs, cross-package contract mistakes

**Understanding permissions and RLS?** → [`architecture-permissions.md`](architecture-permissions.md) (5 min)
- Permission types (diary, checkin, medications, cycle), RLS patterns, domain → permission mapping

**How does data flow through the stack?** → [`data-flow-patterns.md`](data-flow-patterns.md) (5 min)
- React/React Native → API → Server → Database, safe RLS patterns, auth context

**Writing tests and not sure where to start?** → [`testing-patterns.md`](testing-patterns.md) (15 min)
- Concrete examples for testing each layer: routes, services, repositories (with RLS), components, hooks

**Adding a new feature domain?** → [`new-domain-template.md`](new-domain-template.md) (10 min)
- 5 phases from schema to server to frontend to mobile to docs, with gotchas and examples

**Adding or changing a database table?** → [`new-migration-checklist.md`](new-migration-checklist.md) (2 min)
- 8 mandatory steps including RLS policies, backup script sync, Zod schemas, docs

**Planning server work or refactoring?** → [`plan-review-checklist.md`](plan-review-checklist.md) (2 min)
- Self-review checklist to catch architectural issues before code review

## Docs at a Glance

| Doc | Duration | When to Read | Key Takeaway |
|-----|----------|--------------|--------------|
| `file-and-domain-reference.md` | 5 min | Finding code by feature or domain | Every feature mirrors the same structure: Backend routes/services/repos, Frontend pages/api/hooks, Mobile screens/api/hooks, Shared schemas. Grep the feature name and you know where to look. |
| `architecture-permissions.md` | 5 min | Starting new feature or fixing auth bug | Permission types (diary, checkin, medications, cycle, reports) control family access; RLS enforces it |
| `data-flow-patterns.md` | 5 min | Understanding how packages talk | Frontend → Server → RLS-gated database; shared schemas are the contract |
| `testing-patterns.md` | 15 min | Writing tests for any layer | Route tests (supertest), service tests (mock repo), repository tests (real DB + RLS), component tests (@testing-library), hook tests (renderHook). Concrete examples for each. |
| `new-domain-template.md` | 10 min | Adding a feature domain (Fasting, Medications, etc.) | 5 phases: plan schemas, server routes/RLS, frontend, mobile, docs |
| `new-migration-checklist.md` | 2 min | Creating a table or altering migrations | 8 steps: migration, RLS, boot server, run backup script, Zod schema, docs, API contracts, validation |
| `anti-patterns.md` | 10 min | Before committing server/frontend/mobile code | Common mistakes: getSystemClient(), missing cache invalidation, timezone bugs, incomplete cross-package updates |
| `plan-review-checklist.md` | 2 min | Before presenting an implementation plan | Scope, layering, databases, contracts, auth, validation, rewrite guard, guide upkeep |

## For AI Tools: How to Use These Docs

- **On startup:** If you see a term you don't understand (permission type, RLS, domain template), read the relevant section above.
- **Before big changes:** Skim the anti-patterns doc. It answers "what do people get wrong here?"
- **On cross-package changes:** Run the new-domain-template or data-flow-patterns to verify your plan covers all layers.
- **On code review:** Use plan-review-checklist and anti-patterns as verification before saying "looks good."
- **When stuck:** Check the specific doc's "Common Gotchas" or "Exception" sections — usually you're asking one of the frequently-answered questions.

## Known Issues / TBD

- **Medications domain** — Routes and models exist, but shared schemas (`medication*.zod.ts`) are **missing**. This breaks the contract pattern. See [`architecture-permissions.md`](architecture-permissions.md) for the permission-type matrix with TBD notes.
- **Permission type for cycle/pregnancy/mood/sleep** — Not yet finalized. Check AGENTS.md Quick Routing notes for the current mapping.

If you spot a discrepancy between a doc and the code, fix the doc as part of your change.
