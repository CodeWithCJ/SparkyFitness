import {
  booleanFields,
  dropdownFields,
  dropdownOptions,
  arrayFields,
  textFields,
  requiredHeaders,
} from '@/constants/exercises';
import { ExerciseCSVData } from '@/pages/Exercises/ExerciseImportCSV';
import { DailyExerciseEntry } from '@/types/reports';
import {
  readNumberCell,
  parseCsv,
  DEFAULT_CSV_FORMAT,
  type CsvFormatOptions,
} from '@workspace/shared';

export const EXERCISE_NUMERIC_COLUMNS = ['calories_per_hour'];

// parseCsv (not a raw Papa.parse call) so delimiter/quote-char are driven by
// the user's format choice instead of Papa's silent auto-detect, and so a
// delimiter-detection failure is reported via `warnings` instead of
// console.warn'd — see shared/src/utils/parseCsv.ts.
export const parseCSV = (
  text: string,
  mapping?: Record<string, string>,
  options: CsvFormatOptions = DEFAULT_CSV_FORMAT
): ExerciseCSVData[] => {
  const { rows, resolvedDecimal: format } = parseCsv(text, options, {
    numericColumns: EXERCISE_NUMERIC_COLUMNS,
  });

  return rows.map((rawRow) => {
    const row: Partial<ExerciseCSVData> = { id: generateUniqueId() };
    const fields = mapping ? requiredHeaders : Object.keys(rawRow);

    fields.forEach((field) => {
      const header = mapping ? mapping[field] : field;
      const val = (rawRow[header as string] || '').trim();
      const valLower = val.toLowerCase();

      if (booleanFields.has(field)) {
        row[field as keyof ExerciseCSVData] = valLower === 'true';
      } else if (dropdownFields.has(field)) {
        row[field as keyof ExerciseCSVData] =
          dropdownOptions[field]?.find((o) => o === valLower) || val;
      } else if (
        arrayFields.has(field) ||
        textFields.has(field) ||
        val === ''
      ) {
        row[field as keyof ExerciseCSVData] = val;
      } else {
        // readNumberCell (not Number/isNaN) so a locale-comma decimal like
        // "300,5" for calories_per_hour parses to 300.5 instead of Number's
        // NaN falling back to the raw string — the same #1960 bug already
        // fixed in the other importers.
        const read = readNumberCell(val, format);
        row[field as keyof ExerciseCSVData] = read.ok
          ? (read.value ?? val)
          : val;
      }
    });

    return row as ExerciseCSVData;
  });
};

export const generateUniqueId = () =>
  `temp_${Math.random().toString(36).slice(2, 11)}`;

export function calcExerciseStatsFlat(entries: DailyExerciseEntry[]) {
  return {
    otherCalories: entries.reduce(
      (acc, e) => acc + Number(e.calories_burned || 0),
      0
    ),
    activeCalories: 0,
    activitySteps: entries.reduce((acc, e) => acc + Number(e['steps'] || 0), 0),
  };
}
