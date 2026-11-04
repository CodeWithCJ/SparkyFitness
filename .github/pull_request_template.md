> [!TIP]
> **Help us review and merge your PR faster!**
> Please complete the **Checklist** below. Typecheck, lint, format and tests run automatically in CI, so there are no boxes for them, but please run them locally first (`pnpm run validate` and `pnpm test` in each package you changed).
> **Before you submit:**
>
> - Translations: only edit the English (`en`) files. Other languages are synced automatically and CI will reject changes to them.
> - Backend: new files use TypeScript, new endpoints have Zod schemas and tests, and new user-specific tables get an entry in `rls_policies.sql`. Reviewers check these; CI does not.
>
> PRs that include tests and clear validation proof (screenshots or a screen recording) are highly preferred.
>
> Note: Descriptions must be edited for conciseness. Do not paste raw generated summaries.
>
> Title format: start with a type, like `feat:`, `fix:`, `docs:`, `refactor:` or `security:`.
>
> Only one SQL migration per PR is allowed. Edit that single file in place as the PR evolves.

## Description

**What problem does this PR solve?**
(Keep it concise. 1–2 sentences.)

**How did you implement the solution?**
(Brief technical approach.)

Linked Issue: Closes #

<!-- Only part of the fix? Change "Closes" to "Part of" (or "Related to"). The issue stays open. "Closes", "Fixes" and "Resolves" close it automatically when this PR merges. -->

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

- [ ] **[MANDATORY - ALL] Integrity & License**: I certify this is my own work, free of malicious code, and I agree to the [License terms](https://github.com/CodeWithCJ/SparkyFitness/blob/main/LICENSE).

**New features only:**

- [ ] **[MANDATORY for new feature] Alignment**: I have raised a GitHub issue and it was reviewed/approved by maintainers or it was approved on Discord.

**UI changes (components, screens, pages):**

- [ ] **[MANDATORY for UI changes] Validation proof**: I have attached screenshots or a screen recording showing the change working. This saves maintainers from re-testing by hand.

**Mobile changes (`SparkyFitnessMobile/`):**

- [ ] **[MANDATORY for Mobile changes] Tested on device or emulator**: I have verified the changes work on iOS or Android.

## AI Assistance

Pick **one**. This helps maintainers choose how closely to review.

- [ ] **No AI**: I wrote this change without AI tools.
- [ ] **AI, reviewed line by line**: AI wrote part of this. I read every generated line and edited it before accepting.
- [ ] **AI, tested and partly understood**: AI wrote most of this. I tested the behavior, but I only partly understand the generated code.
- [ ] **AI, tested only**: AI wrote this and I did not review the code myself. I tested the behavior only.

## Validation Proof

Attach screenshots or a screen recording of the change working (before/after for UI changes). Backend-only changes can paste test or request output instead.

<details>
<summary>Click to expand</summary>

Drag and drop your screenshots or recording here.

</details>

## Notes for Reviewers

> Optional — use this for anything that doesn't fit above: known tradeoffs, areas you'd like specific feedback on, questions you have or context that helps reviewers.
