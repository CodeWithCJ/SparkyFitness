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
  - **Backend**: Format check, lint, tests (currently disabled)
  - **Mobile**: Lint + `pnpm run test:ci`
  - **Garmin**: Python pytest with coverage
- Uploads coverage reports as artifacts

**Note**: Backend tests are currently disabled (`if: false`) per maintainer request.

---

#### `pr-validation.yml`

**Purpose**: Validate that PR submissions follow contribution guidelines and required checkboxes are checked.

**Triggers**: Pull requests (opened, edited, synchronize, reopened)

**What it does**:

- Analyzes changed files to detect Frontend, Backend, Mobile, and UI changes
- Validates required checkboxes based on change type:
  - **All PRs**: Integrity & License checkbox
  - **New Features**: Alignment checkbox (issue approval)
  - **Frontend Changes**: Quality checkbox (`pnpm run validate`)
  - **Backend Changes**: Code Quality checkbox (TypeScript, Zod, Tests)
  - **UI Changes**: Screenshots checkbox with before/after images
- Posts validation results as a comment on the PR
- Fails the check if required checkboxes are missing
- Updates the same comment on subsequent edits (no spam)

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
  - Missing "Quality" checkbox (FRONTEND)
  - Missing "Code Quality" checkbox (BACKEND)
- ⚠️ **WARNINGS** (informational):
  - Missing "Screenshots" checkbox (UI)
  - Missing/incomplete screenshots sections
  - Missing description
  - Missing linked issue

**Important**: This workflow prevents contributors from removing checkboxes. If checkboxes are removed, the validation fails.

---

### Deployment Workflows

#### `auto-docker-deploy.yml`

**Purpose**: Automatically deploy Docker images on version tag pushes

**Triggers**: Push of tags matching `v*.*.*`

---

#### `manual-docker-deploy.yml`

**Purpose**: Manual Docker deployment workflow

**Triggers**: Manual workflow dispatch

---

#### `helm-release.yml`

**Purpose**: Create Helm chart releases

**Triggers**: Release publication

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

**Purpose**: Android-specific builds and tests

**Triggers**: TBD (check workflow file for specific triggers)

---

#### `release-assets.yml`

**Purpose**: Create release assets for published releases

**Triggers**: Release publication

---

## Development Notes

### Testing Workflows Locally

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

Last updated: 2026-04-05
