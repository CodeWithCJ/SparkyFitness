# Translations

SparkyFitness is translated through [Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness/). Contributors who write code touch only the English files; every other language is owned by translators and reaches the apps automatically.

## The one rule for contributors

**Only edit the English (`en`) files.** A pull request that changes any other language is rejected by CI.

Always pair a key with an English fallback in the code itself, so a missing translation degrades to readable English rather than a raw key:

```tsx
t('nav.diary', { defaultValue: 'Diary' })
```

## Five Weblate components

The web app has one translated file per language. The mobile app has four, because its surfaces use different formats and placeholder syntax and cannot share a component — Weblate translates each real file directly.

| Component | English source | Format |
| --- | --- | --- |
| Web | `SparkyFitnessFrontend/public/locales/en/translation.json` | i18next JSON, `{{value}}` |
| Mobile runtime | `SparkyFitnessMobile/src/localization/locales/en/translation.json` | i18next JSON, `{{value}}` |
| Mobile permissions | `SparkyFitnessMobile/locales/en.json` | Expo metadata JSON |
| Android widget | `SparkyFitnessMobile/targets/android-widget/res/values/widget_strings.xml` | Android resources, `%1$s` |
| iOS widget | `SparkyFitnessMobile/targets/widget/en.lproj/Localizable.strings` | Apple Strings, `%@` |

The widgets need real Android and iOS resource files rather than the JSON catalog: they render outside the app process, so the widget itself, its name and description in the widget gallery, and its appearance before the first data sync cannot depend on the app's runtime translations.

## How a translation travels

```text
you edit an en/ source
        │
        ▼
 sync-translations.yml ──push──►  SparkyFitnessTranslations  ──►  Weblate
                                        (translators)
        ◄──────────────────pull──────────────────┘
        │
        ▼
 PR "chore(i18n): sync translations from Weblate"  ──►  merged  ──►  shipped
```

[`SparkyFitnessTranslations`](https://github.com/CodeWithCJ/SparkyFitnessTranslations) is the repository Weblate is connected to. The workflow runs on demand and opens one pull request on each side. Translators never open a pull request here, and you never open one there.

## Adding a language

You do not create translation files by hand.

1. Ask on [Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness/) for the language to be added. Translation can start immediately and stay incomplete for as long as it needs — missing strings fall back to English, and a partially translated widget falls back to the English resource.
2. The sync workflow brings the catalogs into this repository. At this point the language is a *translation candidate*: present in the repo, not yet shipped.
3. A maintainer enables it when it is complete enough:
   - **Web** — add the code to `getSupportedLanguages()` and `getLanguageDisplayName()` in `SparkyFitnessFrontend/src/utils/languageUtils.ts`.
   - **Mobile** — add an entry to `SparkyFitnessMobile/src/localization/localeRegistry.json`, then run `pnpm run i18n:generate`.
4. The next sync brings that language's widget resources in as well.

Only step 3 makes a language visible to users, and until then it costs nothing: an unregistered mobile catalog is never bundled into the app, and defects in it are reported as diagnostics rather than failing CI for everyone.

The widget resources arrive a step later than the catalogs, and that is deliberate. Android compiles every `values-*` directory it finds and the iOS widget target ships every `.lproj` folder in it, so a widget resource is live as soon as it lands — there is no registry check at build time to hold it back. Pulling those two surfaces only for registered locales keeps `localeRegistry.json` the single answer to "which languages does this app ship", and avoids a device showing a translated widget above an English app.

## Checking your work

```bash
# Web
cd SparkyFitnessFrontend && pnpm run validate

# Mobile — includes the i18n audit and the native widget resource validator
cd SparkyFitnessMobile && pnpm run validate
```

The mobile audit is strict about the English source: every key used with `t()` must exist, plural families must be complete, and placeholders must line up. It is deliberately lenient about translations, which are allowed to be missing or incomplete.
