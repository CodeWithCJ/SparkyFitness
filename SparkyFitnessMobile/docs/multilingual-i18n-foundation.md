# Mobile multilingual i18n foundation

English (`en`) is the canonical source locale and deterministic fallback. The source catalog uses **i18next JSON v4**:

- Base/source: `src/localization/locales/en/translation.json`
- File mask: `src/localization/locales/*/translation.json`

English source plural families contain only the English CLDR categories from `Intl.PluralRules('en-US')` (`_one` and `_other` on the current platform), with optional intentional `_zero`. Target languages may use different CLDR categories, such as Polish, German, or Arabic.

Missing or empty target translations are allowed, reported as non-blocking coverage, and fall back to English at runtime. Translation completeness is not a feature-PR blocking condition. Structural corruption of a non-empty translation—malformed JSON, incompatible types, array-shape errors, placeholder mismatches, collisions, or invalid plural categories—remains blocking.

`src/localization/localeRegistry.json` is the shared registry data contract. Registry keys are the canonical application/native BCP-47 tags; only explicitly registered locales are shipped. Adding a language to Weblate does not ship it until the registry and native/platform support are updated.

React Native catalogs and native resources are separate translation surfaces: Expo metadata (`locales/*.json`), Android widget resources (`targets/android-widget/res/values*/`), and iOS widget/Live Activity resources (`targets/widget/*.lproj/Localizable.strings`).
