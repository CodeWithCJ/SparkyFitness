# Contributing to SparkyFitness

Thank you for helping improve SparkyFitness! To keep the project organized, please follow these rules:

### 1. New Features

If you want to add a new feature, you **must first raise a GitHub Issue**. Get it reviewed and approved by the maintainers before you start coding to ensure we are all aligned.

### 2. Pull Request Checklist

Every PR must include:

- **Tests**: Automated tests for your changes.
- **Screenshots**: Attach "Before" vs "After" screenshots for any UI changes.
- **Quality Checks**: You must run these before submitting:
  - `npm run lint` and `npm run format` (specifically for `SparkyFitnessFrontend`).
- **Translations**: If applicable, only update the English (`en`) translation file. Translations should have hardcoded fall back directly in the code Non-English translation files are maintained in a separate repository linked with Webplate. https://github.com/CodeWithCJ/SparkyFitnessTranslations
- **Architecture**: Follow the existing project standards (see `AGENTS.md`).
- **Database Security**: Any new user-specific tables must be added to Row Level Security (RLS) in `SparkyFitnessServer/db/rls_policies.sql`.
- **Code Integrity**: You certify that your contribution contains no malicious code (phishing, malware, etc.)
- **License**: By submitting, you agree to the [License terms](LICENSE).

### 3. Workflow

1. Fork the repo and create a branch.
2. Commit your changes.
3. Submit a PR with the required screenshots and test confirmation.

Thanks for contributing!
