import fs from 'fs';
import path from 'path';

/**
 * Nutrient column coverage — contract test.
 *
 * WHY THIS EXISTS
 * ---------------
 * Adding caffeine_mg / water_ml / alcohol_g surfaced nine bugs, every one the
 * same shape: a hand-written list of nutrient names that must mirror the
 * database columns, with nothing enforcing it. On this client the payload
 * builder in enhancedCustomFoodFormService dropped all three on save, the diary
 * filtered them out of MealCard, the settings screen never offered them, and
 * both variant scalers silently lost them on a serving-size change.
 *
 * A fixture-based unit test cannot catch this: it fails on a WRONG value, never
 * on an ABSENT one, because the fixture simply never mentions the field.
 *
 * THE INVARIANT
 * -------------
 * Wherever a file enumerates nutrient columns, it enumerates ALL of them. So
 * within one file each column should appear at least as often as its peers.
 * `iron` is the anchor: a pure nutrient name that never appears in another
 * sense, unlike `calories` (calorie_goal, total_calories, …).
 *
 * IF THIS FAILS
 * -------------
 * The file enumerates nutrients in N places but the named column in fewer, so
 * one was missed. Add it — or, if the omission is deliberate, add an entry to
 * DELIBERATE_OMISSIONS with the reason.
 */

const SRC_ROOT = path.join(process.cwd(), 'src');
const TRACKED_COLUMNS = ['caffeine_mg', 'water_ml', 'alcohol_g'] as const;
const ANCHOR = 'iron';

interface Omission {
  /** Matched against the src-relative file path. */
  file: RegExp;
  columns: readonly string[];
  reason: string;
}

const DELIBERATE_OMISSIONS: Omission[] = [
  {
    file: /^api\/Foods\/nutrionix\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      "Nutritionix's instant-search endpoint reports none of these, so there is nothing to map.",
  },
  {
    file: /^utils\/foodSearch\.ts$/,
    columns: TRACKED_COLUMNS,
    reason: 'Maps a Nutritionix search item; same reason as above.',
  },
  {
    file: /^(api\/Goals\/goals|types\/goals|constants\/goals)\.ts$/,
    columns: ['water_ml'],
    reason:
      'user_goals has no water_ml column — water_goal_ml is the one water goal (NON_GOAL_NUTRIENT_KEYS).',
  },
  {
    file: /^components\/Onboarding\/NutrientGoals\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Onboarding shows a deliberately curated starter set of goals; the full set is editable later on the Goals page.',
  },
  {
    file: /^pages\/Settings\/NutrientGoalDirectionSettings\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Sections are curated, but anything in PREDEFINED_NUTRIENT_KEYS that is not explicitly grouped is auto-collected into the "Other" section, so caffeine and alcohol already appear.',
  },
  {
    file: /^constants\/nutrients\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      "CENTRAL_NUTRIENT_CONFIG entries carry an i18n key named after the nutrient's display name (nutrition.caffeine), not its column (caffeine_mg), so the anchor over-counts here. The lists themselves are covered by PREDEFINED_NUTRIENT_KEYS parity server-side.",
  },
  {
    file: /^types\/food\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'The two remaining sites are CSVData (a user-facing import format, widened only deliberately) and NutritionixItem (a provider that reports none of these).',
  },
  {
    file: /^pages\/Settings\/CalculationSettings\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Prose describing which targets an algorithm computes, not a nutrient list.',
  },
  {
    file: /^services\/nutrientCalculationService\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'RDA targets for vitamins/minerals. Caffeine and alcohol are limits, not recommended intakes, and water has its own goal.',
  },
  {
    file: /^pages\/Diary\/NutritionSummaryCard\.tsx$/,
    columns: ['water_ml'],
    reason: 'Summary card — the water ring owns that number.',
  },
  {
    file: /^types\/Chatbot_types\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Mirrors the chatbot tool contract, whose nutrient set is pinned by golden-string tests server-side.',
  },
  {
    file: /^(pages\/Foods\/FoodImportFromCSV|pages\/Diary\/FoodDiaryImportCSV)\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'CSV import column contract — widening it changes the file format users already have, so it is a deliberate, separate change.',
  },
  {
    file: /^constants\/standardNutrientAliases\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Provider alias table; entries are added when a provider is found to report that nutrient under a known name.',
  },
  {
    file: /^utils\/reportUtil\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'CSV export names things for humans: the i18n key is foodDiaryExportHeaders.caffeine and the local is caffeineMg, so the column-name anchor under-counts. All three columns are exported (header, per-row value and totals row).',
  },
  {
    file: /^utils\/nutritionCalculations\.ts$/,
    columns: ['water_ml'],
    reason:
      'The remaining sites are MealTotals-shaped objects, and water is deliberately absent from EMPTY_MEAL_TOTALS so the ring owns the day total.',
  },
  {
    file: /^utils\/chartUtils\.ts$/,
    columns: TRACKED_COLUMNS,
    reason: 'Groups vitamins/minerals for chart colouring only.',
  },
  {
    file: /^components\/FoodSearch\/NutrientGrid\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Compact search-result grid with its own deliberately short label set; the full grid is pages/Diary/NutrientsGrid.tsx.',
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
      if (entry.name === 'node_modules' || entry.name === 'tests') continue;
      out.push(...collectSourceFiles(full));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function countOccurrences(source: string, word: string): number {
  return source.match(new RegExp(`\\b${word}\\b`, 'g'))?.length ?? 0;
}

describe('nutrient column coverage', () => {
  it('every file that enumerates nutrients enumerates the newer columns just as often', () => {
    const failures: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const relPath = path.relative(SRC_ROOT, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf-8');
      const anchorCount = countOccurrences(source, ANCHOR);
      if (anchorCount === 0) continue;

      const allowed = allowedMissing(relPath);
      for (const column of TRACKED_COLUMNS) {
        if (allowed.has(column)) continue;
        const count = countOccurrences(source, column);
        if (count < anchorCount) {
          failures.push(
            `src/${relPath}: enumerates '${ANCHOR}' ${anchorCount}x but '${column}' only ${count}x ` +
              `— ${anchorCount - count} nutrient list(s) in this file are missing ${column}`
          );
        }
      }
    }

    // Thrown rather than asserted so the message survives: Jest's expect takes
    // no message argument (unlike Vitest's, used by the server twin of this test).
    if (failures.length > 0) {
      throw new Error(
        '\n\nNutrient columns missing from some of their nutrient lists:\n\n' +
          `${failures.join('\n')}\n\n` +
          'Add the column to the list(s) that omit it, or if the omission is ' +
          'deliberate add it to DELIBERATE_OMISSIONS in this file with the reason.\n'
      );
    }
    expect(failures).toEqual([]);
  });
});
