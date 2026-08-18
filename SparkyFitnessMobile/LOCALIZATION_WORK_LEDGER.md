# Mobile localization work ledger

Base: `f50c1ad41f9030cdee567d60d263886432dd1aab`
Branch: `feat/mobile-complete-localization`

| Unit | File/mechanism | Initial hard-coded findings | Status | EN | PL | fallback | tests | reviewer | DONE |
|---|---|---:|---|---|---|---|---|---|---|
| 1 | Bootstrap/navigation/shared shell: `App.tsx`, `TabsLayout.tsx`, `CustomTabBar.tsx`, `AddSheet.tsx` + health sync/writeback | 61 | DONE | verified | verified | verified | targeted tests pass | independent review pending | yes |
| 2 | Authentication/onboarding/server configuration: `OnboardingScreen.tsx`, `MfaForm.tsx`, `ServerConfigModal.tsx`, `ReauthModal.tsx` | 0 after unit | in review | verified | verified | verified | 71 targeted tests pass after test setup fix | independent review pending | no |
| 3 | Dashboard/home and reusable dashboard cards | 0 after unit | DONE | verified | verified | verified | targeted tests pass | independent review complete | yes |
| 4 | Diary and diary settings | TBD | pending | pending | pending | pending | pending | pending | no |
| 5 | Food, meals, nutrition, barcode and photo flows | TBD | pending | pending | pending | pending | pending | pending | no |
| 6 | Measurements and custom measurements | TBD | pending | pending | pending | pending | pending | pending | no |
| 7 | Workouts, active workout, workout plans and history | TBD | pending | pending | pending | pending | pending | pending | no |
| 8 | Exercises and exercise reusable components | TBD | pending | pending | pending | pending | pending | pending | no |
| 9 | Wellness/cycle/pregnancy | TBD | pending | pending | pending | pending | pending | pending | no |
| 10 | Medications, notifications and permissions | TBD | pending | pending | pending | pending | pending | pending | no |
| 11 | Settings, diagnostics, chat and developer tools | 81 | in review | implemented | implemented | verified | 88 targeted tests pass | independent review pending | no |
| 12 | Errors, alerts, toasts, accessibility and utility-generated labels | TBD | pending | pending | pending | pending | pending | pending | no |
| 13 | Android native resources, App Languages and widgets | TBD | pending | pending | pending | pending | pending | pending | no |
| 14 | iOS resources, widgets and Live Activities | TBD | pending | pending | pending | pending | pending | pending | no |
| 15 | Repository-wide second audit and adversarial reviews | TBD | pending | pending | pending | pending | pending | pending | no |
