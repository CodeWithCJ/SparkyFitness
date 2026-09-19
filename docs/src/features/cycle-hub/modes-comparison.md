# Cycle Tracking Modes Comparison

The Period & Cycle Hub supports 5 distinct tracking modes to align with different physiological phases. Below is a detailed feature comparison, active features, and the roadmap for upcoming modes.

## Feature Matrix

| Feature / Capability | Standard Mode | TTC Mode | Pregnancy Mode | Postpartum Mode (Roadmap) | Menopause Mode (Roadmap) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Menstrual Flow Logging** | Yes | Yes | No | Lochia Only | No (or highly irregular) |
| **Cycle Length Predictions** | Yes (Next 3) | Yes (Next 3) | No | No (Suspended) | No (Irregularity focus) |
| **Fertile Window / Ovulation** | Yes (Stats-based) | Yes (Advanced) | No | No | No |
| **BBT & Biphasic Detection** | Yes | Yes (Enhanced) | No | No | No |
| **Symptom Phase Matrix** | Yes | Yes | No (Trimester-based) | Yes (Recovery-based) | Yes (Hot flash focus) |
| **Fetal Milestones & Kick Counter** | No | No | Yes | No | No |
| **Contraction Timer** | No | No | Yes | No | No |
| **HRT (Hormone Replacement) Log** | No | No | No | No | Yes |
| **Breastfeeding / Kegels Log** | No | No | No | Yes | No |

---

## Tracking Modes Detail

### 1. Standard Cycle Tracking (`standard`)
* **Status**: **Fully Active** (Included in Onboarding)
* **Goal**: Track menstruation history, forecast upcoming periods, and log standard physical/emotional symptoms.
* **Key Features**:
  * Predicts next 3 cycles.
  * Estimates ovulation and standard fertile windows.
  * Standard symptom-to-cycle-phase correlation matrix.

### 2. Trying to Conceive (`ttc`)
* **Status**: **Fully Active** (Included in Onboarding)
* **Goal**: Maximize the probability of conception by tracking fertility biomarkers.
* **Key Features**:
  * **Cervical Mucus & Position Picker**: Logs fluid quality (creamy, eggwhite, etc.) and cervical changes.
  * **Intercourse Logger**: Logs session timing with protected/unprotected tags.
  * **Enhanced Ovulation Detection**: Integrates Basal Body Temperature (BBT) biphasic spikes and Luteinizing Hormone (LH) test strips to pinpoint ovulation.

### 3. Pregnancy Tracking (`pregnant`)
* **Status**: **Fully Active** (Included in Onboarding)
* **Goal**: Track gestational progress, fetal development, and pregnancy-specific milestones.
* **Key Features**:
  * **Pregnancy Today Dashboard**: Replaces cycle predictions with gestational weeks/days, estimated due date (EDD) countdown, and fetus size comparisons (e.g. size of a fruit).
  * **Contraction Timer**: Logs contraction durations and frequencies to detect active labor.
  * **Kick Counter**: Records fetal movement sessions.

### 4. Postpartum & Recovery (`postpartum`)
* **Status**: **Roadmap / Database Placeholder** (Excluded from Onboarding)
* **Goal**: Track maternal recovery after childbirth, hormonal resetting, and newborn care integration.
* **Planned Features**:
  * **Lochia Tracker**: Specialized log for postpartum discharge stages (rubra, serosa, alba).
  * **Breastfeeding & Pump Logger**: Logs feeding intervals, breast sides, and milk volumes.
  * **Pelvic Floor (Kegels) Reminders**: Tracks daily pelvic floor rehabilitation.
  * **Sleep Deficit Heatmap**: Correlates night wakings with maternal fatigue and recovery levels.

### 5. Menopause Transition (`menopause`)
* **Status**: **Roadmap / Database Placeholder** (Excluded from Onboarding)
* **Goal**: Track the perimenopause and menopause transition, focusing on hot flashes, irregular cycles, and hormone therapy.
* **Planned Features**:
  * **Hot Flash Intensity Tracker**: Instant log button to record severity and frequency of hot flashes or night sweats.
  * **Anovulatory Cycle Tracking**: Mode to identify non-ovulatory or highly irregular cycles without triggering standard period predictions.
  * **HRT Compliance logs**: Tracks hormone replacement therapy usage and symptom mitigation.
  * **Bone Density & Estrogen Projections**: Educational charts tracing age-related hormonal shifts.
