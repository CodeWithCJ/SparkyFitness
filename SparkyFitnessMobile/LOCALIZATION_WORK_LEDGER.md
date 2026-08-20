# Mobile localization work ledger

Base: `f50c1ad41f9030cdee567d60d263886432dd1aab`
Branch: `feat/mobile-complete-localization`

All current mobile source, tests, localization resources, native/widget resources, and connected localization mechanisms were audited and implemented on this branch.

| Unit | Scope | Status | EN | PL | fallback | tests | review | DONE |
| ---- | ----- | ------ | -- | -- | -------- | ----- | ------ | ---- |
| 1 | Bootstrap, navigation, shared shell, tabs, add sheet, health sync/writeback | DONE | verified | verified | verified | pass | reviewed | yes |
| 2 | Authentication, onboarding, MFA, server configuration, re-authentication | DONE | verified | verified | verified | pass | reviewed | yes |
| 3 | Dashboard, home, reusable dashboard cards, charts and summaries | DONE | verified | verified | verified | pass | reviewed | yes |
| 4 | Diary and diary settings | DONE | verified | verified | verified | pass | reviewed | yes |
| 5 | Food, meals, nutrition, barcode and photo flows | DONE | verified | verified | verified | pass | reviewed | yes |
| 6 | Measurements and custom measurements | DONE | verified | verified | verified | pass | reviewed | yes |
| 7 | Workouts, active workout, plans and workout history | DONE | verified | verified | verified | pass | reviewed | yes |
| 8 | Exercises and exercise reusable components | DONE | verified | verified | verified | pass | reviewed | yes |
| 9 | Wellness, cycle, pregnancy and fertility | DONE | verified | verified | verified | pass | reviewed | yes |
| 10 | Medications, notifications, permissions and reminders | DONE | verified | verified | verified | pass | reviewed | yes |
| 11 | Settings, diagnostics, chat, developer tools and What's New | DONE | verified | verified | verified | pass | reviewed | yes |
| 12 | Errors, alerts, toasts, accessibility and utility-generated labels | DONE | verified | verified | verified | pass | reviewed | yes |
| 13 | Android native resources, App Languages and widgets | DONE | verified | verified | verified | pass | reviewed | yes |
| 14 | iOS resources, widgets and Live Activities | DONE | verified | verified | verified | pass | reviewed | yes |
| 15 | Repository-wide audit and independent adversarial reviews | DONE | verified | verified | verified | pass | complete | yes |

## Review record

- Fresh whole-branch adversarial audit: no actionable localization findings.
- Polish linguistic review: identified and fixed Apple Health naming, fasting-stage medical wording, medication terminology, workout terminology, pregnancy wording, chart tooltip, health metric labels, respiratory-rate wording, and iOS widget wording.
- Final audit after those fixes: zero actionable audit findings.

## Final coverage fix pack (fresh independent audit)

A further independent whole-branch audit found residual active defects that the
static i18n scanner does not detect. Fixed in the final coverage pack:

- Semantic pluralization: fertility.days, fertility.daysPastOvulation,
  pregnancy.weekBanner.daysToGo, cycleCard.periodLate, cycleCard.daysToDue,
  workoutComplete allSets (converted to proper {one,few,many,other} keys).
- Controlled-variable interpolation: removed raw English `unit: 'day'/'days'`
  from fertility/cycleCard; localized CycleHub ring Day/cycle template literals;
  CycleCard mode enum now mapped before interpolation.
- Medication cyclic schedule: separate localized on/off day-count phrases
  (dual-count pluralization).
- Pregnancy content: localized baby-development presentation for all active
  weeks 4–40 (comparison/baby/parent blurbs, EN + PL) and pregnancy safety item
  names/notes (FOOD_SAFETY + MED_SAFETY), plus localized PL search aliases with
  canonical EN search preserved.
- Earlier static shared exports (CYCLE_ARTICLES, POSTPARTUM_SYMPTOMS,
  MENOPAUSE_SYMPTOMS, BIRTH_PLAN_QUESTIONS, HOSPITAL_BAG_ITEMS) were audited and
  found to have NO active mobile call site; left canonical (inactive) and
  documented.
- Regression tests added for every fixed class (semantic plurals 1/2/5/12/22/25,
  baby weeks 4–40, safety EN/PL content + localized search).