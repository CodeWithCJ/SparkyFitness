---
name: pr-submission
description: Use whenever the user asks to submit, open, create, or publish a pull request (PR) — e.g. "submit this as PR", "open a PR", "create PR for me", "submit PR", "make a PR". Enforces pre-submission package validation, strict zero-AI-attribution commit standards, clean branch naming, and mandatory full adherence to .github/pull_request_template.md without removing any sections or checkboxes.
---

# PR Submission Workflow

Canonical copy. `.claude/skills/pr-submission/SKILL.md` is a stub pointing here, the same way `CLAUDE.md` points at `AGENTS.md`.

Use this skill whenever opening a pull request for the SparkyFitness repository.

---

## 1. Core Non-Negotiable Rules

1. **Zero AI Attribution (Strict Monorepo Rule)**:
   - Commit messages, commit trailers, PR titles, PR bodies, and comments must **never** contain `Co-Authored-By: Claude` (or any other assistant trailer), "Generated with...", "🤖", or any mention of Claude, Gemini, Antigravity, Copilot, Cursor, etc.
   - Write strictly from the perspective of the repository author/maintainer.
2. **Preserve Complete PR Template**:
   - Always load `.github/pull_request_template.md`.
   - **Never delete or strip any sections, questions, or checkboxes**, even if they are not applicable to the current change (e.g. keep Frontend, Backend, UI, Mobile checklist blocks intact).
   - Fill in the applicable fields, check applicable boxes (`[x]`), and leave non-applicable boxes unchecked or noted with `N/A`.
3. **Pre-flight Validation Must Pass**:
   - Always run `pnpm run validate` and relevant test suites in the modified packages before committing/pushing.

---

## 2. Step-by-Step Submission Procedure

### Step 1: Pre-Submission Validation
Run the standard validation commands for all packages touched in the PR:

- **Server (`SparkyFitnessServer/`)**:
  ```bash
  cd SparkyFitnessServer && pnpm format && pnpm test && pnpm validate
  ```
- **Frontend (`SparkyFitnessFrontend/`)**:
  ```bash
  cd SparkyFitnessFrontend && pnpm format && pnpm test && pnpm validate
  ```
- **Mobile (`SparkyFitnessMobile/`)**:
  ```bash
  cd SparkyFitnessMobile && pnpm test && pnpm validate
  ```
- **Garmin Microservice (`SparkyFitnessGarmin/`)**:
  ```bash
  cd SparkyFitnessGarmin && ./venv/bin/python -m unittest discover tests
  ```

Inspect `git status` and `git diff` to ensure no scratch files, debug logs, or unwanted changes are staged.

### Step 2: Branch Creation & Staging
Create a descriptive branch:
```bash
# Branch format: fix/<topic-or-issue> or feat/<topic>
git checkout -b fix/<topic>
git add <files>
```

### Step 3: Commit Message
Write a concise conventional commit message referencing any linked issue:
```bash
git commit -m "fix(<domain>): concise summary of fix

- Bullet point detailing specific change
- Bullet point detailing another change

Fixes #<issue_number>"
```

### Step 4: Prepare PR Body from Template
Read `.github/pull_request_template.md` and populate the body file:
1. **Description**:
   - **What problem does this PR solve?** (1-2 sentences)
   - **How did you implement the solution?** (Bullet points of technical changes)
   - **Linked Issue**: `Closes #<issue_number>`
2. **How to Test**: Concrete steps to run commands, trigger the flow, and verify behavior.
3. **PR Type**: Mark `[x]` on the applicable type (Issue, New Feature, Refactor, Documentation).
4. **Checklist**: Mark `[x]` on all applicable mandatory items that were executed. **Keep all other checklist items as-is.**
5. **Screenshots**: Provide screenshots for UI changes, or `N/A` for backend/headless changes.
6. **Notes for Reviewers**: Note any relevant configuration keys, architectural decisions, or performance context.

### Step 5: Push Branch & Create PR
Push the feature branch to `origin`:
```bash
git push -u origin <branch-name>
```

Create the PR targeting `main` via GitHub CLI:
```bash
gh pr create --base main --title "fix(<domain>): <summary>" --body-file "<path-to-body-file>"
```

### Step 6: Final Verification
Verify the created PR via `gh pr view <number>` to ensure formatting and checklists rendered cleanly.
