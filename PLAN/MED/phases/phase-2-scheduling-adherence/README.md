# Phase 2 — Scheduling, Adherence & Reminders

> **Status:** ☐ not started
> **Depends on:** Phase 1 · **Unblocks:** richer 3/4/5
> **Resume here:** _(update as you go)_

## Goal
Turn the cabinet into a daily habit loop: a "Today" view to take/skip/snooze, an adherence
engine (%, streaks, grid), and reminders that actually fire.

## User stories
- As a user, I see today's due/overdue/PRN doses and tap **Take / Skip / Snooze** (auto-timestamp).
- I see my adherence % ring, current streak, and a 7/14-day colored grid.
- I get reminded when a dose is due, and a backup contact (MedFriend) is emailed if I miss one.

## Functional spec
- **Today view**: due list grouped by time, with context ("with water/breakfast"); quick-log from the Add menu.
- **Adherence engine**: compute taken/scheduled over a range → %, streak, per-day status; per-med breakdown. Timezone-aware (use `timezoneLoader.ts`, `YYYY-MM-DD` until boundary).
- **Reminders (corrected — no web-push today):**
  - Web: in-app due indicators + **opt-in email** via `services/emailService.ts`.
  - **Background scheduler/cron** computes due/overdue/missed (net-new server work — scope it here).
  - Native device push deferred to the mobile track (`expo-notifications`).
- **MedFriend**: backup contact, emailed on missed dose; off by default (sends to a third party — explicit consent + clear copy).

## Data needs
`medication_entries` (take/skip/snooze with snapshot), schedule rows from Phase 1, a scheduler job,
a MedFriend contact field/table, reminder preferences (lead time, channel).

## UI components
- New: TodayView, DoseRow, AdherenceRing, AdherenceGrid, MedFriendSettings, ReminderPrefs.
- Reuse: CheckIn page for the daily check-in (don't rebuild mood/sleep).

## Acceptance criteria
- [ ] Take/skip/snooze writes a log with a correct snapshot + timestamp.
- [ ] Adherence %/streak/grid match logged data across timezones.
- [ ] Due/missed detection runs on schedule; email reminder + MedFriend email send (test inbox).
- [ ] Reminders + MedFriend default off; opt-in flow clear.
- [ ] `pnpm run validate` + tests pass.

## Risks / notes
Scheduler is the main new infra. Confirm a cron/worker mechanism exists or add one. Keep email
templates i18n. Mobile push is a separate phase.

## Resume-here notes
_(breadcrumb)_
