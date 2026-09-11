import fs from 'fs';
import path from 'path';

/**
 * Nutrient column coverage — contract test.
 *
 * WHY THIS EXISTS
 * ---------------
 * Adding caffeine_mg / water_ml / alcohol_g surfaced nine bugs, every one the
 * same shape: a hand-written list of nutrient names that must mirror the
 * database columns, with nothing enforcing it. On this client FoodInfo declared
 * all three but no mapper populated them, so the adjust-nutrition flow read them
 * back empty and saved that over the real values.
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
// This client speaks both spellings — snake_case at the API boundary, camelCase
// in form state — and `iron` is identical in both, so each column is counted
// across every spelling it legitimately appears under. Anything else would make
// the anchor over-count in camelCase files and report the whole app as broken.
const COLUMN_SPELLINGS: Record<string, string[]> = {
  caffeine_mg: ['caffeine_mg', 'caffeineMg'],
  water_ml: ['water_ml', 'waterMl'],
  alcohol_g: ['alcohol_g', 'alcoholG'],
};
const TRACKED_COLUMNS = Object.keys(COLUMN_SPELLINGS);
const ANCHOR = 'iron';

interface Omission {
  /** Matched against the src-relative file path. */
  file: RegExp;
  columns: readonly string[];
  reason: string;
}

const DELIBERATE_OMISSIONS: Omission[] = [
  {
    file: /^types\/goals\.ts$/,
    columns: ['water_ml'],
    reason:
      'user_goals has no water_ml column — water_goal_ml is the one water goal.',
  },
  {
    file: /^hooks\/useNutritionTrends\.ts$/,
    columns: ['water_ml'],
    reason:
      'Trends mirror the summary view group, where the hydration gauge owns the number.',
  },
  {
    file: /^services\/api\/reportsApi\.ts$/,
    columns: ['water_ml'],
    reason: 'Report totals read hydration from its own water arm.',
  },
  {
    file: /^components\/FoodForm\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'All three fields are rendered here; the extra `iron` is a focus-chain reference naming the next input, not a nutrient list entry.',
  },
  {
    file: /^constants\/nutrients\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Nutrient metadata carries an i18n key named for the display name (nutrients.caffeine), not the column (caffeine_mg), so the anchor over-counts here.',
  },
  {
    file: /^screens\/DailyNutritionDetailsScreen\.tsx$/,
    columns: ['water_ml'],
    reason:
      'Fallback visible-nutrient order for the daily view, where the hydration gauge owns the water number.',
  },
  {
    file: /^screens\/FoodEntryViewScreen\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'The remaining site is the label switch, keyed on display names (Caffeine, Water Content, Alcohol) rather than column names.',
  },
  {
    file: /^services\/healthkit\/writebackMappers\.ts$/,
    columns: ['water_ml', 'alcohol_g'],
    reason:
      'Hydration is written as its own DietaryWater sample, not as part of the food correlation, and HealthKit exposes no alcohol identifier.',
  },
  {
    file: /^services\/shared\/dataTransformation\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'HC_NUTRIENT_COLUMNS maps Health Connect NutritionRecord fields. Hydration is a separate record type and neither platform has an alcohol field.',
  },
  {
    file: /^types\/healthRecords\.ts$/,
    columns: ['water_ml', 'alcohol_g'],
    reason:
      'Inbound nutrition records: hydration arrives as its own record type and neither platform reports alcohol.',
  },
  {
    file: /^utils\/nutrientLocalization\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Switches on the camelCase display keys (caffeineMg) and returns i18n names, so the column-name anchor under-counts.',
  },
  {
    file: /^types\/goals\.ts$/,
    columns: ['water_ml'],
    reason:
      'water_goal_ml is the one water goal; water is not a nutrient goal.',
  },
  {
    file: /^services\/diagnosticReportService\.ts$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Diagnostic export lists a fixed troubleshooting subset, not the nutrient block.',
  },
  {
    file: /^screens\/FoodPhotoEstimateReviewScreen\.tsx$/,
    columns: TRACKED_COLUMNS,
    reason:
      'Mirrors the AI photo-estimate response schema, which is deliberately narrow — every field costs tokens on every call.',
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

function countOccurrences(source: string, ...spellings: string[]): number {
  const pattern = spellings.map((w) => `\\b${w}\\b`).join('|');
  return source.match(new RegExp(pattern, 'g'))?.length ?? 0;
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
        const count = countOccurrences(source, ...COLUMN_SPELLINGS[column]);
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
