import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  NON_GOAL_NUTRIENT_KEYS,
} from '@workspace/shared';
import { PREDEFINED_NUTRIENT_KEYS } from '../../services/nutrientGoalPreferenceService.js';

/**
 * Nutrient column coverage — contract test.
 *
 * WHY THIS EXISTS
 * ---------------
 * Adding caffeine_mg / water_ml / alcohol_g surfaced nine bugs, every one the
 * same shape: a hand-written list of nutrient names that must mirror the
 * database columns, with nothing enforcing it. Payload builders, two
 * json_build_object projections, seven SELECT lists and an UPDATE all silently
 * stopped at `iron`, so values were dropped on save or read back as zero.
 *
 * The rest of the suite cannot catch this. A fixture-based unit test fails on a
 * WRONG value, never on an ABSENT one — the fixture simply never mentions the
 * field. And 82 of 333 server test files mock the pool, so a SELECT missing a
 * column is just a string handed to a mock.
 *
 * THE INVARIANT
 * -------------
 * Wherever a file enumerates nutrient columns, it enumerates ALL of them. So
 * within one file, each nutrient column should appear at least as often as its
 * peers. `iron` is the anchor: it is a pure nutrient name that never appears in
 * another sense (unlike `calories`, which shows up in calorie_goal, total_calories
 * and so on), so its occurrence count is a reliable measure of "how many nutrient
 * lists does this file contain".
 *
 * This needs no block detection, no parser and no list of known sites — which
 * matters, because the seven broken SELECTs in models/foodEntry.ts would not
 * have been found by a list someone had to write out first.
 *
 * IF THIS FAILS
 * -------------
 * The file enumerates nutrients in N places but the named column in fewer, so
 * one of those places was missed. Add it — or, if the omission is deliberate,
 * add an entry to DELIBERATE_OMISSIONS with the reason.
 */

const SERVER_ROOT = path.join(__dirname, '..', '..');
const SCANNED_DIRS = ['models', 'services', 'routes'];

// water_ml is a column on the same three nutrition tables, but is deliberately
// absent from FOOD_VARIANT_NUTRIENT_FIELDS: that list drives supplementSql's
// SUM() generation, and a supplement reporting a water dose is meaningless.
const TRACKED_COLUMNS = ['caffeine_mg', 'water_ml', 'alcohol_g'] as const;
const ANCHOR = 'iron';

interface Omission {
  /** Matched against the repo-relative file path. */
  file: RegExp;
  columns: readonly string[];
  reason: string;
}

const DELIBERATE_OMISSIONS: Omission[] = [
  {
    file: /^models\/(goalRepository|goalPresetRepository)\.ts$/,
    columns: ['water_ml'],
    reason:
      'user_goals/goal_presets have no water_ml column — water_goal_ml is the one water goal (NON_GOAL_NUTRIENT_KEYS).',
  },
  {
    file: /^services\/goalService\.ts$/,
    columns: ['water_ml'],
    reason: 'Water is not a nutrient goal; see goalRepository above.',
  },
  {
    file: /^models\/coachRepository\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'The coach aggregate is a curated summary feeding AI prompts with golden-string tests. ' +
      'Hydration comes from the water ledger, and widening the nutrient set the coach reasons over ' +
      'is a product decision, not a mechanical column addition.',
  },
  {
    file: /^services\/(chatService|foodPhotoEstimationService|labelScanService)\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Prompt text and AI response schemas: the model is deliberately asked for a narrow nutrient set, ' +
      'and every added field costs tokens on every call.',
  },
  {
    file: /^services\/foodPhotoMatchService\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Photo matching scores candidates on a fixed feature vector, not the full nutrient block.',
  },
  {
    file: /^models\/reportRepository\.ts$/,
    columns: ['water_ml'],
    reason:
      'Mini nutrition trends is the summary view group, where the water ring owns the number.',
  },
  {
    file: /^services\/reportService\.ts$/,
    columns: ['water_ml'],
    reason:
      'Reads hydration from its own water arm, not from the nutrient sum.',
  },
  {
    file: /^services\/healthDataHandlers\.ts$/,
    columns: ['water_ml', 'alcohol_g'],
    reason:
      'Hydration arrives as its own health metric and lands in the water ledger, not as a food nutrient. ' +
      'Neither HealthKit nor Health Connect has an alcohol field on their nutrition records.',
  },
  {
    file: /^services\/garmin\//,
    columns: TRACKED_COLUMNS,
    reason: 'Garmin reports its own fixed nutrient subset.',
  },
  {
    file: /^services\/openFoodFactsContributionService\.ts$/,
    columns: ['alcohol_g'],
    reason:
      'We publish per-serving masses, but Open Food Facts stores alcohol as % ABV by volume, ' +
      'not grams (see the alcoholGramsForServing conversion on the read side). Deriving an ABV ' +
      'back from alcohol_g needs a volume-based serving we cannot assume, and a wrong number here ' +
      'is written to a public shared database.',
  },
];

function allowedMissing(relPath: string): Set<string> {
  const allowed = new Set<string>();
  for (const omission of DELIBERATE_OMISSIONS) {
    if (omission.file.test(relPath)) {
      omission.columns.forEach((c) => allowed.add(c));
    }
  }
  return allowed;
}

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

export function countOccurrences(source: string, word: string): number {
  // `word` is always one of our own compile-time column constants, never user
  // or file input.
  // eslint-disable-next-line security/detect-non-literal-regexp
  return source.match(new RegExp(`\\b${word}\\b`, 'g'))?.length ?? 0;
}

describe('nutrient column coverage', () => {
  it('every file that enumerates nutrients enumerates the newer columns just as often', () => {
    const failures: string[] = [];

    for (const dir of SCANNED_DIRS) {
      for (const file of collectSourceFiles(path.join(SERVER_ROOT, dir))) {
        const relPath = path
          .relative(SERVER_ROOT, file)
          .split(path.sep)
          .join('/');
        const source = fs.readFileSync(file, 'utf-8');
        const anchorCount = countOccurrences(source, ANCHOR);
        if (anchorCount === 0) continue;

        const allowed = allowedMissing(relPath);
        for (const column of TRACKED_COLUMNS) {
          if (allowed.has(column)) continue;
          const count = countOccurrences(source, column);
          if (count < anchorCount) {
            failures.push(
              `${relPath}: enumerates '${ANCHOR}' ${anchorCount}x but '${column}' only ${count}x ` +
                `— ${anchorCount - count} nutrient list(s) in this file are missing ${column}`
            );
          }
        }
      }
    }

    expect(
      failures,
      '\n\nNutrient columns missing from some of their nutrient lists:\n\n' +
        `${failures.join('\n')}\n\n` +
        'Add the column to the list(s) that omit it, or if the omission is ' +
        'deliberate add it to DELIBERATE_OMISSIONS in this file with the reason.\n'
    ).toEqual([]);
  });

  // Absorbed from the former tests/nutrientKeyListParity.test.ts, which checked
  // this one pair of lists and nothing else.
  it('PREDEFINED_NUTRIENT_KEYS matches FOOD_VARIANT_NUTRIENT_FIELDS minus non-goal nutrients', () => {
    const expected = new Set(
      FOOD_VARIANT_NUTRIENT_FIELDS.filter(
        (key) => !(NON_GOAL_NUTRIENT_KEYS as readonly string[]).includes(key)
      )
    );
    expect(new Set(PREDEFINED_NUTRIENT_KEYS)).toEqual(expected);
  });

  it('water_ml is never goal-eligible, caffeine and alcohol always are', () => {
    expect(PREDEFINED_NUTRIENT_KEYS).not.toContain('water_ml');
    expect(PREDEFINED_NUTRIENT_KEYS).toContain('caffeine_mg');
    expect(PREDEFINED_NUTRIENT_KEYS).toContain('alcohol_g');
  });
});
