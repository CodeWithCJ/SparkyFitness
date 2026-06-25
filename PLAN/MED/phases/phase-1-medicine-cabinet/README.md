# Phase 1 — Medicine Cabinet

> **Status:** ☐ not started
> **Depends on:** Phase 0 · **Unblocks:** 2, 5, 6
> **Resume here:** _(update as you go)_

## Goal
A usable, self-contained medication list: add any drug, define a flexible schedule, track
inventory and refills, and record (manual) cost. No external calls. **First shippable feature.**

## User stories
- As a user, I add a med (name, type, strength, dose, schedule, prescriber, pharmacy, Rx#).
- I set a flexible schedule (multiple times/day, specific weekdays, every-N-days, cyclic, PRN, with-meal).
- I track how many pills/doses are left and get a low-stock alert + refill-due estimate.
- I record why I take it (reason/condition) and rate effectiveness; optionally attach a pill/label photo.
- I manage a dependent's meds (caregiver), data private by default.
- I pick which KPI tiles show on the Cabinet.

## Functional spec
- Cabinet list of med cards (type badge, schedule, remaining + refill-in, low-stock badge, actions).
- Add/Edit form, **progressive disclosure** (advanced fields collapsible).
- Flexible schedule editor → writes `medication_schedules` rows.
- Inventory + low-stock threshold; refill-due from dose rate; per-type counting unit (pills/mL/pens/doses).
- Manual cost entry (clearly "self-entered"); `medication_cost_entries`.
- "Reason for taking" + effectiveness rating; pill/label photo via `uploadMiddleware`.
- Quick-add flag for common meds (like `is_quick_food`).
- KPI tiles driven by `user_medication_display_preferences`.
- "Call pharmacy" = `tel:` link (no API).

## Data needs
`medications`, `medication_schedules`, `medication_inventory`, `medication_cost_entries`,
`user_medication_display_preferences`. Photo storage via existing upload path.

## UI components
- New: CabinetList, MedCard, MedForm, ScheduleEditor, InventoryFields, CostFields.
- Reuse: `NumericInput`, `FoodUnitSelector` (unit pattern), `DateRangeWithPresets`, display-prefs UI pattern.

## Acceptance criteria
- [ ] Create/edit/delete a med with a multi-time + weekday schedule.
- [ ] Low-stock badge + refill estimate compute correctly.
- [ ] Manual cost saved + labeled self-entered.
- [ ] Caregiver can manage a dependent's med via on-behalf-of; default private enforced.
- [ ] Photo attaches; effectiveness + reason persist.
- [ ] i18n strings; `pnpm run validate` + tests pass.

## Resume-here notes
_(breadcrumb)_
