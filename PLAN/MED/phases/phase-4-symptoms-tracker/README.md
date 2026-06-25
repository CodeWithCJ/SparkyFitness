# Phase 4 — Symptoms & Side-Effects Tracker

> **Status:** ☐ not started
> **Depends on:** Phase 0 · **Unblocks:** pattern insights in 5
> **Resume here:** _(update as you go)_

## Goal
Precise side-effect logging (GLP-1 GI events especially), with custom symptoms, a body-map pin,
the Bristol stool scale, and light rule-based pattern hints.

## User stories
- As a user, I log a symptom from quick chips or define my **own** symptom (name, scale, unit).
- I set severity, pin where it hurts, and note what/when I ate relative to a dose.
- I log Bristol stool type daily and see a weekly average + a fiber/water tip.
- I review a symptom-history calendar and per-day logs, and see simple pattern hints.

## Functional spec
- Symptom chips (GLP-1-flagged) + **custom symptoms** mirroring `user_custom_nutrients` + `custom_categories(data_type, display_name)`.
- Severity sliders; free-text context; **body-map pin** (location string).
- **Bristol stool scale** 1–7 with weekly avg + tip.
- **GI sub-tracker** (nausea onset, episodes/week, vomiting, GERD).
- **Symptom history** calendar with per-day dots + log list.
- **Pattern hints** = rule-based stats over logged data (e.g., "nausea peaks 24–48h after dose increase"), **not ML**; honest, dismissible.
- **Vitals reuse:** BP/HR/temp via existing `custom_measurements`/`text_measurements`, not new tables.

## Data needs
`user_custom_symptoms`, `symptom_entries` (with snapshot, bristol_type, body_location). Reads
`medication_entries` (dose changes) for pattern hints.

## UI components
- New: SymptomChips, CustomSymptomForm, SeveritySlider, BodyMapPin, BristolScale, SymptomCalendar, PatternHints.
- Reuse: custom-measurements UI for vitals; date controls.

## Acceptance criteria
- [ ] Log built-in + custom symptom with severity, location, context.
- [ ] Bristol entry + weekly average correct.
- [ ] Calendar + per-day list render from logs.
- [ ] At least one pattern hint computes correctly from real data.
- [ ] Custom symptom uses stable `name` + editable `display_name`.
- [ ] `pnpm run validate` + tests pass.

## Optional / can drop
Weather/barometric-pressure context (needs a fetch) → opt-in or skip. Cycle-day context only if
the user already tracks it.

## Resume-here notes
_(breadcrumb)_
