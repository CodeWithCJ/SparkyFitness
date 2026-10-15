# End-to-end (e2e) tests for web

Browser end-to-end tests for SparkyFitness, authored with [KaneCLI](https://www.testmuai.com/kane-cli/) by TestMu AI. Each test is a plain-English `_test.md` file; KaneCLI runs it in a real Chrome browser and records each step so later runs replay without re-authoring.

| Test | What it covers |
|---|---|
| `onboarding_test.md` | Signing up, answering the onboarding questions (including the date-of-birth picker), and starting the personalized plan |
| `food_diary_test.md` | Signing up, skipping onboarding, creating a custom food from the Breakfast section, and checking the meal and daily energy totals |

They complement the Vitest unit and component tests by going through the whole app in a browser.

## Run the tests

The tests expect SparkyFitness at `http://localhost:3004`. Start it with the production compose file:

```bash
cd docker
cp .env.simple.example .env   # then fill in the secrets as described in the file
docker compose -f docker-compose.prod.yml up -d
```

Each test signs up its own account (`alex.runner@example.com` and `jamie.cook@example.com`), so run them against a fresh database, or delete those two accounts before running them again.

### With KaneCLI

```bash
npm install -g @testmuai/kane-cli
kane-cli login
kane-cli testmd run e2e/kane/onboarding_test.md --agent
kane-cli testmd run e2e/kane/food_diary_test.md --agent
```

### With the exported Playwright code

Each test also has an exported Playwright (JavaScript) version under `output-<test>/playwright-javascript-code/`:

```bash
cd e2e/kane/output-food_diary/playwright-javascript-code
npm install
npx playwright install chromium
node test.js
```

Copy `.env.example` to `.env` and fill in your TestMu AI (LambdaTest) credentials first.

## Editing a test

Edit the step text in the `_test.md` file and run it again with `kane-cli testmd run`. Changed steps (and the steps after them) are re-recorded; unchanged steps replay from `output-<test>/`.
