> [!TIP]
> **Help us review and merge your PR faster!**
> Please ensure you have completed the **Checklist** below.
> For **Frontend** changes, please run `pnpm run validate` to check for any errors.
> PRs that include tests and clear screenshots are highly preferred!
> Note: AI-generated descriptions must be manually edited for conciseness. Do not paste raw AI summaries.

## Description

**What problem does this PR solve?**
(Keep it concise. 1–2 sentences.)

**How did you implement the solution?**
(Brief technical approach.)

Linked Issue: Closes #

## How to Test

1. Check out this branch and run `...`
2. Navigate to...
3. Verify that...

## PR Type

- [ ] Issue (bug fix)
- [ ] New Feature
- [ ] Refactor
- [ ] Documentation

## Checklist

**All PRs:**

- [ ] **[MANDATORY - ALL] Integrity & License**: I certify this is my own work, free of malicious code, and I agree to the [License terms](LICENSE).

**New features only:**

- [ ] **[MANDATORY for new feature] Alignment**: I have raised a GitHub issue and it was reviewed/approved by maintainers or it was approved on Discord.

**Frontend changes (`SparkyFitnessFrontend/`):**

- [ ] **[MANDATORY for Frontend changes] Quality**: I have run `pnpm run validate` and it passes.
- [ ] **[MANDATORY for Frontend changes] Translations**: I have only updated the English (`en`) translation file.

**Backend changes (`SparkyFitnessServer/`):**

- [ ] **[MANDATORY for Backend changes] Code Quality**: I have run typecheck, lint, and tests. New files use TypeScript, new endpoints have Zod schemas, and new endpoints include tests.
- [ ] **[MANDATORY for Backend changes] Database Security**: I have updated `rls_policies.sql` for any new user-specific tables.

**UI changes (components, screens, pages):**

- [ ] **[MANDATORY for UI changes] Screenshots**: I have attached Before/After screenshots below.

**Mobile changes (`SparkyFitnessMobile/`):**

- [ ] **[MANDATORY for Mobile changes] Tested on device or emulator**: I have verified the changes work on iOS or Android.

## Screenshots

<details>
<summary>Click to expand</summary>

### Before

![before](url)

### After

![after](url)

</details>

## Notes for Reviewers

> Optional — use this for anything that doesn't fit above: known tradeoffs, areas you'd like specific feedback on, qustions you have or context that helps reviewers.
