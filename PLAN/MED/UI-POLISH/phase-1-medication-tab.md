# Phase 1 — Medication tab UI polish

Files: `pages/Medications/Medications.tsx`, `pages/Medications/Glp1Coach.tsx`,
`shared/src/medications/glp1.ts`. Keeps the existing Today / Cabinet / Symptoms views + GLP coach;
polish + add missing UI inside them. Four reviewable sub-sections.

## 1a · GLP-1 coach + clickable body map  *(headline)*
- [ ] **Expand injection sites** to ~15 granular (from `../screenshots/injection sites*.jpeg`):
      stomach upper/lower × left/mid/right + left/right mid, both arms, both thighs, both hips,
      `unknown`. In `shared/src/medications/glp1.ts`; each site gets `region` + `svgClass`. Old
      free-text `site` values still render.
- [ ] **Clickable body map** replacing the 8-button grid: add `public/images/injection-body.svg`
      (`<path class="<site-id>">` per zone); generalize `BodyMapFilter.tsx` → reusable clickable-SVG
      (`svgUrl`, `regionIds`, `selected`, `suggested`, `resting`, `onSelect`). Colors: suggested =
      green, resting/lipo = amber + warning, selected = blue, inactive = dim. Keep pen auto-deduct.
- [ ] **Restyle**: pens → cards with **dose progress bars** (doses left, expiry/BUD, reorder badge);
      titration → **vertical timeline** (dots, dates, active highlight); PK chart → dose markers /
      shot-phase shading; add the **oral-GLP-1 fasting timer**.

## 1b · Cabinet view
- [ ] **Rich med cards**: type badge, schedule summary, **refill/inventory progress bar**, low-stock badge.
- [ ] **KPI tiles**: active scripts + next refill (existing fields). **No cost tile.**
- [ ] **Expand Add/Edit dialog**: type chips, prescriber / pharmacy / Rx# / reason / inventory
      (fields already in schema). **No cost fields.**
- Defer: interactions banner + resource center (need enrichment APIs).

## 1c · Symptoms view
- [ ] Dropdown → **emoji symptom chip grid** with GLP-flag badge.
- [ ] **"Where does it hurt" body pin** reusing the 1a body-map component.
- [ ] **GI sub-tracker tiles** (nausea onset, episodes/week from logs).
- [ ] Keep + restyle the existing Bristol scale, pattern hints, history calendar.

## 1d · Today (medication) view
- [ ] **KPI stat-tile row** (meds today X/Y, streak), **next-injection banner** (countdown + serum %),
      **weekly adherence ring** (14-day from `medication_entries`).
- [ ] Restyle scheduled-dose rows to mock cards; keep take / skip / snooze.
- Defer (no real data): MedFriend card, hydration nudge, lifestyle score, XP.

## Acceptance
Body map works (suggested green / resting amber + warning); sites expanded + customizable;
pens/titration/cards/Today restyled to mock quality; auto-deduct unchanged; **no cost; no fake metrics.**
