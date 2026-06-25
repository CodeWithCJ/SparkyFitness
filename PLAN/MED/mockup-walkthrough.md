# Mockup Walkthrough

Detailed description of the 7 lovable.dev screens (the **authoritative spec** — the exported
lovable source, kept in the repo at `WIP/lovable-project-…-2026-06-21.zip`, is only scaffolding).
Each screen notes which features are feasible self-hosted, which are manual, and which are
trimmed. To view the images inline, drop the PNGs into `screenshots/` named as indicated.

Top nav across all screens: **Today · Vitals · Cabinet · GLP-1 · Symptoms · Wellness · Labs · Insights**.
(We collapse Labs into Vitals/custom-measurements; Wellness reuses CheckIn.)

---

## 1. Today  → `screenshots/01-today.png`

KPI strip: Calories 1,240/2,000 · Water 5/8 cups · **Meds Today 2/4 (50% taken)** · **Streak 12 days perfect** · Lifestyle Score 84 (↑+6 wk).

- **Next Wegovy injection** banner: countdown ("In 2h 14m · 10:00 AM today"), suggested site (Right Thigh), dose (1.0 mg), pen (Pen #1, 1 dose left), streak reward (+50 XP), **Snooze / Log now**.
- **Hydration nudge** card (behavioral coaching tied to nausea on dose days).
- **Medications today** list — per-med rows (Lisinopril ✓Taken, Vitamin D3 ✓Taken, Metformin [Take], Wegovy [Log shot]) with timestamp + "with water/breakfast" context. **Voice** + **Add** buttons.
- **Weekly adherence** ring (94%) + 7-day colored squares (green/amber/red).
- **Quick daily check-in** (Mood 7, Sleep 7.5h, Hunger 3↓, Food noise 2 "quiet", Energy 6) → +50 streak XP.
- **24-hour post-dose check-in** (auto-prompted: Feeling great / Some nausea / Tired / Other).
- **MedFriend** card — backup contact (Jamie K., spouse) notified if a dose is missed.

**Feasibility:** Adherence, streaks, take/skip/snooze, check-in (reuse), MedFriend (email) ✅.
Gamified XP/Lifestyle Score = optional polish. Voice logging = later/nice-to-have.

---

## 2. Cabinet  → `screenshots/02-cabinet.png`

KPI tiles: **Monthly cost $1,383** ($225 saved w/ coupon) · YTD $8,420 · Next refill 8 days · Active scripts 5.

- **Interaction banner**: "1 potential interaction · checked against 200K+ flagged pairs" (Metformin + iodinated contrast) with Details.
- **Med cards** (Wegovy, Lisinopril, Metformin, Vitamin D3, Ibuprofen): type badge (Injection/Pill/Capsule), star rating, schedule, $/mo, prescriber, pharmacy, **count remaining + refill-in estimate**, low-stock badge, per-card actions (Call pharmacy / Drug info / Refill history), contextual warnings ("Watch for contrast dye + Metformin").
- **Add new medication** panel: Rx label scan / Pill ID / manual. Name, **Type** (Pill/Capsule/Liquid/Injection/Patch/Inhaler), Dose+unit, **Schedule** (Daily/Weekly/Taper/PRN + weekday picker), prescriber & pharmacy, Rx#, **cost & savings + card expiry**, **inventory & low-stock alert ("remind at ≤ N")**.
- **Resource center**: curated articles/guides/recipes/scripts.

**Feasibility:** CRUD, type/schedule, inventory, low-stock, refill estimate ✅. Cost/savings/coupon
= **manual entry** 🟡. Interaction check = **opt-in best-effort** (openFDA/DDInter) with disclaimer 🟡.
Rx-label scan / Pill ID = opt-in (DailyMed/RxNorm), mobile-preferred 🟡. "Call pharmacy" = `tel:` link.
Star rating ↔ our **effectiveness** field.

---

## 3. GLP-1  → `screenshots/03-glp1.png`

- **Injection site rotation**: 8-zone body map, legend (Selected / Suggested next 60d rest / Last used wait 7+ days), **lipo warning**, **Log injection — Right Thigh** CTA.
- **PK serum level — Wegovy**: semaglutide ~7-day half-life curve over 14 days, "~0.71 mg, next dose in 3 days." (Computed from published half-life — model, not measured.)
- GLP-1 stat tiles: **Hunger 3/10** (−4 since start), **Food noise 2/10** (−7), **Fullness 8/10** (reached in 5 min).
- **Clinical trial benchmark**: user's weight loss vs **STEP-1** (semaglutide) & **SURMOUNT-1** (tirzepatide); "tracking above median." (Static published reference lines.)
- **Community cohort**: percentile vs ~3,200 anonymized users. **← CUT** (can't run privacy-preserving cohort self-hosted).
- **Pen inventory**: doses left, opened/expiry, sealed vs in-use, reorder flag.
- **Oral GLP-1 fasting timer**: countdown after tablet (Rybelsus 30-min water-only).
- **Dose titration plan**: timeline 0.25→0.5→1.0 (active)→1.7→2.4 mg with dates; **Edit plan / Taper**.

**Feasibility:** site rotation, PK curve, pens, fasting timer, titration/taper ✅. Clinical-trial
lines = static ✅. Hunger/food-noise/fullness reuse check-in ✅. Community cohort **CUT** 🔴.

---

## 4. Symptoms  → `screenshots/04-symptoms.png`

- **Log side effects**: chips (Nausea, Vomiting, Constipation, Diarrhea, Acid Reflux, Burping, Headache, Fatigue, Dizziness, Hair Loss, Insomnia, Brain Fog) with GLP-1-common ones flagged; **+ Custom symptom**; severity sliders (Nausea/Headache/Fatigue/Stomach Pain); "what did you eat? how long after dose?" free-text; Save.
- **Where does it hurt?** — tap-to-pin body map; pinned entries list (Epigastric · sharp nausea sev3 45min post-meal; Right side dull ache sev2; Frontal head tension sev2).
- **GI sub-tracker**: nausea onset (~45 min post-meal), episodes/week (3, down from 8), vomiting, GERD/heartburn.
- **Bristol stool scale** 1–7 with weekly average + fiber/water tip.
- **Side-effect pattern analysis**: nausea trend, headache cluster (low-water days), reflux (high-fat days) + weather/pressure/stress/cycle-day context.
- **Symptom history** calendar (color dots per day) + per-day log list.

**Feasibility:** all ✅ (manual + rule-based pattern hints, **not ML**). Custom symptoms mirror
`user_custom_nutrients` + `custom_categories`. Weather/pressure context = optional (would need a
weather fetch — keep as opt-in or drop). Cycle-day = optional from existing data if tracked.

---

## 5. Wellness  → `screenshots/05-wellness.png`

KPI: Mood 6.9 · Sleep 7.3h · Protein 110/120g · Steps 8,719 · Hydration 83%.

- **Personalized TDEE** (BMR/TDEE/eaten/deficit + protein/fiber/water targets) — **mostly already exists** in SparkyFitness.
- **Protein-first logging** (snap/barcode/voice, protein highlighted) — **reuse existing Foods**.
- **This week at a glance** stacked bars (mood/sleep/energy/hunger/food-noise/protein/hydration/steps).
- **Sleep architecture** (Deep/REM/Light/Awake, score/HRV) "from Oura" — reuse existing wearable integration if present; otherwise manual/derived.
- **Muscle Defense™** (resistance-training reminders to preserve lean mass) — reuse Exercises.
- **Mood journal** + **crisis helpline (988)** affordance — keep.
- **Non-scale victories** log; **Digestive health** (Bristol week).

**Feasibility:** largely **reuse of existing app data** (food, protein, water, sleep, mood, steps,
exercise, weight). This screen is mostly a re-skin of what SparkyFitness already does → low new work.

---

## 6. Insights  → `screenshots/06-insights.png`

- **Glucose forecasting** (predict meal glucose response) — **CUT/manual only** (needs CGM/ML).
- **Nausea vs. medication dose** (bars=severity, line=dose mg over 21 days) + insight text ("nausea spikes 24–48h after a dose increase").
- **Weight trend** vs goal (12 wks, projected date).
- **Correlation engine**: cards (Nausea↔Dose day 92%, Sleep↔Hunger 78%, Steps↔Mood 71%, Hydration↔Constipation 84%, Protein↔Next-day weight 68%, Meal timing↔Reflux 81%) — simple stats over existing data, honest confidence %.
- **Insurance & cost tracker** (monthly OOP/savings/deductible bars, Export CSV) — **manual data**.
- **Adherence score** (94%, per-med breakdown) + **14-day adherence** bars.

**Feasibility:** nausea-vs-dose, weight trend, correlation cards, adherence ✅ (reuse Reports/charts).
Cost tracker = manual 🟡. Glucose forecasting **CUT** 🔴 (manual glucose only).

---

## 7. (Vitals / Labs)

The nav includes **Vitals** and **Labs** tabs (not separately screenshotted). Plan: **do not build a
new vitals/labs subsystem** — log BP/HR/temp/lab values through existing `custom_measurements` /
`text_measurements`, which already flow into Reports and can feed the correlation engine (e.g.,
BP-med ↔ BP-reading). A thin "Vitals" view filters those measurements for the med context.

---

## Quick feasibility legend
✅ buildable now (manual or computation) · 🟡 manual-only or opt-in external · 🔴 cut.
Full rationale in [`01-feasibility-selfhosted.md`](./01-feasibility-selfhosted.md).
