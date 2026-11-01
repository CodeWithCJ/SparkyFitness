# Impact Analysis Checklist

Shared by the `issue-plan` and `enhancement-plan` skills; read `planning-ground-rules.md` alongside it. Answer every item in the plan; "n/a" needs a one-line reason.

## Existing users and data

- **Existing rows**: Does the change alter, reinterpret, or require backfilling existing data? Is the migration idempotent, and is the default safe for rows written before it?
- **Behavior change**: Will anyone who does nothing see different numbers, defaults, or screens after upgrading? If so, is it opt-in, or announced in the docs?
- **Stored units and dates**: Weights stay in kg, `YYYY-MM-DD` stay calendar-day strings (see `AGENTS.md`).
- **Old clients**: Mobile builds in the stores lag the server. Is the API change backward compatible with the previous mobile release? Additive fields only, unless a version gate is planned.
- **Sync and integrations**: Garmin, Fitbit, Withings, Health Connect, HealthKit, and other imports. Can they overwrite or duplicate the new data? Do they need a source-priority or dedupe rule?
- **Family sharing / permissions**: Which `family_access` permission guards it? RLS, owner-only domains, and read-only shares (`agent-docs/architecture-permissions.md`).
- **Library deletes**: Diary rows are snapshots; check the delete semantics in `AGENTS.md` if the change touches foods, exercises, presets, meals, or plans.

## MCP and AI chatbot

- MCP tools (`sparky_*`) and the AI chatbot / food assistant read and write the same domains. Does the change alter a tool's inputs, outputs, or semantics, or add data the tools should expose? Existing user prompts, saved MCP configs, and chatbot behavior must keep working.

## Deployment targets

- Docker, Helm, NixOS, bare-metal, Umbrel, reverse proxies. New env vars follow the "Environment Variable Updates" list in `AGENTS.md`.
- Server restart or migration ordering: does the web or mobile build depend on a server change shipping first?

## Cross-package

- Shared Zod schema in `shared/`, server route + service + repository, web, mobile. Which of the four are touched, and which consumer could be left behind?
- Cache invalidation: the full family of dependent query keys on web and mobile.
- i18n: only `SparkyFitnessFrontend/public/locales/en/translation.json` is hand-edited; mobile strings follow the mobile guide.

## Risk and rollout

- Performance: new queries on large tables (food/exercise entries, health data), indexes, N+1.
- Security and privacy: new user-supplied input, file uploads, health data leaving the server, third-party calls.
- Rollback: if it ships broken, can it be reverted without data loss?
- Size: S / M / L, and whether it should be split into more than one PR.

## Verdict line

End the plan with one line: **Impact: none / low / medium / high**, and the single biggest risk.
