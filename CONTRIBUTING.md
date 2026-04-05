# Contributing to SparkyFitness

Thank you for helping improve SparkyFitness! To keep the project organized, please follow these rules:

### 1. New Features

If you want to add a new feature, you **must first raise a GitHub Issue**. Get it reviewed and approved by the maintainers before you start coding to ensure we are all aligned.

### 2. Pull Request Checklist

Every PR must include:

- **Tests**: Automated tests for your changes if applicable.
- **Screenshots**: Attach "Before" vs "After" screenshots for any UI changes.
- **Quality Checks**: You must run these before submitting:
  - **Frontend**: Run `pnpm run validate` in `SparkyFitnessFrontend/`
  - **Backend**: Run `pnpm run typecheck && pnpm run lint && pnpm run test` in `SparkyFitnessServer/`\n  - **Mobile**: Run `pnpm run lint && pnpm run test:run -- --watchman=false --runInBand` in `SparkyFitnessMobile/`
- **Backend Code Standards** (if applicable):
  - **TypeScript Only**: New backend files must be written in TypeScript
  - **Zod Validation**: New endpoints must include Zod schemas for request/response validation
  - **Endpoint Tests**: New endpoints must include automated tests
- **Translations**: If applicable, only update the English (`en`) translation file. Translations should have hardcoded fall back directly in the code Non-English translation files are maintained in a separate repository linked with Webplate. https://github.com/CodeWithCJ/SparkyFitnessTranslations
- **Architecture**: Follow the existing project standards
- **Database Security**: Any new user-specific tables must be added to Row Level Security (RLS) in `SparkyFitnessServer/db/rls_policies.sql`.
- **Code Integrity**: You certify that your contribution contains no malicious code (phishing, malware, etc.)
- **License**: By submitting, you agree to the [License terms](LICENSE).

### 3. Workflow

1. Fork the repo and create a branch.
2. Commit your changes.
3. Submit a PR with the required screenshots and test confirmation.

### 4. Automated PR Validation

Your PR will be automatically checked by our GitHub Actions workflow:

- **Required Checkboxes**: The workflow validates that all mandatory checkboxes are checked based on the type of changes you made.
- **Change Detection**: Automatically detects Frontend, Backend, Mobile, and UI changes to ensure appropriate requirements are met.
- **Validation Comments**: You'll receive an automated comment on your PR with validation results and specific guidance on what needs to be fixed.

**Important**: Do not remove checkboxes from the PR template. The validation workflow checks for their presence and will fail if required checkboxes are missing or unchecked.

Thanks for contributing!
