# 03 — Navigation & UX

Where the module lives in the app and which existing pieces it reuses. Grounded in the real
frontend structure (`SparkyFitnessFrontend/src`).

## How navigation works today (verified)

- Routing: **TanStack Router** via `router.tsx` + `<RouterProvider>` in `App.tsx`.
- Nav: `layouts/MainLayout.tsx` builds a `tabs` array of `{ value: '/route', label: t('nav.x'), icon }` — **separate desktop and mobile tab lists**, plus a quick-log **"Add"** menu driven by meal types.
- Existing tabs: Diary `/`, Check-In `/checkin`, Reports `/reports`, Foods `/foods`, Exercises, Goals `/goals`, Settings `/settings`, Admin `/admin`.
- Icons: `lucide-react`. Labels: **i18n** via `t('nav.key', 'Fallback')`.

## Where Medications goes

- New top-level route **`/medications`** (TanStack route + page under `pages/Medications/`).
- New tab `{ value: '/medications', label: t('nav.medications', 'Medications'), icon: Pill }` added to both desktop and mobile tab builders in `MainLayout.tsx`.
- **Feature flag:** gate the tab + route behind a setting (e.g., `user_preferences.medications_enabled` or a global setting) so it can ship dark and be toggled in Settings — consistent with how optional features are exposed.
- Quick-log: add a "Log dose" / "Log injection" entry to the existing **Add** quick menu so users can log without navigating.

## Page layout (sub-tabs mirror the mockup's 7 screens)

`pages/Medications/` with internal sub-navigation:

| Sub-tab | Mockup screen | Phase |
|---|---|---|
| **Today** | Today | 2 |
| **Cabinet** | Cabinet | 1 |
| **GLP-1** | GLP-1 | 3 |
| **Symptoms** | Symptoms | 4 |
| **Wellness** | Wellness | reuse CheckIn data; light page |
| **Insights** | Insights | 5/7 |
| (Vitals) | Vitals | reuse `custom_measurements` UI |

Keep Phase 1 shipping with just **Cabinet** (+ a stub Today); reveal sub-tabs as their phases land.

## Reuse map (don't rebuild)

| Need | Reuse | Path |
|---|---|---|
| Charts | recharts + Reports patterns | `pages/Reports`, `components/ui/chart.tsx` |
| Mood / sleep / energy / hunger check-in | CheckIn page + `mood_entries` / `sleep_entries` | `pages/CheckIn`, `types/checkin.ts`, `types/mood.d.ts` |
| Protein-first food logging, barcode | Foods / Diary | `pages/Foods`, `components/FoodSearch/` |
| Weight / measurements / goals context | existing measurements + Goals | `pages/Goals`, `custom_measurements` |
| Vitals (BP/HR/temp) | custom measurements (numeric + text) | `custom_measurements`, `text_measurements` |
| Numeric inputs, unit selector | shared inputs | `components/NumericInput.tsx`, `components/FoodUnitSelector.tsx` |
| Date range + presets | shared control | `components/ui/DateRangeWithPresets.tsx` |
| Display-preference pattern | nutrient display prefs UI | mirror `user_nutrient_display_preferences` UI |
| Photo upload (pill/label) | upload middleware | server `middleware/uploadMiddleware.ts`, `checkInPhotoUpload.ts` |
| Notifications (email) | email service | server `services/emailService.ts` |

## UX principles (from the mockups, kept honest)

- **Fast logging first.** Today view: tap to take/skip/snooze, auto-timestamp. One-tap "Log shot."
- **Progressive disclosure.** Cabinet add-form starts minimal (name, type, dose, schedule); advanced fields (prescriber, cost, custom fields, photo) are collapsible.
- **Label estimates honestly.** PK curve = "model, not measured." Cost = "self-entered." Interactions = "informational, not medical advice."
- **Customizable surfaces.** KPI tiles, visible symptoms, and chart selection are driven by `user_medication_display_preferences` so different users (GLP-1 user vs. polypharmacy senior vs. caregiver) see what matters to them.
- **Caregiver mode.** Reuse on-behalf-of so a user can manage a dependent's meds; data stays private by default.
- **Crisis safety.** Keep the mockup's mental-health helpline affordance (Wellness/mood) — GLP-1s can shift mood; show 988/crisis link, matching the mockup.

## i18n / units

- All strings via `t()` with a `medications.*` / `nav.medications` namespace.
- Respect existing unit + energy + language preferences; dose units localized where applicable.
