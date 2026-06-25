# 01 — Self-Hosted Feasibility

What a single-tenant, self-hosted SparkyFitness instance can realistically do for medication
tracking — and what stays manual or gets cut. The rule: **manual entry by default; external
calls only when the user opts in, and only drug name / NDC ever leaves the box (never PHI).**

## Open data sources (free, no API key, opt-in)

| Source | Provider | Gives us | Used in |
|---|---|---|---|
| **RxNorm REST API** | NLM (RxNav) | Drug-name normalization, RxCUI, NDC lookup | Autocomplete, normalize names, link NDC |
| **openFDA Drug Label API** | FDA | Label sections: indications, dosage, warnings, **interactions text** | Drug-info sheet, best-effort interaction text |
| **DailyMed** | NLM | Structured labels, NDC, pill imagery | "ID a pill" / label parsing, NDC barcode resolve |

These are public US-government APIs. Calls contain only a drug name or NDC code — **no user
identity, no health data**. All gated behind a Settings toggle (default OFF).

### Interaction-checking caveat (important)
NLM **discontinued the RxNorm drug-interaction API in January 2024.** So interaction checking is
**best-effort**, via one of:
1. Parse/classify the **interactions section of openFDA labels** (text, not a structured pair DB), or
2. Bundle an **open interaction dataset** (e.g., DDInter) shipped with the app.

Either way it is surfaced with a prominent **"informational only, not medical advice — confirm
with your pharmacist"** disclaimer. We never claim clinical-grade interaction screening.

## Feasibility verdict per mockup feature

### ✅ Fully feasible (manual or pure computation, no external service)
- Medicine cabinet CRUD, flexible schedules, inventory, refill estimates.
- Adherence %, streaks, take/skip/snooze logs.
- Injection site rotation (8-zone map), lipo warnings.
- Dose titration / taper plans (just a scheduled dose-change series).
- **PK serum-level curve** — computed from published elimination half-lives (semaglutide ~7 days, tirzepatide ~5 days, etc.) + dose schedule. Labeled "**model, not measured**."
- Pen/vial inventory (doses left, expiry, in-use/sealed).
- Oral GLP-1 fasting timer (simple countdown).
- Symptom logging, body-map pin, Bristol stool scale, GI sub-tracker.
- Charts (nausea-vs-dose, weight trend, adherence) — reuse existing Reports/recharts.
- Correlation cards — simple statistics over data the app already collects (food, protein, water, sleep, mood, weight, symptoms). Honest confidence %, **not ML/AI**.
- Provider-ready PDF/CSV export.
- Static **clinical-trial reference lines** (STEP-1 semaglutide, SURMOUNT-1 tirzepatide) — published numbers baked in, no live service.

### 🟡 Feasible with opt-in external calls (privacy-gated)
- Drug-name autocomplete + normalization (RxNorm).
- Drug-info sheet (openFDA/DailyMed).
- NDC **barcode scan** — feasible, but US drug barcodes are often GS1 **DataMatrix** (not plain UPC); in-browser scanning is finicky. **Opt-in, and mobile does it better.**
- Best-effort interaction checks (openFDA text / DDInter) with disclaimer.

### 🟡 Manual-only (data exists but isn't free/self-hostable)
- **Cost / savings / deductible / "saved with coupon"** — real pricing is commercial (GoodRx-class). User types these in; clearly labeled "self-entered."
- **Glucose** — no CGM hardware integration; manual entry only, optional module. No forecasting.
- **Pharmacy / Rx number / prescriber** — free-text fields, no live pharmacy API.

### 🔴 Cut (not feasible / not appropriate self-hosted)
- Live **community cohort** with differential privacy / percentile-vs-3,200-users.
- **CGM glucose forecasting** and any ML prediction engine.
- **Real-time insurance / PA-approval / pharmacy-stock** integrations.
- Telehealth / prescriber marketplace.

## Infra realities to budget for (not "free")
- **Reminders:** server has **no web-push** today — only `services/emailService.ts` and the mobile app's `expo-notifications`. So web reminders = in-app + email; device push = mobile track. A **background scheduler/cron** is required to compute "due" and "missed" doses → net-new server work (Phase 2).
- **Sensitive data:** medication data is more sensitive than food logs. Default sharing = **private** (override the default-public model used for foods). Family/caregiver access is explicit opt-in via existing `familyAccessRepository` + `onBehalfOfMiddleware`.
- **Backups:** med tables must be included in the existing `backup_settings` export/import.

## Privacy summary (for user-facing copy)
- Nothing leaves your server unless you enable "online drug lookups."
- When enabled, only a **drug name or NDC** is sent to NLM/FDA — never your name, doses, schedule, or health data.
- Interaction checks are informational, not a substitute for your pharmacist or doctor.
