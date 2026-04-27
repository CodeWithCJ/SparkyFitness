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

import Papa from 'papaparse';

export const parseCSV = (
  text: string,
  mapping?: Record<string, string>
): ExerciseCSVData[] => {
  const { data, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length) console.warn('PapaParse Errors:', errors);

  return data.map((rawRow) => {
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
        val === '' ||
        isNaN(Number(val))
      ) {
        row[field as keyof ExerciseCSVData] = val;
      } else {
        row[field as keyof ExerciseCSVData] = Number(val);
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
