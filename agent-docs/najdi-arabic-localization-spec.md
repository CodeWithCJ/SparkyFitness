# Spec: Saudi-First Najdi Arabic Product Experience

_Status: active living spec_
_Created: 2026-07-10_

## Objective

Transform SparkyFitness into a polished Saudi-first product whose default experience feels written, designed, and tested for people in Saudi Arabia. Arabic is the lead language and English remains available. The product voice uses restrained, natural Najdi warmth where conversation helps, while medical, privacy, security, and destructive-action copy stays precise and professional.

This is a product-localization effort, not a word-for-word translation pass. It covers language defaults, terminology, RTL behavior, typography, dates and numbers, measurement defaults, navigation, validation, notifications, AI behavior, accessibility, and the critical web and mobile journeys.

## Working Assumptions

1. Web and mobile are both in scope; server-originated user messages, widgets, and AI prompts are in scope when they surface in either client.
2. Existing users keep an explicit saved language. A new user or installation with no explicit preference starts in Arabic.
3. `ar-SA` is the presentation locale. Health-record day strings remain Gregorian `YYYY-MM-DD` values at storage and API boundaries.
4. Saudi defaults are metric (`kg`, `cm`, `km`, `ml`) and `kcal`, with Sunday as the first day of the week.
5. Device timezone wins; `Asia/Riyadh` is only the Saudi fallback when no valid timezone is available.
6. English remains a complete fallback during migration so an incomplete Arabic catalog never exposes raw translation keys.
7. The external `CodeWithCJ/SparkyFitnessTranslations` repository remains the source of truth for non-English web catalogs. Generated locale files in this repository are not hand-edited.

## Audience and Voice

The primary audience is Saudi adults using SparkyFitness for everyday nutrition, exercise, hydration, fasting, measurements, medications, sleep, reproductive health, and family-supported care.

### Register rules

| Context                            | Register                        | Example direction                                                 |
| ---------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| Navigation, settings, forms        | Clear contemporary Saudi Arabic | Short, direct labels; familiar Saudi product terms                |
| Onboarding, celebrations, coaching | Light Najdi warmth              | Encouraging and human, with restrained phrases such as `يلا نبدأ` |
| Empty states and recovery          | Reassuring Saudi Arabic         | Explain what happened and the next useful action                  |
| Medical, pregnancy, medication     | Professional Arabic             | Precise terms; no slang, jokes, or false certainty                |
| Privacy, auth, destructive actions | Formal unambiguous Arabic       | State consequence before confirmation                             |
| AI chat                            | User-led Saudi Arabic           | Match the user's register; never caricature Najdi speech          |

### Copy rules

- Write for meaning and action, not English sentence structure.
- Prefer concise Saudi vocabulary that is understood across the Kingdom.
- Avoid exaggerated dialect spellings, filler, emojis, and repetitive encouragement.
- Avoid gender assumptions when a neutral construction is natural.
- Keep units, nutrient symbols, medication names, provider names, and technical identifiers readable in bidirectional text.
- Use Arabic punctuation and correct plural-aware messages rather than string concatenation.
- Do not localize user-entered content, brand names, API keys, URLs, or code.

## Saudi Presentation Policy

- Document/app direction: `rtl` for Arabic and `ltr` for other languages.
- Web root metadata: synchronize `lang` and `dir` whenever language changes.
- Dates: Gregorian for health-record consistency; default visible format `dd/MM/yyyy`.
- Calendar: Sunday-first. Hijri may be added later as an optional secondary display, never as an implicit storage conversion.
- Numbers: preserve unambiguous decimal entry and metric symbols; use locale-aware grouping without changing stored numeric values.
- Time: respect device/user preferences and localize day-period text.
- Units: `kg`, `cm`, `km`, `ml`, and `kcal` by default.
- Layout: use logical start/end properties. Mirror directional controls only when direction carries meaning; do not mirror charts, media controls, or universal symbols blindly.
- Typography: use an Arabic-capable system stack with comfortable Arabic line height and no web-font network dependency in the foundation slice.

## Current Baseline (2026-07-10)

- Web English catalog: 2,429 leaf messages.
- Web Arabic catalog: 479 leaf messages (19.7% coverage), with 1,951 English keys missing.
- Largest Arabic gaps: Settings (216), Reports (205), Medications (201), Admin (114), Goals (113), and Cycle (79).
- Web React surfaces: 390 `.tsx` files; 249 currently reference the translation layer and 141 do not.
- Web has no language-driven root `dir`/`lang` synchronization.
- Web contains about 906 physical left/right CSS or class references requiring semantic RTL review.
- Mobile has 147 `.tsx` files, no localization provider/catalog, and about 510 physical left/right references requiring semantic RTL review.
- Mobile and several web paths hardcode `en-US` for visible dates and speech.

These counts are audit indicators, not automatic defect counts. Tests, identifiers, data sorting, and genuinely directional controls must be classified before changes are made.

## Technical Approach

### Web

- Centralize locale policy (supported language, default language, direction, Intl locale, Saudi defaults).
- Keep `i18next` and the existing HTTP catalog loader.
- Preserve explicit stored preferences; default only absent preferences to Arabic.
- Synchronize the HTML root's `lang` and `dir` attributes and add RTL-aware base typography.
- Add automated catalog coverage and hardcoded-copy checks.
- Add or revise English source messages first; source Najdi Arabic through the translations repository and existing sync workflow.

### Mobile

- Add a typed localization foundation using the same stable message concepts as web where practical.
- Persist an explicit user language without overriding device/user choice after it is saved.
- Configure React Native RTL safely and document reload behavior where the platform requires it.
- Localize one complete vertical journey at a time: shell/onboarding, dashboard/diary, add flows, library, settings/auth, then secondary domains.
- Replace visible `en-US` formatting with centralized locale-aware formatters.

### Server, widgets, and AI

- Return stable error codes where clients can localize; do not parse English server prose for behavior.
- Localize unavoidable server-originated user messages by the user's language preference.
- Make notification and widget snapshots locale-aware without changing stored data contracts unnecessarily.
- Give Sparky the user's locale/register preference and require factual, restrained Saudi Arabic when Arabic is active.

## Commands

Run commands from the package being changed.

```bash
# Web
cd SparkyFitnessFrontend
pnpm run validate
pnpm test
pnpm run build

# Mobile
cd SparkyFitnessMobile
pnpm run validate
pnpm run test:run -- --watchman=false --runInBand

# Server (only when server-originated behavior changes)
cd SparkyFitnessServer
pnpm run validate
pnpm test
```

## Project Structure

- `SparkyFitnessFrontend/src/` — web locale policy, RTL behavior, components, and tests.
- `SparkyFitnessFrontend/public/locales/en/translation.json` — editable web source catalog.
- External `SparkyFitnessTranslations/locales/ar/translation.json` — editable Arabic web source catalog.
- `SparkyFitnessMobile/src/` — mobile localization provider, catalogs, formatters, screens, and components.
- `SparkyFitnessServer/` — stable error contracts and locale-aware server messages.
- `shared/src/` — cross-client locale types or pure formatting policy only when genuinely shared.
- `agent-docs/` — this spec, task ledger, audit results, and terminology decisions.

## Code Style

Prefer centralized semantic policy and translation keys over component-local language checks:

```ts
const policy = getLocalePolicy(language);

document.documentElement.lang = policy.htmlLanguage;
document.documentElement.dir = policy.direction;
```

Avoid scattered checks such as `language === 'ar' ? 'right' : 'left'`. Components should use logical layout primitives and translated messages.

## Testing Strategy

- Unit tests: locale normalization, default selection, direction, formatters, pluralization, and fallback behavior.
- Component tests: language switching, root metadata, navigation labels, forms, dialogs, and mixed Arabic/Latin content.
- Contract tests: catalog key parity, interpolation variables, forbidden raw keys, and stable server error codes.
- Browser QA: Arabic and English at 320, 768, 1024, and 1440 px; keyboard navigation; clean console; no clipped or reversed controls.
- Mobile QA: Android and iOS, small and large devices, cold start, language change, RTL reload behavior, and critical journeys.
- Linguistic review: terminology consistency, Najdi naturalness, medical safety, bidi readability, and removal of untranslated English.

## Boundaries

### Always

- Preserve unrelated user changes and stage only localization files.
- Write tests before behavioral changes and run the nearest suite after every slice.
- Keep English available and prevent raw-key fallbacks.
- Use logical start/end layout and verify whether icons should mirror.
- Keep medical and privacy copy precise.
- Commit small, reviewable slices on `feature/najdi-arabic`.

### Ask first

- Changing health calculations, database meaning, or API payload semantics.
- Removing an existing supported language.
- Adding an external runtime dependency when an approved existing dependency cannot solve the problem.
- Making Hijri dates primary or changing stored Gregorian day semantics.

### Never

- Hand-edit generated non-English web catalogs in this repository.
- Ship machine-translated Arabic without human-style review.
- Force dialect into medical, legal, security, or crisis messages.
- Mirror controls or charts solely because the page is RTL.
- Replace an explicit existing user language preference.
- Read or edit generated mobile native projects for localization when app config or TypeScript can express the change.

## Success Criteria

1. New users receive Arabic by default; saved language preferences persist and English can always be selected.
2. Web and mobile shells, onboarding, dashboard, diary, primary add flows, library, settings, and auth have complete reviewed Arabic with no visible raw keys or unintended English.
3. Arabic catalog coverage is 100% against the web source catalog, with interpolation and plural forms validated.
4. Root/app direction and mixed bidi content behave correctly; critical journeys have no clipping, overlap, reversed semantics, or inaccessible controls.
5. Saudi defaults are applied only when a user has no explicit preference.
6. User-facing dates, numbers, units, speech, notifications, widgets, and AI responses respect the active locale.
7. Web, mobile, and affected server validation suites pass, and runtime QA is clean in Arabic and English.
8. A final linguistic and five-axis code review finds no unresolved critical or important issue.

## Open Questions

- Whether the product should later offer Hijri as an optional secondary date display.
- Whether a Saudi Arabic human reviewer is available for the final medical and reproductive-health pass.
- Whether the external translations repository should add automated Arabic style/terminology checks beyond Weblate validation.
