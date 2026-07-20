# Phase 9 (remaining) — Pregnancy hub completion + Wellness sub-theme

> **Read this first.** This file supersedes the pregnancy/theme portions of `06-pregnancy.md` and `08-navigation-polish.md` for the work that is still outstanding. Those earlier files were written *before* the feature was partially built; this one is grounded in the **actual current code** (as of this writing) so it can be executed without re-deriving what already exists. It is self-contained — you do not need to read the other phase files.

## Current build status (what already exists — do NOT rebuild)

**Data layer (all built, typed, working):**
- `src/services/api/cycleApi.ts`, `src/services/api/pregnancyApi.ts`, `src/services/api/pregnancyPhotosApi.ts`, `src/services/api/symptomsApi.ts` — all endpoints implemented.
- `src/hooks/usePregnancy.ts` — `useCurrentPregnancy()`, `usePregnancyOverview(date?, enabled?)`, `usePregnancyMutations()`.
- `src/hooks/usePregnancyTracking.ts` — `useKickSessions()`, `useKickMutations()`, `useContractionAnalysis()`, `useContractionMutations()`.
- Query keys in `src/hooks/queryKeys.ts`: `pregnancyCurrentQueryKey`, `pregnancyOverviewQueryKey`, `pregnancyKicksQueryKey(sessionId?)`, `pregnancyContractionsQueryKey`, `pregnancyChecklistQueryKey`, `pregnancyAppointmentsQueryKey`, `pregnancyPhotosQueryKey`.
- `expo-image-picker` is installed (`~56.0.19`) — no dependency work needed.

**UI (built, working):**
- `src/screens/CycleHubScreen.tsx` — hosts a `SegmentedControl` with tabs **Log** / Insights / History. For `mode === 'pregnant'` the Log tab renders `<PregnancyTodayView />`.
- `src/screens/PregnancySetupScreen.tsx` — functional due-date/basis/fetus-count/notes form; creates the pregnancy via `usePregnancyMutations().createPregnancyAsync`.
- `src/components/wellness/pregnancy/PregnancyTodayView.tsx` — composes: setup prompt (when no active pregnancy) → `WeekBanner`, `BabyGrowthView`, `KickCounter`, `ContractionTimer`.
- `WeekBanner.tsx`, `BabyGrowthView.tsx`, `KickCounter.tsx`, `ContractionTimer.tsx` — all built.

**Still pending (this phase builds these):**
1. Weekly checklist (`WeeklyChecklist`)
2. Bump-photo journal (`BumpPhotoJournal`)
3. Vitals card (`VitalsCard`)
4. Food/med safety search (`FoodMedSafetySearch`)
5. Appointments (`AppointmentsCard` + add/edit sheet)
6. Wellness sub-theme (`wellnessTokens.ts` + apply to visual components)

**Out of scope (per user):** Care hub is NOT to be built.

## Shared conventions to follow (verified)
- TanStack Query 5, default `staleTime: Infinity`. Every mutation must explicitly `queryClient.invalidateQueries({ queryKey })`. Follow the existing hooks in `usePregnancy.ts`/`usePregnancyTracking.ts` for structure (a `use…()` query hook + a `use…Mutations()` hook, both using `useRefetchOnFocus` on queries).
- API clients: thin `apiFetch` wrappers already exist in `pregnancyApi.ts`. The checklist/appointment client functions return `unknown`/`unknown[]` — **add proper types in `src/types/womensHealth.ts`** and cast in the hooks (see each task).
- UI primitives (reuse, don't rebuild): `ui/Button.tsx`, `FormInput.tsx`, `SettingsRow`/`SettingsRowGroup`, `StepperInput.tsx`, `BottomSheetPicker.tsx`, `CalendarSheet.tsx` (`ref.present()`, props `selectedDate`/`onSelectDate`), `SegmentedControl.tsx`, `Icon.tsx`.
- Dates: use `getTodayDate()`, `addDays()`, `formatDate()` from `src/utils/dateUtils.ts` (device-local). **Never** use `todayInZone('UTC')` or `new Date().toISOString().split('T')[0]` for calendar days.
- Theme colors: `useCSSVariable(['--color-…'])`. Icon danger token is `--color-icon-danger` (not `--color-danger`). Warning styling in this feature uses amber Tailwind classes (`bg-amber-50`, `border-amber-200`, `text-amber-800`) + `Icon name="warning"` — see `CycleOnboardingScreen` disclaimer and `CorrelationCards` for precedent.
- Toindex: after `pnpm run validate` (typecheck+lint) and relevant tests must pass. Run from `SparkyFitnessMobile/`: `pnpm run validate` and `pnpm exec jest --watchman=false --runInBand <path>`. Escaped apostrophes required in JSX text (`&apos;`) — lint enforces `react/no-unescaped-entities`.
- **Architecture rule:** these are all **cards/sheets rendered inside `PregnancyTodayView`**, NOT new root-stack routes. This keeps `RootStackParamList`/`App.tsx`/`nativeHeaderContract.test.ts` untouched. The only exception you may consider is a full-screen photo viewer, but a bottom sheet is preferred (avoids nav-contract churn).

---

## Task 1 — Weekly Checklist (`WeeklyChecklist.tsx`)

**Backend (built):** `GET /api/v2/pregnancy/checklist?pregnancy_id=…` → rows with `{ id, user_id, pregnancy_id, template_key, custom_title, week, completed_at, dismissed }`. `PUT /api/v2/pregnancy/checklist` body `{ id?, pregnancy_id?, template_key?, custom_title?, week?, completed?, dismissed? }`. Client fns: `getChecklist(pregnancyId)`, `upsertChecklistItem(body)` in `pregnancyApi.ts`.

**Shared content:** `checklistForWeek(week: number): ChecklistTemplateItem[]` from `@workspace/shared`, where `ChecklistTemplateItem = { key: string; weekStart: number; weekEnd: number; title: string }`. Also `CHECKLIST_TEMPLATES` (full readonly list).

**Steps:**
1. Add type `PregnancyChecklistItem` to `src/types/womensHealth.ts` mirroring the server row shape above.
2. Create `src/hooks/usePregnancyChecklist.ts`: `usePregnancyChecklist(pregnancyId, currentWeek)` — `useQuery` keyed by `[...pregnancyChecklistQueryKey, pregnancyId]` → `getChecklist(pregnancyId)` (cast to `PregnancyChecklistItem[]`); plus `usePregnancyChecklistMutations()` with a `toggleAsync({ templateKey, week, completed })` calling `upsertChecklistItem` and invalidating `pregnancyChecklistQueryKey`.
3. Create `src/components/wellness/pregnancy/WeeklyChecklist.tsx` (props: `pregnancyId: string`, `currentWeek: number`). Merge the **template items relevant to the current week window** (`checklistForWeek(currentWeek)`) with the persisted server state (match on `template_key === key`) to compute completed/dismissed. Render each as a checkbox row (pattern off `SettingsRow` + a `checkmark-circle-filled`/`checkmark-circle` Icon toggle, like the onboarding radio pattern in `CycleOnboardingScreen`). Tapping toggles `completed` via the mutation. Show `custom_title ?? title`.
4. Wire into `PregnancyTodayView` (a card in the main return, after `BabyGrowthView`), passing `pregnancyId={pregnancy.id}` and `currentWeek={overview.gestationalAge.week}`.
5. Test: `__tests__/components/wellness/pregnancy/WeeklyChecklist.test.tsx` (render with a mocked hook returning one template item + one completed persisted item; assert both render and the toggle calls the mutation).

---

## Task 2 — Bump-Photo Journal (`BumpPhotoJournal.tsx`)

**Backend (built):** `pregnancyPhotosApi.ts` — `listPhotos(pregnancyId)`, `deletePhoto(id)`, `uploadPhoto({ pregnancyId, week, uri, notes? })` (multipart, already handles FormData/headers). `BumpPhoto = { id, pregnancy_id, week, entry_date, file_path, notes: string|null }`.

**Image capture (pattern from `FoodScanScreen.tsx`):**
```ts
import * as ImagePicker from 'expo-image-picker';
const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7, allowsMultipleSelection: false });
if (result.canceled) return;
const uri = result.assets?.[0]?.uri;
```
For camera use `ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 })` after `ImagePicker.requestCameraPermissionsAsync()`. Present a camera-vs-library choice via `ActionSheet.tsx` (or a two-button prompt). Guard against double-tap re-entry with a `useRef` lock like FoodScanScreen's `pickerLock`.

**Displaying photos:** `file_path` is a server path; build the full URL the same way other server images are resolved in the app (check how existing images render — likely prefix with the active server base URL from `getActiveServerConfig()`; reuse whatever helper `pregnancyPhotosApi.ts` already uses via `normalizeUrl`). If no helper exists, resolve `${baseUrl}${file_path}` with auth headers — verify how the app renders authenticated images before assuming a plain `<Image source={{uri}}>` works; if images require auth headers, follow the existing authenticated-image pattern in the codebase.

**Steps:**
1. Create `src/hooks/usePregnancyPhotos.ts`: `usePregnancyPhotos(pregnancyId)` (query keyed `[...pregnancyPhotosQueryKey, pregnancyId]`), and `usePregnancyPhotoMutations()` with `uploadAsync` + `deleteAsync`, both invalidating `pregnancyPhotosQueryKey`.
2. Create `src/components/wellness/pregnancy/BumpPhotoJournal.tsx` (props `pregnancyId`, `currentWeek`): a card with an "Add photo" button → action sheet (Camera / Library) → pick → optional notes prompt → `uploadAsync({ pregnancyId, week: currentWeek, uri, notes })`. Below, a horizontal gallery of thumbnails (week label + delete on long-press or a small trash button using `--color-icon-danger`). Empty state when none.
3. Wire into `PregnancyTodayView` as a card.
4. Test: mock the hooks; assert empty state renders and that tapping add triggers the picker path (mock `expo-image-picker`).

**Note:** keep this a card + bottom sheet — do NOT add a `FoodPhotoFlow`-style nested navigator; there is no AI step.

---

## Task 3 — Vitals Card (`VitalsCard.tsx`)

**Purpose:** show/track weight during pregnancy + display prenatal/supplement medication links from the pregnancy record.

**Data:**
- Weight should reuse the app's existing check-in weight measurement (do NOT invent a pregnancy-specific weight store). Check `src/hooks/useMeasurements.ts` / `useUpsertCheckIn.ts` and `measurementsApi.ts` for the current weight read/write, and surface today's weight with a quick-add stepper that writes through `useUpsertCheckIn` (preserve its omitted-vs-null semantics). Weight is stored metric (kg) server-side; convert for display with the app's `unitConversions.ts` if the user's unit preference is imperial (follow how `MeasurementsAddScreen`/`MeasurementsSummary` handle units).
- `prenatal_medication_id` / `supplement_medication_id` live on the `pregnancies` record (`useCurrentPregnancy().pregnancy`). If surfacing a medication name, look up via the existing medications feature/API (search the codebase for a medications hook/api before building anything). If that lookup is more than trivial, scope this to just showing whether a prenatal/supplement is linked and defer name resolution — note it inline.

**Steps:**
1. Create `src/components/wellness/pregnancy/VitalsCard.tsx` (props `pregnancy: SharedPregnancy`). Weight row (current value + quick stepper/entry). Prenatal + supplement rows.
2. Wire into `PregnancyTodayView` as a card.
3. Test: render with a mocked pregnancy + mocked weight hook; assert weight displays and quick-add calls the mutation.

**If the medications lookup turns out non-trivial, keep the medication rows as simple "Linked / Not set" indicators and leave a `// TODO` — do not block the card on it.**

---

## Task 4 — Food/Med Safety Search (`FoodMedSafetySearch.tsx`)

**This is 100% client-side — no API.** Shared content from `@workspace/shared`:
- `FOOD_SAFETY: readonly SafetyItem[]`, `MED_SAFETY: readonly SafetyItem[]`
- `SafetyItem = { name: string; aliases: string[]; status: 'safe'|'caution'|'avoid'; note: string; category: string }`
- `lookupSafety(query: string, list: SafetyItem[]): SafetyItem[]` — filters by name/alias substring.

**Steps:**
1. Create `src/components/wellness/pregnancy/FoodMedSafetySearch.tsx`: a `FormInput` search box + a `SegmentedControl` (Food / Meds) selecting which list to query. Debounce input (~200ms; reuse any existing debounce util, or a simple `useState` + `useEffect` timer). Render results via `lookupSafety(query, selectedList)` — each result shows `name`, a status badge (safe = green, caution = amber, avoid = red — reuse the amber warning styling convention for caution/avoid), and `note`. Empty query → hint text; no matches → "not found" text.
2. Wire into `PregnancyTodayView` as a card (this is a genuinely useful, self-contained card).
3. Test: render, type a known food (check `FOOD_SAFETY` content for a real entry name), assert its status/note renders.

---

## Task 5 — Appointments (`AppointmentsCard.tsx` + add/edit sheet)

**Backend (built):** `listAppointments(upcoming?)`, `createAppointment(body)`, `updateAppointment(id, body)`, `deleteAppointment(id)` in `pregnancyApi.ts`. `health_appointments` fields: `id`, `pregnancy_id` (nullable — appointments are mode-agnostic), `scheduled_at` (ISO datetime), `appointment_type` (string ≤50), `title`, `location`, `notes`, `outcome` (JSONB/string). Create body: `{ scheduled_at (ISO datetime, required), appointment_type?, title?, location?, notes? }`.

**Steps:**
1. Add type `HealthAppointment` to `src/types/womensHealth.ts` (fields above).
2. Create `src/hooks/useHealthAppointments.ts`: `useHealthAppointments(upcoming?)` (query keyed `[...pregnancyAppointmentsQueryKey, upcoming ?? false]` → `listAppointments(upcoming)` cast to `HealthAppointment[]`), plus `useHealthAppointmentMutations()` with `createAsync`/`updateAsync`/`deleteAsync`, all invalidating `pregnancyAppointmentsQueryKey`.
3. Create `src/components/wellness/pregnancy/AppointmentsCard.tsx`: a card listing upcoming appointments (sorted by `scheduled_at`, formatted via `formatDate` + time), each with edit/delete. An "Add appointment" button opens an add/edit form. Keep the form a bottom sheet or an inline expanding form (title, type, location, notes, and a date+time picker — use `CalendarSheet` for the date; for time either a simple stepper or the app's existing time-input pattern if one exists — grep for a time picker before building one, else default the time to a sensible hour and let notes cover specifics). On create, `scheduled_at` must be a full ISO datetime string.
4. Wire into `PregnancyTodayView` as a card. (Appointments are technically mode-agnostic, but with no Care hub, the pregnant-mode Today view is their home for now. A `// NOTE:` comment should record that appointments could later move to a shared location.)
5. Test: mock the hook with one appointment; assert it renders and delete calls the mutation.

---

## Task 6 — Wellness sub-theme (`wellnessTokens.ts` + apply)

**Goal:** a soft, scoped rose/lavender identity for this feature only — NOT an app-wide redesign. Layer on top of existing primitives; everything outside `src/components/wellness/` keeps using the global `--color-*` variables unchanged.

**Steps:**
1. Create `src/components/wellness/theme/wellnessTokens.ts` — plain TS constants (NOT new global CSS variables). Export:
   - Accent set: `WELLNESS_ACCENT`, `WELLNESS_ACCENT_MUTED`, `WELLNESS_SURFACE_TINT`.
   - Phase colors: `PHASE_MENSTRUAL`, `PHASE_FOLLICULAR`, `PHASE_OVULATION`, `PHASE_LUTEAL`, `PHASE_PREGNANT`.
   - Provide light/dark/amoled variants selected via `useUniwind().theme` (pattern: `AddSheet.tsx` reads `theme` locally today). Shape suggestion: `export const wellnessPalette = { light: {...}, dark: {...}, amoled: {...} }` + a `useWellnessTokens()` hook that returns the right set based on `useUniwind().theme`.
   - **Pick colors deliberately:** load the `dataviz` skill and run the phase-color set through its palette validator for perceptual distinctness + light/dark contrast before committing values. Rose/lavender family for accent; the phase colors should stay distinguishable (menstrual = warm red/rose, fertile/follicular = green, ovulation = deeper green/teal, luteal = lavender/purple, pregnant = soft pink).
2. Apply the tokens ONLY in `src/components/wellness/**` visual elements:
   - `CycleRing.tsx` — replace its hardcoded `COLORS` (`period`/`fertile`/`ovulation`) with the phase tokens.
   - `WeekBanner.tsx` — progress bar currently `bg-pink-400`; use `WELLNESS_ACCENT`.
   - `CycleCalendarGrid.tsx` — phase-colored day cells should use the phase tokens.
   - Card accents/badges across the wellness cards (fertility, correlation, etc.) may adopt `WELLNESS_ACCENT` for their primary highlight, but **card chrome (surface/border/background/text) must keep using the existing `--color-*` variables** so cards still look native to the app.
   - Do NOT touch `ui/Button`, `SettingsRow`, `FormInput`, or any shared primitive.
3. Illustrations are **optional/deferred** — a `WombScene` illustration is a nice-to-have; if you build it, use a static PNG/WebP asset via `<Image>` (do not add `react-native-svg` — confirm it's absent first). The `BabyGrowthView` already shows size comparison text; a small produce/fruit icon set is optional. **Prioritize the palette (step 1-2); treat illustrations as stretch.**
4. Test: `wellnessTokens` is data — a light unit test asserting `useWellnessTokens()` returns a full set per theme is enough. Visual changes are verified by running the app.

---

## Wiring summary — final `PregnancyTodayView` composition

After all tasks, the active-pregnancy branch of `PregnancyTodayView` should render (in a sensible order), each as its own card:
`WeekBanner` → `BabyGrowthView` → `VitalsCard` → `WeeklyChecklist` → `KickCounter` → `ContractionTimer` → `BumpPhotoJournal` → `AppointmentsCard` → `FoodMedSafetySearch`.
Pass `pregnancy`/`pregnancy.id`/`overview.gestationalAge.week` as each needs.

## Verification (run after each task, and all at the end)
- `pnpm run validate` (typecheck + lint) from `SparkyFitnessMobile/` — must pass clean.
- `pnpm exec jest --watchman=false --runInBand __tests__/components/wellness __tests__/screens/CycleHubScreen.test.tsx` — all pass; add the new component tests noted per task.
- Manual (pregnant mode): set mode = pregnant in Settings → open hub via "+" → complete pregnancy setup → confirm each new card renders on the Log tab; toggle a checklist item, add/delete a bump photo, add/quick-edit weight, search "sushi"/"ibuprofen" in safety, add/delete an appointment. Confirm the wellness palette shows in the ring/banner/calendar in light AND dark themes.

## Notes for whoever implements (Sonnet or otherwise)
- The pregnant-mode swap in `CycleHubScreen` currently keys on `mode === 'pregnant'` only (postpartum keeps the cycle view). That's intentional; don't change it.
- Everything here is additive to `PregnancyTodayView` + new hooks/components + one theme file. No changes to navigation, `App.tsx`, `AddSheet`, or the nav-contract test should be needed. If you find yourself editing those, stop and reconsider — you've probably drifted from the card/sheet architecture.
- Keep JSX apostrophes escaped (`&apos;`) — lint fails otherwise.
