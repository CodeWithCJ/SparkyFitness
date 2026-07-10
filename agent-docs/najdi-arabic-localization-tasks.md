# Implementation Plan: Saudi-First Najdi Arabic

_Companion to `najdi-arabic-localization-spec.md`_
_Branch: `feature/najdi-arabic`_

## Phase 1: Foundation and Guardrails

- [x] Task 1: Add tested web locale policy.
  - Acceptance: Arabic is the absent-preference default; explicit preferences are preserved; direction and Intl locale are centralized.
  - Verify: targeted Jest tests, typecheck, lint.
  - Likely files: locale policy module/test, `i18n.ts`.

- [ ] Task 2: Synchronize web root language/direction and Arabic typography.
  - Acceptance: language changes update `<html lang>` and `<html dir>`; Arabic base typography is readable; English remains LTR.
  - Verify: component test plus browser DOM/computed-style check.
  - Likely files: `LanguageHandler.tsx`, its test, `index.css`.

- [x] Task 3: Apply Saudi defaults only to new web preferences.
  - Acceptance: new profile defaults use Arabic, `dd/MM/yyyy`, metric units, kcal, and Sunday-first; saved values win.
  - Verify: preference-context/service tests.
  - Likely files: preferences source and focused tests.

- [x] Task 4: Add translation-catalog audit tooling.
  - Acceptance: CI-capable command reports missing/extra keys and interpolation mismatches without reading generated locales into application bundles.
  - Verify: command fails on a fixture mismatch and passes on aligned fixtures.
  - Likely files: script, script tests, package scripts, developer translation doc.

### Checkpoint A

- [x] Web targeted tests and `pnpm run validate` pass.
- [ ] Arabic/English shell direction verified in a real browser.
- [x] Foundation commits contain no pre-existing deployment files.

## Phase 2: Web Source Copy and Arabic Catalog

- [x] Task 5: Define terminology and voice glossary for core health concepts.
  - Acceptance: one approved term per navigation, nutrition, exercise, measurement, fasting, sleep, medication, cycle, pregnancy, settings, and auth concept.
  - Verify: linguistic review against the voice rules.
  - Likely files: terminology document only.

- [ ] Task 6: Remove hardcoded English from the web shell and onboarding.
  - Acceptance: all visible shell/onboarding copy uses message keys; fallback English copy is professional and concise.
  - Verify: focused component tests and hardcoded-copy audit.
  - Files: maximum five per slice; repeat by sub-journey.
  - Progress: auth and the complete onboarding journey are catalog-driven; the shell remains open while `MainLayout.tsx` contains unrelated in-progress deployment edits.

- [ ] Task 7: Complete the Najdi Arabic shell/onboarding catalog in the translations source repository.
  - Acceptance: every key used by the slice is translated and reviewed; placeholders are preserved.
  - Verify: catalog audit and browser QA.
  - Progress: auth and onboarding source keys are synced and reviewed in the translations repository; shell and live browser review remain open.

- [ ] Task 8: Repeat source-copy and Arabic-catalog slices for dashboard/diary, add flows, foods/meals, exercise, check-in, fasting, reports/goals, medications, cycle/pregnancy, settings/auth/admin.
  - Acceptance: each domain reaches complete reviewed coverage before moving to the next.
  - Verify: domain tests, catalog audit, and Arabic browser walkthrough.
  - Files: maximum five per commit.
  - Progress: the diary shell, standard meal names, meal cards, nutrition/energy summaries, hydration, day navigation, exercise summaries, live workout playback, workout templates, weekly workout plans, exercise add/edit flows, measurement check-in, mood, sleep, recent health activity, and fasting are localized and source-synced. Check-in photos remain open because that file has unrelated in-progress edits; remaining diary child flows and live browser review also stay open.

### Checkpoint B

- [x] Web validation and the 18-test auth/onboarding regression pack pass (40 tests).
- [x] Diary checkpoint passes full validation plus 12 focused suites (26 tests); Arabic coverage is 984/2819 messages (34.9%) with no interpolation mismatch reported.
- [x] Workout checkpoint passes full validation and the focused playback/template/plan regression packs; Arabic coverage is 1270/3046 messages (41.7%) with no interpolation mismatch reported.
- [x] Check-in and fasting checkpoint passes 10 focused suites (27 tests), targeted lint, typecheck, and catalog checks; Arabic coverage is 1549/3217 messages (48.2%) with no interpolation mismatch reported.
- [x] Fasting guidance uses neutral time ranges and Saudi Ministry of Health safety guidance instead of unsupported metabolic-state claims: [diabetes and Ramadan](https://www.moh.gov.sa/healthawareness/educationalcontent/diseases/diabetic/pages/diabetes-and-ramadan-.aspx), [fasting and dehydration](https://www.moh.gov.sa/awarenessplateform/SeasonalAndFestivalHealth/Educational-Content/Pages/Dehydration.aspx).
- [ ] Arabic catalog has full key and placeholder parity with English.
- [ ] No raw keys, unwanted English, or forced slang in critical web journeys.
- [ ] Browser QA passes at 320, 768, 1024, and 1440 px.

## Phase 3: Web RTL and Saudi UX Polish

- [ ] Task 9: Convert shared web primitives from physical left/right behavior to semantic start/end behavior.
  - Acceptance: dialogs, selects, inputs, toasts, tables, pagination, and navigation work in both directions.
  - Verify: primitive tests and visual browser checks.
  - Files: maximum five primitives per slice.
  - Progress: dialog primitives, numeric/unit inputs, diary hydration controls, day navigation, meal actions, live workout controls, workout-template pickers, exercise record controls, check-in forms/actions, sleep timelines, and fasting widgets use logical positioning; the remaining shared primitives and visual check are open.

- [ ] Task 10: Audit directional icons, charts, timelines, and media/exercise playback.
  - Acceptance: only semantically directional controls mirror; data meaning is unchanged.
  - Verify: Arabic/English before-after screenshots and interaction tests.

- [ ] Task 11: Replace visible `en-US` web formatting and speech behavior.
  - Acceptance: dates, day names, and exercise speech use active locale policy; stored values do not change.
  - Verify: unit tests and browser speech/date checks where supported.
  - Progress: shared web date formatting now uses the Saudi Arabic date-fns locale and Gregorian calendar-day behavior; exercise speech and browser verification remain open.

- [ ] Task 12: Polish weak empty, loading, error, and confirmation states encountered in localized journeys.
  - Acceptance: each state explains status and next action in the correct register without adding unrelated features.
  - Verify: component tests and five-axis review.
  - Progress: auth, onboarding, app loading, diary loading/empty states, hydration controls, workout playback, template creation/selection/management, weekly plans, exercise loading/add/edit states, check-in measurements, mood controls, recent activity, sleep entry deletion, and fasting safety/time validation have been refined with accessible names and tested Arabic copy.

## Phase 4: Mobile Localization and RTL

- [ ] Task 13: Add the tested mobile locale provider, persistence, and typed core catalog.
  - Acceptance: new installs start in Arabic; explicit language persists; English fallback is complete; no unsafe runtime dependency is added without review.
  - Verify: unit/provider tests, typecheck, lint.

- [ ] Task 14: Add safe React Native RTL activation and Arabic typography tokens.
  - Acceptance: app direction matches language after the required restart/reload; custom and native headers remain usable.
  - Verify: Android/iOS tests and device/simulator QA.

- [ ] Task 15: Localize mobile shell/onboarding and language settings.
  - Acceptance: cold start, onboarding, tabs, add sheet, headers, auth, and settings are complete in Arabic.
  - Verify: focused Jest tests plus Android/iOS walkthrough.

- [ ] Task 16: Localize mobile dashboard/diary and primary add flows.
  - Acceptance: hydration, fasting, measurements, food, workout, activity, scan/photo, and sync flows contain no unintended English.
  - Verify: focused tests and small/large device QA.

- [ ] Task 17: Localize mobile library, detail/edit, chat, diagnostics, and secondary flows.
  - Acceptance: remaining user-facing mobile surfaces and error states are complete and reviewed.
  - Verify: domain tests, catalog audit, and journey walkthroughs.

- [ ] Task 18: Centralize mobile date/number/unit formatting and remove visible `en-US` assumptions.
  - Acceptance: visible formatting follows locale while API/storage contracts stay stable.
  - Verify: formatter and affected component tests.

### Checkpoint C

- [ ] Mobile validation and full single-run Jest suite pass.
- [ ] Android and iOS Arabic/English cold-start and language-change paths pass.
- [ ] Native headers, tabs, sheets, charts, and mixed bidi text are visually correct.

## Phase 5: Server, Notifications, Widgets, and Sparky

- [ ] Task 19: Inventory and classify server-originated user messages.
  - Acceptance: messages are either stable client-localized codes or deliberately locale-aware server output.
  - Verify: route/contract test inventory.

- [ ] Task 20: Localize notification, widget, and wearable-facing copy.
  - Acceptance: snapshots and notifications use the active locale without breaking native data contracts.
  - Verify: platform target tests/snapshots and prebuild only where native configuration changes.

- [ ] Task 21: Make Sparky Saudi-Arabic aware.
  - Acceptance: Arabic sessions receive factual, restrained Saudi Arabic; medical guardrails and tool-output contracts remain intact.
  - Verify: prompt/transport tests and representative conversation review.

## Phase 6: Final Review

- [ ] Task 22: Run automated translation, bidi, accessibility, package, and build gates.
- [ ] Task 23: Perform critical-journey browser and device QA in Arabic and English.
- [ ] Task 24: Complete linguistic review and five-axis code review; resolve every critical and important finding.
- [ ] Task 25: Update translation/developer guides and final audit metrics.

## Risks and Mitigations

| Risk                                                       | Impact                             | Mitigation                                                                                      |
| ---------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Generated Arabic catalog is edited in the wrong repository | Sync overwrites work               | Keep Arabic source changes in `SparkyFitnessTranslations`; use this repo only for synced output |
| Global RTL switch breaks charts or navigation              | Incorrect or unusable UI           | Foundation tests, logical properties, and component-by-component semantic mirroring review      |
| Forced dialect harms trust                                 | Unprofessional medical/health UX   | Register matrix, terminology glossary, and formal safety copy                                   |
| Mobile localization rewrite is too large                   | Regressions and unreviewable diffs | Vertical journeys, five-file slices, targeted tests, source-control checkpoints                 |
| Existing deployment work is accidentally committed         | Mixed history and conflicts        | Path-specific staging and staged-diff review before every commit                                |
| Saudi defaults overwrite existing preferences              | User surprise/data change          | Apply only when preference is absent; add explicit regression tests                             |
