---
name: whats-new
description: Use whenever the user asks to update, refresh, or add to the mobile app's What's New screen, or when the "What's New screen is out of date" issue is open. Finds the features shipped since the last bump, groups them into cards, adds coded mockups with English strings, bumps the content version, and validates.
---

# What's New Update

Canonical copy. `.claude/skills/whats-new/SKILL.md` is a stub pointing here, the same way `CLAUDE.md` points at `AGENTS.md`.

The screen is `SparkyFitnessMobile/src/screens/WhatsNewScreen.tsx`. Its hero images are coded React mockups (theme variables, `t(...)` text), not screenshots, so no assets are needed. The banner is gated on `WHATS_NEW_CONTENT_VERSION` in `SparkyFitnessMobile/src/services/whatsNewBanner.ts`, not the app version.

## Steps

1. **Find what is new.** Run `.github/scripts/whats-new-drift.sh` (needs full git history; works from any directory in the repo). It prints `sha|subject` for each `feat` commit touching `SparkyFitnessMobile/src` since the version was last bumped. A matching open issue titled "What's New screen is out of date" lists the same commits, but only the first 40.
   This list is a heads-up, not a complete audit: it only matches subjects starting with `feat(`, `feat:` or `feat!`. Always audit the other mobile commits too, since a feature can be committed under another type: `git log --no-merges --format='%h %s' "$(.github/scripts/whats-new-drift.sh --marker)..HEAD" -- SparkyFitnessMobile/src`.
2. **Decide the cards.** Group related commits into a few cards (about 3 to 8). Skip internal, minor, or fix-like changes and fold small ones into a card's body. Check the code or `docs/` for what a feature really does before describing it; do not guess from a commit title. Ask the user if it is unclear which features deserve a card.
3. **Add each card** to the `features` array in `WhatsNewScreen.tsx`:
   - `eyebrow`, `headline`, `body`, a `hero`, and a `cta` that navigates to the matching root-stack screen (check the route exists in `src/types/navigation.ts` and takes no required params).
   - Reuse the screen's shared card mockup (`StatCardMockup`) when it exists; otherwise add a small mockup component in the file. Pass theme colors by CSS variable, never hex.
   - Wrap every string in `t('whatsNewPage...', { defaultValue })`.
4. **Add English strings** under `whatsNewPage.mockup` and `whatsNewPage.features` in `src/localization/locales/en/translation.json`. Edit only `en`; other locales are synced and CI rejects changes to them. Changing an existing English string leaves its translations stale until they sync, which is normal.
5. **Bump `WHATS_NEW_CONTENT_VERSION`** once per release of cards so the banner shows again. Do not bump it for a change that adds no content.
6. **Validate** from `SparkyFitnessMobile/`: `pnpm run validate` and `pnpm exec jest --watchman=false --runInBand __tests__/screens/WhatsNewScreen.test.tsx __tests__/services/whatsNewBanner.test.ts`. If `tsc` runs out of memory, set `NODE_OPTIONS=--max-old-space-size=8192`.
7. **Say what you could not check.** The screen has not been seen on a device unless someone did that; leave the PR template's device and validation-proof boxes for the author.

Committing and opening a PR follow `pr-submission`: no AI attribution anywhere, and keep the whole PR template.
