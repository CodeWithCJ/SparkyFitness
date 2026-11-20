# Sparky Fitness brand mark

Source of truth for the app icon / logo: a heartbeat line peaking into a four-point spark.

- `sparky-mark.svg` — light-context color (`#F2375A`), transparent background. Used wherever the mark sits on a themed/unknown background (in-app logo, docs nav logo light variant).
- `sparky-mark-dark.svg` — dark-context color (`#FF6B82`), for dark backgrounds (docs nav logo dark variant, iOS dark-appearance icon gradient).
- `generate-icons.py` — regenerates every app icon / favicon / logo file in the repo from the two SVGs above. Requires `rsvg-convert` and ImageMagick's `magick` on `PATH`. Run from anywhere:

  ```bash
  python3 brand/generate-icons.py
  ```

## What it touches

- `SparkyFitnessMobile/assets/icons/appicon.icon/` — iOS Icon Composer bundle (light/dark/tinted appearances); `icon.json`'s gradient colors are edited by hand, not generated.
- `SparkyFitnessMobile/assets/icons/adaptiveicon.png` — Android adaptive icon foreground.
- `SparkyFitnessMobile/assets/icons/watchicon.png`, `live-activity-icon.png`.
- `SparkyFitnessMobile/assets/images/logo.png` / `logo@2x.png` — in-app logo (Onboarding, About).
- `SparkyFitnessMobile/targets/watch/` and `targets/widget/` `AppIcon.appiconset` — watch app and widget extension icons (must stay opaque; no alpha channel).
- `SparkyFitnessFrontend/public/favicon.ico`, `public/images/icons/icon-192x192.png` / `icon-512x512.png`, `public/images/SparkyFitness.webp` (apple-touch-icon).
- `docs/src/public/favicon.ico`, `logo.png` (hero image), `logo-light.svg` / `logo-dark.svg` (nav logo, wired into `.vitepress/config.mts` `themeConfig.logo`).

After running the generator for a mobile icon/asset change, regenerate the native projects:

```bash
cd SparkyFitnessMobile && npx expo prebuild --clean
```
