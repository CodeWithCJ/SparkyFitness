# Medication & GLP-1 — Build Status & What's Next

*Snapshot: 2026-06-25. Reflects combined work (initial server vertical + Gemini Antigravity completion of frontend/remaining phases).*

## ✅ Completed (built & committed)

### Database
- Migration `20260624000000_add_medication_glp1_schema.sql` — 12 tables.
- **FK fix applied:** all 9 user-owned tables' `user_id` now reference Better Auth `public."user"(id)` (was `auth.users`). Live DB remapped + migration file corrected for fresh installs.
- RLS in `rls_policies.sql` (medications private via library policy; entries via diary policy; display prefs owner-only).

### Server (`SparkyFitnessServer`)
- Repositories: `medicationRepository`, `medicationEntryRepository`, `injectionRepository`, `medicationPenRepository`, `titrationRepository`, `symptomRepository`, `medicationDisplayPreferenceRepository`.
- Zod schemas: `schemas/medicationSchemas.ts` (single source of truth → `z.infer` types through repos; **no `any`**).
- Service: `services/glp1Service.ts` (PK serum curve, site suggestion).
- Routes: `routes/v2/medicationRoutes.ts` (Zod `safeParse`, `checkPermissionMiddleware('diary')`, on-behalf-of), registered at `/api/v2/medications`. Swagger documented.
- Shared: `@workspace/shared` GLP-1 module (drug PK profiles, `simulateSerumCurve`, `INJECTION_SITES`, `suggestNextSite`).
- Tests: `glp1Logic.test.ts`, `medicationRoutes.test.ts`.

### Frontend (`SparkyFitnessFrontend`)
- Pages: `pages/Medications/Medications.tsx` (tabs: **Today · Cabinet · Symptoms**), `pages/Medications/Glp1Coach.tsx` (injection log, **8-zone site rotation as a button grid**, pens, titration, pen auto-deduct), `pages/Reports/MedicationReports.tsx`.
- Hooks: `useMedications`, `useSymptoms`, `useMedicationReports`. API: `api/Medications/*`. Types: `types/medications.ts`.
- Nav: `/medications` route + sidebar tab (Pill icon) in `MainLayout.tsx`.

> Our tabs are **Diary · Food · Exercise · Reports · Settings · Medication** — the lovable mockup's tabs (Today/Vitals/Cabinet/GLP-1/Symptoms/Wellness/Labs/Insights) are **inspiration only**, not copied 1:1.

## 🔧 Remaining / gaps (prioritized)

| # | Gap | Notes |
|---|-----|-------|
| **P8** | **Clickable body map for injection sites** | Today it's a flat button grid. User wants a visual, tappable body map. See `phases/phase-8-injection-body-map/`. |
| **P8** | **Injection-site list too coarse** | We have 8 sites; the reference app uses ~15 granular sites (stomach 8 sub-zones + arms + thighs + hips + Unknown), **customizable** (active/inactive, reorder, auto-rotate). |
| P2 | Reminders + background scheduler | Due/missed-dose detection + email (MedFriend). Not built (needs a cron/job runner). |
| P6 | Opt-in data enrichment | RxNorm autocomplete, openFDA/DailyMed info, NDC barcode, interaction check. Not built. |
| P5 | Provider PDF export | CSV/report exists; doctor-ready PDF still open (verify `MedicationReports.tsx` coverage). |
| — | Mobile (Expo) | Web-first done; mobile consumes same `/api/v2/medications` later. |
| — | Build verification | Run `pnpm run validate` + `pnpm test` in frontend & server to confirm the combined code is green. |
| — | `db_schema_backup.sql` | Regenerate so it reflects the corrected `public."user"` FK. |

## Body map — reuse decision
The app already has an exercise body map: `pages/Exercises/BodyMapFilter.tsx` + `BodyMapFilter.css`,
driven by `useBodyMapSvgQuery` (server-served **muscle** SVG; clickable `<path class="...">` toggled
with CSS `enabled/disabled/active`).

**Recommendation: new component, reuse the technique — not the muscle SVG.** The muscle map's regions
(quads, abdominals…) don't match injection zones (stomach quadrants, hips, arms, thighs). Build a
dedicated `InjectionSiteBodyMap` that **borrows BodyMapFilter's pattern** (inline SVG with
class-named clickable regions + CSS state classes) but uses a front/back torso+limbs outline whose
region ids map to `INJECTION_SITES`. Self-contained inline SVG (no server fetch needed).
