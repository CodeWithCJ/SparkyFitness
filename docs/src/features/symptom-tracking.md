# Symptom & Episode Tracking

SparkyFitness provides a comprehensive, generic symptom and episode tracking engine. It is designed to handle migraines, headaches, chronic pain, digestive issues, allergies, skin flare-ups, mental health episodes, and general ailments with zero vendor lock-in and complete data privacy.

---

## 1. Core Capabilities

* **Generic Engine**: Works for any symptom type with customizable templates (*Headache*, *Pain*, *GI*, *Respiratory*, *Skin*, *Mental*, *Generic*).
* **Episode Lifecycle**: Track start time, ongoing status, peak severity, severity timeline evolution, and end time.
* **Quick Logs**: Log quick single-point occurrences in seconds.
* **Symptom-Free Days**: Record days without symptoms to establish true baseline correlations.
* **Visual Location Maps**: Tappable SVG head and body maps with multi-region selection and chip fallbacks.
* **Triggers & Relief**: Track custom and built-in triggers, relief methods, and medication effectiveness (*Helped*, *Partly*, *Didn't help*). On the website the form offers medications to link only while Medications is turned on in **Settings → Features**; an entry that already has one keeps it.
* **Auto-Correlated Context**: Automatically surfaces day-before (D-1) and day-of (D0) food names, water, sleep, exercise, medication logs, and cycle phase without duplicate entry.
* **Reports & Clinician Export**: View monthly symptom days, acute-medication days with overuse cautions, episode comparison tables, and doctor-ready exports.

---

## 2. Managing Symptoms & Customization

Navigate to **Check-in -> Symptoms -> Manage Symptoms** to configure your tracking setup:
* **Templates**: Choose section bundles tailored to specific conditions (e.g. Migraine with aura phases vs. Lower Back Pain with body regions).
* **Severity Scales**: Configure scales per symptom (`1-5`, `1-10`, `none-severe`, `count`, `text`).
* **Custom Fields**: Add typed custom fields per symptom (e.g., *Blood glucose*, *Inhaler puffs*, *Rash diameter cm*).
* **Option Lists**: Customize, reorder, or add custom locations, qualities, associated symptoms, triggers, and relief methods.

---

## 3. Privacy & Family Delegation

* **Self-Hosted Privacy**: All health data remains securely stored in your local PostgreSQL database.
* **Family Access**: Granular `symptoms` permission allows sharing symptom logs with family members or caregivers without exposing private cycle data.
