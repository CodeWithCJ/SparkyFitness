# Phase 3 — Check-in page (GLP daily metrics) — DETAILED

**Goal:** add the mockup's daily GLP check-in metrics into our **existing Check-in page** (do NOT
duplicate them under the Medication tab).

## Where it lives
- Page: `SparkyFitnessFrontend/src/pages/CheckIn/CheckIn.tsx`.
- Existing check-in data: `src/api/CheckIn/checkInService.ts`, `moodService.ts`, `sleep.ts`; server `mood_entries`, `sleep_entries`, and `custom_measurements`/`custom_categories` tables.
- **First step:** open `CheckIn.tsx` + `checkInService.ts` to see how mood/sleep are currently captured and stored.

## ✅ VERIFIED (this session): storage already exists — decision made
`CheckIn.tsx` delegates to `CheckInForm` + `useCheckInLogic` (`src/hooks/CheckIn/useCheckInLogic.ts`)
and already renders/saves **custom measurement categories** (numeric daily values via
`custom_categories` + `custom_measurements`). So hunger/food-noise/fullness/energy can be logged
TODAY as custom categories — **real storage, no new table, no fake data.** Use this path.

**Remaining work (focused follow-up, ~1 session):**
1. Seed built-in GLP categories `hunger`, `food_noise`, `fullness`, `energy` (numeric 0–10) so they
   appear pre-labeled. Look at how `custom_categories` defaults/seeds are created; add these as
   built-ins (server seed or a one-time client-side ensure-exists on the Medication/Check-in mount).
2. In `Glp1Coach.tsx`, wire the hunger/food-noise/fullness stat-tiles (currently placeholders) to read
   today's values for those categories via the existing measurement query.
3. Optional: a "24h post-dose" prompt for GLP users (show only if a GLP injection was logged ~24h ago,
   from `useMedicationInjections`).
Do all edits behind typecheck/lint/prettier; **do not break the existing Check-in save flow** —
read `useCheckInLogic.ts` fully before touching it.

## (original) Data decision (now resolved above — kept for context)
The mock's GLP check-in tiles are **hunger / food-noise / fullness / energy / cravings**. Check
whether storage exists:
- `mood_entries` only stores a single `mood_value` — NOT these metrics.
- **Recommended approach:** store each metric through the **existing `custom_measurements` /
  `custom_categories`** system (the app already supports user-defined numeric daily measurements —
  see migrations `..._add_text_measurements`, `..._add_display_name_to_custom_categories`). Create
  built-in categories `hunger`, `food_noise`, `fullness`, `energy` (numeric 0–10) and write daily
  values there. This needs **no new table**.
- If reusing `custom_measurements` is too involved, the fallback is a small new table
  `glp1_checkin_entries(user_id, entry_date, hunger, food_noise, fullness, energy, cravings)` —
  but that's a backend addition; prefer the custom_measurements route.

## Tasks
1. Decide the storage path above (prefer `custom_measurements`).
2. Add a **GLP daily check-in card** to `CheckIn.tsx` with 0–10 sliders/tiles for hunger,
   food-noise, fullness, energy (reuse the existing slider/tile styling already on the page).
3. Persist on save; load today's values on mount.
4. Optional: a "24h post-dose" prompt shown for GLP users (only if a GLP injection was logged ~24h ago — read `useMedicationInjections`).
5. Surface these to Medication/Reports later (the GLP coach stat-tiles in `Glp1Coach.tsx` currently have placeholders for hunger/food-noise/fullness — wire them to read these values once stored).

## Acceptance
- Check-in captures the GLP metrics, persists across reload, and is the single source (no duplicate UI under Medication).
- Typecheck/lint/prettier clean on `CheckIn.tsx`.
