# Mobile multilingual i18n foundation

English (`en`) is the canonical source locale. `src/localization/localeRegistry.ts` is the authoritative registry of shipped locales and provides the English fallback. A catalog directory or Weblate language is not shipped until it is explicitly registered and native/platform support is verified.

React Native catalogs use `src/localization/locales/<locale>/translation.json` with English as the Weblate monolingual source and an i18next JSON v4 file mask. Native resources are separate translation surfaces: Expo metadata (`locales/*.json`), Android widget resources (`targets/android-widget/res/values*/`), and iOS widget/Live Activity resources (`targets/widget/*.lproj/Localizable.strings`). Existing translated resources are structurally validated, but translation completeness is asynchronous and non-blocking.

Feature developers must add English source keys, semantic static keys, explicit English fallbacks, count-based plural calls, locale-aware presentation helpers, and no user-facing hardcoded strings. They do not need to know or translate Polish or wait for Weblate. Missing translations resolve deterministically to English. User/server/custom content remains literal.
