# GitHub Actions Workflows

This directory contains all GitHub Actions workflows for the SparkyFitness project.

## Workflows Overview

### CI/CD Workflows

#### `ci-tests.yml`

**Purpose**: Run automated tests for Frontend, Backend, Mobile, and Garmin components.

**Triggers**: Pull requests and pushes to `main` branch

**What it does**:

- Detects which components changed using path filters
- Runs component-specific test suites:
  - **Frontend**: `pnpm run validate` + `pnpm run test:ci` (type check, lint, format, tests)
  - **Backend**: Format check, lint, tests
  - **Mobile**: Lint + `pnpm run test:ci`
  - **Garmin**: Python pytest with coverage
- Uploads coverage reports as artifacts

---

#### `pr-validation.yml`

**Purpose**: Validate that PR submissions follow contribution guidelines and required checkboxes are checked.

**Triggers**: Pull request activity, submitted/dismissed reviews, and created/deleted review comments

**What it does**:

- Analyzes changed files to detect Frontend, Backend, Mobile, and UI changes
- Validates required checkboxes based on change type:
  - **All PRs**: Integrity & License checkbox
  - **New Features**: Alignment checkbox (issue approval)
  - **Mobile Changes**: Tested on device or emulator checkbox
  - **UI Changes**: If the Validation proof checkbox is ticked, the body must contain an image or video
  - **AI assistance**: exactly one of four review-depth options. The last two (partly understood / tested only) add the neutral `needs-extra-review` label, which is add-only. Owner and bots are exempt.
- Enforces the PR title prefix (`feat:`, `fix:`, `docs:`, ...), because labels and the changelog are built from it
- Fails PRs that touch more than one SQL migration under `SparkyFitnessServer/db/migrations/` (one idempotent migration per PR)
- Warns when a migration creates a table but `rls_policies.sql` was not updated
- Typecheck, lint, format, knip and tests are not checkbox items; `ci-tests.yml` enforces them
- Posts validation results as a comment on the PR
- Fails the check if required checkboxes are missing
- Updates the same comment on subsequent edits (no spam)

Review events from forks have read-only tokens. They still validate the checklist and unresolved review conversations, with results in the job summary. Labels, checklist restoration, and the PR validation comment are updated only on `pull_request_target` events. Review runs cannot cancel those updates, and policy rules are always loaded from the PR base.

**Change Detection Logic**:

```javascript
hasFrontendChanges = files in SparkyFitnessFrontend/ or src/
hasBackendChanges = files in SparkyFitnessServer/
hasMobileChanges = files in SparkyFitnessMobile/
hasUIChanges = .tsx/.jsx/.css files in components/screens/pages/
```

**Validation Rules**:

- ❌ **ERRORS** (fail the check):
  - Missing "Integrity & License" checkbox (ALL)
  - Missing "Alignment" checkbox (NEW FEATURES)
  - Missing "Tested on device or emulator" checkbox (MOBILE)
  - Missing or unknown PR title prefix
  - More than one SQL migration file in the PR
  - Zero or more than one "AI assistance" option ticked
  - "Validation proof" ticked but no image or video in the body
- ⚠️ **WARNINGS** (informational):
  - Migration creates a table without an `rls_policies.sql` change
  - Missing description
  - Missing linked issue

**Important**: This workflow prevents contributors from removing checkboxes. If checkboxes are removed, the validation fails.

---

### Release Workflows

#### `release-please.yml`

**Purpose**: Derive the next version from Conventional Commits and draft the release.

**Triggers**: Pushes to `main`, and manual workflow dispatch

**What it does**:

- Keeps a `chore: release vX.Y.Z` PR open that bumps every version file (the workspace `package.json`s, `SparkyFitnessMobile/app.json`, `helm/chart/Chart.yaml`, `version.txt`) and `CHANGELOG.md`. The bump follows SemVer: `feat:` → minor, `fix:`/`perf:` → patch, `feat!:` or a `BREAKING CHANGE:` footer → major. Commits without a conventional prefix are ignored.
- Re-formats the JSON version files on the release PR branch with Prettier, since release-please writes them with plain `JSON.stringify`
- When the release PR is merged, creates a **draft** release and its tag, and replaces the body with `.github/release-preamble.md` + GitHub's generated notes (the same body `draft-release.yml` builds)

Nothing ships until a maintainer fills in the Key Highlights and publishes the draft. The `release: published` workflows below start on that publish, but the Docker images and the Android build wait for a maintainer to approve them in the `release` environment (Actions tab, **Review deployments**). The Helm chart, the Umbrel package PR and the release notifications follow once the Docker images are pushed; the Helm chart waits for a second approval in the same environment. The Umbrel App Store submission also waits for approval, after its package PR is merged.

**Release order**: the tag is created on the release PR's merge commit, and the workflows that build the release (Docker images, Android APK, release assets, Helm chart, docs) check out that tag. Anything merged after the release PR misses the release, even if the draft is published later. Before merging it:

1. In Weblate, commit the pending translations (repository maintenance), so the last day of work reaches SparkyFitnessTranslations.
2. Run **Sync Translations** from `main` (it also runs every night), wait for it to finish, and merge its `chore(i18n): sync translations from Weblate` PR if one is open. If the summary shows that the translations PR step failed, fix the cause and run it again. "Unchanged" with no PR means there is nothing to merge, and a failure on the English PR does not block this step.
3. Wait for CI and Release Please on `main` to finish.
4. Merge the release PR and wait for its Release Please run to finish, because it rewrites the draft's body. Then add the Key Highlights and publish the draft.
5. In the Actions tab, approve the waiting `release` deployments of **Publish Docker Images** and **Build Android APK**. Approve only runs you started: the environment's secrets sign the app and push the images.

The `pull-request-header` in `release-please-config.json` repeats these steps at the top of the release PR. It is missing when the release notes are too long for a PR body, because release-please then replaces the whole body with a link to them.

Config lives in `release-please-config.json`; the current version in `.release-please-manifest.json`. It runs with the SparkyFitness-Sync app token from the `sync-app` environment (only `main` can use it), so CI runs on the release PR. The app is the only actor besides admins that the `Release tags` ruleset lets create, move or delete `v*` tags, so a workflow pushed on another branch cannot mint a release tag with `GITHUB_TOKEN`. Its version-file formatting runs with no token on disk; only the push after it gets the token.

---

#### `draft-release.yml`

**Purpose**: Manually create a draft release for a version release-please does not produce, such as a four-segment hotfix (`v1.7.3.1`)

**Triggers**: Manual workflow dispatch (`tag`, optional `previous_tag` and `target`)

---

### Deployment Workflows

#### `auto-docker-deploy.yml`

**Purpose**: Build and push the Docker images for a release

**Triggers**: Release publication, and manual workflow dispatch. Its job runs in the `release` environment, so it waits for a maintainer's approval and can only run from `main` or a `v*` tag. A run from a tag names the images after that tag. Only the newest release moves the `latest` tag, so approving an older release's run late, or dispatching an older tag, does not move it back.

**Requires**: `DOCKER_USERNAME`, `DOCKER_PASSWORD` and `GHCR_TOKEN` in the `release` environment. See [GHCR publishing](#ghcr-publishing).

---

#### `manual-docker-deploy.yml`

**Purpose**: Manual Docker deployment workflow

**Triggers**: Manual workflow dispatch, from `main` or a `v*` tag only. Its job runs in the `release` environment and waits for a maintainer's approval; a dispatch from any other branch fails before it can read the Docker Hub or GHCR credentials.

---

#### `helm-release.yml`

**Purpose**: Create Helm chart releases

**Triggers**: Completion of `Publish Docker Images` for an actual `release` event, and manual workflow dispatch (pushes a `0.0.0-dev` chart). It waits for the images rather than running on `release: published`, so the chart never points at image tags that do not exist yet. Its job runs in the `release` environment, so it waits for a maintainer's approval and a dispatch from a branch other than `main` cannot push a chart.

**Requires**: `GHCR_TOKEN` in the `release` environment. See [GHCR publishing](#ghcr-publishing).

#### GHCR publishing

The images (`sparkyfitness-frontend`, `-server`, `-garmin`) and the chart (`charts/sparkyfitness`) are pushed with `GHCR_TOKEN`, a classic personal access token with only the `write:packages` scope, held in the `release` environment. No workflow asks for `packages: write`, but that alone does not stop a workflow pushed on another branch from asking for it. **Required setup**, on each package's **Package settings** page (`sparkyfitness-frontend`, `-server`, `-garmin`, `-mcp`, `charts/sparkyfitness`):

- **Manage Actions access**: set this repository's role to **Read**, or remove it. Only then can `GITHUB_TOKEN` not push the package.
- **Inherited access**: untick **Inherit access from source repository**. While it is ticked, everyone with write access to this repository, including collaborators, can push the package directly with their own token, with no workflow or approval. Unticking it copies those people into **Manage access** with their roles, so then **Remove** each of them there; the list should end up empty, since the owning account needs no entry.

Check both again after adding a package: a new package starts with inherited access unless the account's default package setting has it unticked.

Create the token at <https://github.com/settings/tokens/new?scopes=write:packages> (that link leaves `repo` unticked; ticking `write:packages` by hand ticks `repo` too, which this token must not have). Rotate it before it expires, or the next release's pushes fail at the GHCR login.

---

#### `umbrel-app-update.yml`

**Purpose**: Keep the [Umbrel App Store](https://github.com/getumbrel/umbrel-apps) package in `umbrel/sparkyfitness/` in step with releases.

**Triggers**: Completion of `Publish Docker Images` for an actual `release` event, and manual workflow dispatch (optional `version` input)

**What it does**:

- Runs `umbrel/update-package.mjs`, which re-pins the frontend, server, Garmin, and PostgreSQL images to their current multi-arch manifest-list digests and rewrites `version` and `releaseNotes` from the GitHub release body
- Lints the result against a fresh `getumbrel/umbrel-apps` checkout with `npm run lint:apps -- sparkyfitness --check-images`, in a separate, tokenless job — the App Store's own install/lint scripts never run in a job that can write to this repository
- Opens a PR here on `umbrel/update-app-package`

It runs after `Publish Docker Images` rather than on `release: published` because the package pins image digests, and those images do not exist until that workflow has pushed them. A `workflow_dispatch` re-run of `Publish Docker Images` (which rebuilds the current branch under the latest tag rather than a new release) is excluded, so a manual rebuild can't be mistaken for a new release.

Submitting to the App Store is a separate workflow (`umbrel-app-submit.yml`) that only runs once this PR is merged — that merge is the human review gate, not something this workflow bypasses by opening both PRs in the same run.

---

#### `umbrel-app-submit.yml`

**Purpose**: Carry an already-merged `umbrel/sparkyfitness/` change to the Umbrel App Store pull request.

**Triggers**: Push to `main` touching `umbrel/sparkyfitness/**` or `umbrel/update-package.mjs`, and manual workflow dispatch

**What it does**:

- Reads the version from the just-merged `umbrel-app.yml`
- Forks `getumbrel/umbrel-apps` on first run (polling until the fork is ready before pushing to it)
- Clones the upstream App Store and patches its **existing** copy of the package in place with `update-package.mjs --target`, touching only `version`, `releaseNotes`, and the pinned image lines — never replacing the whole directory, so anything the Umbrel team has since added (gallery images, an icon, a category change) survives
- Opens or reuses the App Store pull request

The initial App Store submission stays manual (see `umbrel/README.md`): `submission:` has to name a PR that doesn't exist yet, and the Umbrel team wants screenshots on it. This workflow only ever patches a package that already exists upstream, so it is a no-op until that first PR has been merged by the Umbrel team.

**Requires**: the `UMBREL_APPS_TOKEN` secret (a PAT with `public_repo` scope) in the `release` environment, so the job waits for a maintainer's approval. Do not keep a repository-level copy: a workflow pushed on any branch can read repository secrets. Without it, the step is skipped with a warning.

---

### Documentation Workflows

#### `docs-test.yml`

**Purpose**: Test documentation builds on PRs

**Triggers**: Pull requests affecting `docs/` directory

---

#### `docs-deploy.yml`

**Purpose**: Deploy documentation to GitHub Pages

**Triggers**: Pushes to `main` affecting `docs/` directory

---

### Platform-Specific Workflows

#### `android.yml`

**Purpose**: Build the signed Android APK and AAB and attach them to the release

**Triggers**: Release publication, and manual workflow dispatch. Its job runs in the `release` environment, which holds the signing keystore and Maps key, so it waits for a maintainer's approval and can only run from `main` or a `v*` tag. A manual dispatch creates or updates the `v<version>` release with the APK and AAB, so it is not a dry run. Not the `v*` tag push: `release-please.yml` creates the tag with the draft, before the release is approved.

---

#### `release-assets.yml`

**Purpose**: Create release assets for published releases

**Triggers**: Release publication

---

### Issue & PR Management Workflows

#### `issue-auto-label.yml`

**Purpose**: Automatically label newly opened or edited issues based on the issue template choices (e.g. `has-pr-volunteer`, `mobile`, `frontend`, `backend`).

**Triggers**: Issues (opened, edited)

---

#### `sync-translations.yml`

**Purpose**: Bidirectional sync with [SparkyFitnessTranslations](https://github.com/CodeWithCJ/SparkyFitnessTranslations), the repository Weblate is connected to. Pushes the English sources out and pulls every other language back, opening one PR on each side (`i18n/update-english-locales` there, `i18n/sync-weblate-translations` here).

Six Weblate components. The mobile app has four because its surfaces use different formats and placeholder rules (`{{value}}`, `%1$s`, `%@`), so Weblate translates each native file directly and no format conversion sits in between:

| Component              | In the translations repo             | In this repo                                      |
| ---------------------- | ------------------------------------ | ------------------------------------------------- |
| Web                    | `locales/`                           | `SparkyFitnessFrontend/public/locales/`           |
| Server                 | `server/locales/`                    | `SparkyFitnessServer/locales/`                    |
| Mobile runtime         | `mobile/src/localization/locales/`   | `SparkyFitnessMobile/src/localization/locales/`   |
| Mobile Expo metadata   | `mobile/locales/`                    | `SparkyFitnessMobile/locales/`                    |
| Mobile Android widgets | `mobile/targets/android-widget/res/` | `SparkyFitnessMobile/targets/android-widget/res/` |
| Mobile iOS widgets     | `mobile/targets/widget/`             | `SparkyFitnessMobile/targets/widget/`             |

A mobile surface missing from the translations repo is skipped with a notice, so the workflow is safe to run before all the components exist; the push side seeds each English source on the first run. `pr-validation.yml` rejects a human PR that edits any non-`en` translation file.

Only locales listed in `SparkyFitnessMobile/src/localization/localeRegistry.json` are shipped on mobile. Others sync in as translation candidates, are reported by the i18n audit as non-blocking diagnostics, and are never bundled. The widget resources are the exception to "sync in": Android compiles every `values-*` directory and the iOS widget target ships every `.lproj` folder, so those two surfaces are pulled for registered locales only and a candidate's widget arrives on the sync after it is registered.

The workflow merges the English PR there itself, unless it deletes more than 300 lines: once a key leaves the English file, Weblate's cleanup add-on deletes its translations in every language, so a large deletion waits for a maintainer, and the run fails until someone merges it. The PR here is opened as the SparkyFitness-Sync GitHub App, so CI runs on it and `auto-merge-bot-prs.yml` merges it once CI passes. If it is still open when the release PR is ready, merge it first (see `release-please.yml` above). Every run rebuilds both branches, so fix a wrong translation in Weblate, not on the sync branch. The translations repository is treated as untrusted input: the run fails if the copy brings in anything but `.json`, `widget_strings.xml` and `Localizable.strings` files or any symbolic link, Prettier always uses this repository's config (a config file found next to a synced file would be code), and the app token is created only after those steps.

**Triggers**: Every night at 21:41 UTC, and manual workflow dispatch. It runs from `main` only, and the nightly run only in `CodeWithCJ/SparkyFitness`. Requires the `SYNC_APP_PRIVATE_KEY` secret (in the `sync-app` environment) of the SparkyFitness-Sync GitHub App, whose Client ID is written in the workflows, which is installed on both repositories (Contents and Pull requests write, Checks and Commit statuses read) and is on the bypass list of `main`'s ruleset. GitHub sends notifications for scheduled runs only to the user who last modified the `cron` line.

---

#### `auto-merge-bot-prs.yml`

**Purpose**: Automatically and safely merges the clean translations PR (`i18n/*`) once all CI checks pass. The Nix hashes and schema backup PRs merge themselves in their own workflows (below). If there are any merge conflicts, the PR is held untouched for manual review.

It merges with the SparkyFitness-Sync GitHub App token (`SYNC_APP_PRIVATE_KEY`), because `main`'s ruleset requires a review and only the app is on its bypass list. Since that token skips review, a PR qualifies only by its branch prefix, which needs write access to push, and not by a label, which anyone with triage access can add. Every changed file must also match the allowlist in `.github/scripts/automation-allowlist.cjs` (non-English locale files only, listed with the compare API at the exact head merged). The `i18n automation branches` ruleset lets only the app and admins create or push `i18n/**` branches, so a write collaborator cannot push onto the sync branch at all. Web catalogues may put no attributes in a tag (`<Trans>` lets them override a link's `href`, `target` and `rel`), and server email catalogues must be plain text with no HTML tags; mobile shows values as plain text and is not subject to the attribute check. A value that adds a link, web address or email (one that neither its English text nor its version on `main` has) holds the PR for manual review in any catalogue, mobile included: the bot posts one comment listing them, and a maintainer checks and merges by hand. A finished, passing `CI Tests` run for the exact head is required, since `main` has no required status checks and the app skips review; listing check runs alone would miss the test jobs that only appear once Detect Changes finishes. CI passing is still not the safety gate: anyone with write access can post a commit status. The app secrets live in the `sync-app` environment, limited to `main`, so a workflow pushed on another branch cannot read them. A PR opened with `GITHUB_TOKEN` gets no CI, so nothing here merges it.

Every workflow that opens a PR in this repository (translations, release-please, Nix hashes, schema backup, Umbrel package, Helm chart version) does it with the app token, so **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** stays off. With it on, a workflow pushed on any branch could approve its own PR with `GITHUB_TOKEN`, and that approval counts toward `main`'s review rule.

Umbrel package-update PRs (`umbrel/*`, from `umbrel-app-update.yml`) are **not** auto-merged, deliberately: merging that PR is what triggers the App Store submission in `umbrel-app-submit.yml`, so it stays a manual review step. Removing that gate takes `'umbrel/'` in this workflow's `ALLOWED_BRANCH_PREFIXES` and in its job `if` (which only lets `i18n/` branches through), plus an `'umbrel/'` entry in `ALLOWED_FILES` in `automation-allowlist.cjs` listing the package files.

**Triggers**: Pull requests (opened, synchronize, labeled, ready_for_review), `CI Tests` runs completed, check suites completed, and manual workflow dispatch. `check_suite` never fires for suites created by GitHub Actions, so `workflow_run` is what catches CI finishing.

---

#### `nix-update-hashes.yml` and `schema-backup.yml`

**Purpose**: Regenerate a derived file on `main` and open a PR with it: the pnpm dependency hashes in `nix/backend.nix` and `nix/frontend.nix` after a lockfile change, and `db_schema_backup.sql` after a migration change. Each PR merges itself right away, because its content is computed from `main` and a review adds nothing. The job that runs the Nix installer or `pnpm install` is read-only and hands the files over as an artifact. A separate `pr` job in the `sync-app` environment opens the PR with the SparkyFitness-Sync app token and merges it with `.github/actions/merge-automation-pr`, pinned to the head commit it pushed and checked against that job's exact file set (`allowed-files`). That job runs only pinned actions. If the merge fails, the run fails and the PR stays open for a maintainer.

**Triggers**: Pushes to `main` that touch `pnpm-lock.yaml` (Nix) or the migrations and schema tooling (schema backup), and manual workflow dispatch

---

#### `first-contributor-welcome.yml`

**Purpose**: Greets first-time contributors with a warm, tailored welcome comment when they open their very first pull request, feature request, or issue.

**Triggers**: Issues opened, Pull requests opened

---

#### `pr-license-enforcement.yml`

**Purpose**: Sweeps open pull requests on a schedule and closes PRs where the mandatory Integrity & License agreement checkbox was not confirmed within the 7-day grace period.

**Triggers**: Scheduled (hourly) and manual workflow dispatch

---

#### `pr-merged-issue-notifier.yml`

**Purpose**: When a PR is merged, automatically replies to linked issues informing reporters that the fix or enhancement is completed and will be available in the upcoming release.

**Triggers**: Pull requests closed (`merged == true`)

---

#### `release-published-notifier.yml`

**Purpose**: When a new release is out, automatically comments on all issues resolved in that release announcing that the release is now live with links to the release notes.

**Triggers**: Completion of `Publish Docker Images` for an actual `release` event, so an issue hears about the release only once its images are pushed.

---

#### `whats-new-drift.yml`

**Purpose**: Keeps one open issue ("What's New screen is out of date") listing the `feat` commits that changed the mobile app since `WHATS_NEW_CONTENT_VERSION` was last bumped. It closes itself once the version is bumped. It only reports; the `whats-new` skill writes the cards. The list is a heads-up, not a complete audit: it matches only `feat` commit subjects and shows at most 40, so other mobile commits need a manual look.

**Triggers**: Pushes to `main` that touch `SparkyFitnessMobile/src/**`, and manual dispatch. Run `.github/scripts/whats-new-drift.sh` locally to see the same list.

---

## Development Notes

### Testing Workflows Locally

Run the PR validation regression tests with `pnpm install --filter . --frozen-lockfile --ignore-scripts` and `node --test .github/scripts/pr-validation.test.cjs`. The tests execute the workflow script with read-only review-event API fixtures and run in `pr-validation-tests.yml`.

You can test GitHub Actions locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash  # Linux

# Test PR validation workflow
act pull_request -e .github/workflows/test-event.json
```

### Modifying Workflows

When modifying workflows:

1. **Test before committing**: Use act or push to a feature branch
2. **Update this README**: Document any significant changes
3. **Check permissions**: Ensure the workflow has necessary permissions
4. **Validate YAML**: Use `yamllint` or GitHub's workflow syntax validator
5. **Consider impact**: Some workflows affect PR checks - be careful with breaking changes

### Common Issues

**Workflow not running:**

- Check trigger conditions (paths, branches, events)
- Verify workflow file is in `.github/workflows/`
- Check YAML syntax is valid

**Permission errors:**

- Add required permissions in workflow file
- Check repository settings allow Actions

**Path filters not working:**

- Use `dorny/paths-filter@v2` for complex path detection
- Test path patterns with actual file changes

## Maintenance

This document should be updated when:

- New workflows are added
- Existing workflows are significantly modified
- Trigger conditions change
- Validation rules change

Last updated: 2026-11-05
