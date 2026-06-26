# Log tab — consolidate the 3 confusing sections

**Problem (user report):** the Log (Today) tab has **three** sections that look similar but
behave differently, and meds added via Cabinet don't appear where expected. The names don't
explain the difference.

All logic lives in `SparkyFitnessFrontend/src/pages/Medications/Medications.tsx` (the Today view),
plus the GLP check-in card `GlpDailyCheckIn.tsx`.

---

## What each section actually is today (verified)

| Section | Data source | Rule | Purpose |
|---|---|---|---|
| **Scheduled Doses** | `dueDoses = getDueDosesForDate(meds, selectedDate)` (from `@workspace/shared` `medications/schedules.ts`) | active meds that have a **concrete schedule** (daily/weekly/specific_days/every_n_days/cyclic/monthly) **due on the selected date**. PRN schedules are excluded. | The to-do list of doses due that day → **Take / Skip / Snooze** |
| **Log As Needed (PRN)** | `prnMeds = meds.filter(...)` | active meds that have **no schedule at all** OR have a **`prn` schedule**. (`!m.schedules?.length \|\| schedules.some(s => s.schedule_type_id === 'prn')`) | One-tap log of an as-needed dose |
| **Today's Intake History** | `entries = useMedicationEntries({fromDate: selectedDate, toDate: selectedDate})` | the actual logged `medication_entries` for that date (snapshots of what was **taken/skipped/prn_taken**) | The **record** of what happened today (with delete/undo) |

**Key insight:** the first two are **"things to log"** (actions); the third is **"what was
logged"** (the record). Taking a Scheduled dose or logging a PRN dose *creates* a row that then
appears in Intake History.

### Why "meds added via Cabinet don't show"
- A med added in Cabinet **with no schedule** → falls into **PRN** (because of the
  `!m.schedules?.length` branch). Users don't expect a plain med to be labeled "PRN".
- A med added **with a schedule** only shows under **Scheduled Doses on days it's actually due**
  (respects `start_date`/`end_date`/weekday/interval). If the schedule's first due day is in the
  future or the day doesn't match, it shows **nowhere** that day → looks "missing".
- The med **list endpoint already includes `schedules`** (`medicationRepository.listMedications`
  aggregates them), so this is a UX/labeling problem, not a data-fetch bug.

---

## Goal: 3 sections → 2 clear zones

Collapse "Scheduled Doses" + "Log As Needed (PRN)" into **one "Today's medications" card** (things
to log), and rename "Today's Intake History" to **"Logged today"** (the record). Result: a clear
mental model — **top = what to take, bottom = what you took.**

### Zone A — "Today's medications" (one card, two labeled groups)
- **Due today** group: the `dueDoses` rows with Take / Skip / Snooze (unchanged behavior).
  - When a dose is logged, show it as ✓ done (it already moves to Intake History; also grey it out here).
- **As needed** group: the `prnMeds` rows with a single **"Log dose"** button.
  - Sub-label clarifies: "Tap to log a dose now (no fixed schedule)."
- **Coverage guarantee:** every active med is reachable — if it has a due dose today it's in *Due
  today*; otherwise it's in *As needed*. Add a one-line helper when *Due today* is empty:
  "No scheduled doses today — log any medication as-needed below."
- Optional: a tiny **mode badge** on each row (`Scheduled` vs `PRN`) so it's self-explanatory.

### Zone B — "Logged today" (rename of Intake History)
- Same `entries` data + delete. Just rename the title to **"Logged today"** with subtitle
  "Everything you've taken or skipped on this date."
- Keep the colored CheckCircle header icon already added.

---

## Implementation steps (for Antigravity)

1. **Merge the two action cards** in `Medications.tsx` (the `Scheduled Doses` card ~line 1631 and
   the `Log As Needed (PRN)` card ~line 1769) into a single `<Card>` titled **"Today's medications"**
   with two `<div>` groups ("Due today" / "As needed"), reusing the existing `dueDoses.map(...)` and
   `prnMeds.map(...)` row markup.
2. **Exclude already-PRN-scheduled meds from showing twice:** a med can be in `dueDoses` (a real
   scheduled dose) — it must **not** also appear under "As needed". Current `prnMeds` already only
   includes no-schedule or `prn` meds, so a daily-scheduled med won't double-list; keep that. But a
   med with **both** a daily and a PRN schedule could appear in both — that's acceptable (it *is*
   both), but consider de-duping by med id if it looks odd.
3. **Empty-state copy:** if `dueDoses.length === 0`, render the helper line above the As-needed group
   instead of the current standalone "No medication doses scheduled" card.
4. **Rename** "Today's Intake History" → **"Logged today"** (CardTitle + the empty-state text
   "No entries logged yet today.").
5. **Mode badge (optional):** add a small `Badge` (`Scheduled` / `PRN`) on each action row.
6. Keep all date-filter behavior tied to `selectedDate` (already correct).
7. Keep the colorful header-icon chips already added (Clock / Pill / CheckCircle).

### Layout note
Current grid is 2-column (left = actions, right = history). After merge: left column = the single
"Today's medications" card (Due today + As needed); right column = "Logged today". The KPI stat card,
"Today's Checklist" banner, and GLP-1 check-in stay above, unchanged.

---

## Stretch option (nicer, more work): single unified timeline
Instead of two zones, render **one "Today" list** where each scheduled slot is a checkbox row that
flips to a struck-through "done" state in place when taken (no separate history), plus an "+ Log a
dose" affordance for PRN. This most closely matches consumer med apps but is a larger refactor —
do the 2-zone version first.

---

## Acceptance criteria
- [ ] Log tab shows **two** action concepts, not three: "Today's medications" (Due today + As needed) and "Logged today".
- [ ] A Cabinet med with **no schedule** clearly appears under **As needed** (not a mysterious "PRN").
- [ ] A scheduled med appears under **Due today** on days it's due; on non-due days it's reachable via As-needed or clearly absent with the helper copy.
- [ ] Logging a dose (scheduled Take or PRN) makes it appear under **Logged today**.
- [ ] `cd SparkyFitnessFrontend && pnpm exec tsc --noEmit` clean; `pnpm exec eslint src/pages/Medications/Medications.tsx` clean; `pnpm exec prettier --write` the file.

## Files
- `SparkyFitnessFrontend/src/pages/Medications/Medications.tsx` (Today view: the 3 cards + `dueDoses`, `prnMeds`, `entries`, `completedDosesCount`).
- Reference only: `shared/src/medications/schedules.ts` (`getDueDosesForDate`).
