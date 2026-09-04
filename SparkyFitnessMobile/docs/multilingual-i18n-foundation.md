# Mobile multilingual i18n foundation

English (`en`) is the canonical source locale and deterministic fallback. The source catalog uses **i18next JSON v4**:

- Base/source: `src/localization/locales/en/translation.json`
- File mask: `src/localization/locales/*/translation.json`

English source plural families contain only the English CLDR categories from `Intl.PluralRules('en-US')` (`_one` and `_other` on the current platform), with optional intentional `_zero`. Target languages may use different CLDR categories, such as Polish, German, or Arabic.

Missing or empty target translations are allowed, reported as non-blocking coverage, and fall back to English at runtime. Translation completeness is not a feature-PR blocking condition. Structural corruption of a non-empty translation—malformed JSON, incompatible types, array-shape errors, placeholder mismatches, collisions, or invalid plural categories—remains blocking.

`src/localization/localeRegistry.json` is the shared registry data contract. Registry keys are the canonical application/native BCP-47 tags; only explicitly registered locales are shipped. Adding a language to Weblate does not ship it until the registry and native/platform support are updated.

React Native catalogs and native resources are separate translation surfaces: Expo metadata (`locales/*.json`), Android widget resources (`targets/android-widget/res/values*/`), and iOS widget/Live Activity resources (`targets/widget/*.lproj/Localizable.strings`).

## Weblate and future-language contract

`localeRegistry.json` is the sole shipping contract. A Weblate directory is a
translation candidate, not a product language: target catalogs discovered below
`src/localization/locales/*/translation.json` are audited for coverage and
structural correctness, but only a registry entry makes a locale visible to the
runtime, language picker, Expo native configuration, Android locale bridge, and
widget locale bridge.

### Translation surfaces / Weblate components

1. **React Native runtime** — source
   `src/localization/locales/en/translation.json`; mask
   `src/localization/locales/*/translation.json`.
2. **Expo/native metadata** — source `locales/en.json`; mask `locales/*.json`.
3. **Android widgets** — source
   `targets/android-widget/res/values/widget_strings.xml`; targets
   `targets/android-widget/res/values-*/widget_strings.xml`. Language-only tags
   use `values-de`; BCP-47 tags with region/script use Android's
   `values-b+de+DE` form.
4. **iOS widgets / Live Activities** — source
   `targets/widget/en.lproj/Localizable.strings`; mask
   `targets/widget/*.lproj/Localizable.strings`.

These are four separate Weblate components, synced both ways by
`.github/workflows/sync-translations.yml` alongside the web catalog: the English
source of each is pushed to `mobile/…` in
[SparkyFitnessTranslations](https://github.com/CodeWithCJ/SparkyFitnessTranslations),
and every other language is pulled back. Translators edit the real native files,
so no format conversion sits between Weblate and the app. EN is the canonical
source and fallback. Only EN requires complete, non-empty source coverage. Target missing
or empty values are coverage diagnostics and fall back to EN/default native
resources; malformed JSON/XML/strings, incompatible type/array shape,
placeholder mismatch, plural collision, and invalid CLDR plural category remain
blocking.

A catalog that arrives without a registry entry is a translation candidate: it
is not bundled, and the i18n audit reports its defects as non-blocking
`unregisteredLocaleFindings` so an unshipped language cannot redden CI.
Registered locales stay fully blocking.

The runtime catalog and the metadata are gated at build time, so a candidate is
free to sit in the repo. The widget resources have no such gate — Android
compiles every `values-*` directory and the iOS widget target ships every
`.lproj` folder — so the sync workflow pulls those two surfaces for registered
locales only, and a candidate's widget arrives on the sync after it is
registered.

`pnpm run i18n:generate` deterministically emits
`src/localization/generatedLocaleResources.ts` with Metro-safe static imports
for every shipped runtime catalog. `pnpm run i18n:generate:check` is included in
`validate`, so a registry change without regenerated source fails CI. The same
validation requires a metadata JSON and syntactically valid Android/iOS widget
resource surface for every shipped locale; widget files may be partial because
native resource resolution falls back to default/source resources.

### Adding `de`

1. Let Weblate create/sync runtime, metadata, Android-widget and iOS-widget
   translations; the sync workflow brings them into the repo. They can be
   incomplete throughout translation work.
2. When ready to ship, add `de` metadata to `localeRegistry.json`, provide its
   runtime and metadata files plus (possibly partial) native widget files, and
   run `pnpm run i18n:generate`.
3. Run `pnpm run validate` and prebuild. No edits to `i18n.ts`,
   `AppSettingsScreen.tsx`, `app.config.ts`, Android Kotlin, Swift, or the Expo
   plugins are required.
