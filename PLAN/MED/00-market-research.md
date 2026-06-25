# 00 — Market Research

How the top apps in this category work, and exactly what we borrow. Used to make sure the
SparkyFitness module is competitive without copying things a self-hosted app can't deliver.

## General medication trackers

### Medisafe — category leader
- Per-dose reminders, **drug-interaction warnings**, **refill / low-stock alerts**, side-effect info.
- **Family scheduling** — manage meds for dependents.
- **"MedFriend"** — a chosen backup contact is notified if you miss a dose. (The mockup's "MedFriend" card is this feature.)
- Core features free; polish behind a subscription.

### MyTherapy — best free, multi-condition
- Combines med reminders with **symptom journaling + activity logging**.
- Strong for chronic/multi-condition users (BP, depression, pain).
- Model for our **symptom tracker** and "reason for taking / effectiveness" fields.

### CareClinic — wellness companion
- Meds **+ nutrition + sleep + symptoms + habits**, caregiver sharing.
- Philosophically closest to SparkyFitness (which already does food/sleep/mood/measurements) — validates the "meds as one more pillar" approach.

## GLP-1-specific trackers (the hot category the mockup chases)

### Shotsy
- **Injection site rotation**, dose reminders, side-effect logging, weight tracking.
- **Medication-level charts from peer-reviewed PK data** → this is the mockup's "PK serum level" curve. It's half-life math, **no hardware** required.

### Glapp
- **Dose titration guidance** + **missed-dose guide**.
- Predicts hunger/cravings/side-effects from logged patterns.

### MeAgain
- Dedicated **per-drug side-effect trackers**; surfaces "rougher days right after a dose increase" — a pattern our correlation cards reproduce.

### Pep
- Shot tracker + injection reminders + site rotation + **protein/fiber/water food tracking + barcode scan**.
- SparkyFitness **already** does food/protein/water/barcode → strong reuse, the "protein-first GLP-1 logging" in the mockup is mostly existing functionality re-skinned.

## What we borrow (and where it lands)

| Borrowed feature | From | Phase |
|---|---|---|
| MedFriend backup contact (missed-dose email) | Medisafe | 2 |
| Refill / low-stock alerts | Medisafe | 1 |
| Family / caregiver med management | Medisafe, CareClinic | 0/1 (reuse `familyAccessRepository`) |
| Symptom journaling + reason-for-taking + effectiveness | MyTherapy | 1/4 |
| Injection site rotation (8-zone, lipo warning) | Shotsy, Pep | 3 |
| Titration / taper coach | Glapp | 3 |
| PK serum-level curve from half-lives | Shotsy | 3 |
| Per-drug side-effect log + post-dose pattern detection | MeAgain | 4/5 |
| Protein-first food logging | Pep | reuse existing Foods |
| Barcode scan for meds | Pep | 6 (opt-in) |

## What the leaders have that we deliberately do NOT copy

- **Real RX pricing / coupons / pharmacy + insurance integrations** (Medisafe/Pep lean on commercial data like GoodRx) → our cost fields are **manual**. See `01-feasibility-selfhosted.md`.
- **Telehealth / prescriber marketplace** (Found, Ro, Sequence) → out of scope; self-hosted, no clinical service.
- **CGM glucose forecasting** → needs hardware + ML → **manual glucose entry only**, optional.
- **Live anonymized community cohort with differential privacy** → cut; can't run a privacy-preserving aggregation service in a single-tenant self-hosted box.

## Sources

- GoodRx — Medication Reminder Apps: https://www.goodrx.com/healthcare-access/digital-health/medication-reminder-apps
- SingleCare — Best medication reminder apps: https://www.singlecare.com/blog/best-medication-reminder-apps/
- MyTherapy — Medisafe alternatives / GLP-1 companion apps: https://www.mytherapyapp.com/blog/medisafe-alternatives-free · https://www.mytherapyapp.com/glp1-apps
- Glapp: https://glapp.io/
- Shotsy: https://shotsyapp.com/ · https://apps.apple.com/us/app/shotsy-glp-1-tracker/id6499510249
- MeAgain: https://meagain.com/
- Pep: https://pepglp1.com/
