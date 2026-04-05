import {
  booleanFields,
  dropdownFields,
  dropdownOptions,
  arrayFields,
  textFields,
  requiredHeaders,
} from '@/constants/exercises';
import { ExerciseCSVData } from '@/pages/Exercises/ExerciseImportCSV';

export const parseCSV = (text: string): ExerciseCSVData[] => {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  // Regex to split CSV by commas, but not if the comma is inside double quotes.
  // It also handles escaped double quotes within a quoted field.
  const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

  const parsedHeaders = lines[0]
    ?.split(csvSplitRegex)
    .map((header) => header.trim().replace(/^"|"$/g, ''));
  const data: ExerciseCSVData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(csvSplitRegex).map((value) => {
      // Remove surrounding quotes and unescape internal quotes
      let trimmedValue = value.trim();
      if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
        trimmedValue = trimmedValue
          .substring(1, trimmedValue.length - 1)
          .replace(/""/g, '"');
      }
      return trimmedValue;
    });
    const row: Partial<ExerciseCSVData> = { id: generateUniqueId() };

    parsedHeaders?.forEach((header, index) => {
      const value = values ? (values[index] ?? '') : '';
      if (booleanFields.has(header)) {
        row[header as keyof ExerciseCSVData] = value.toLowerCase() === 'true';
      } else if (dropdownFields.has(header)) {
        const normalizedValue = value.toLowerCase();
        const options = dropdownOptions[header];
        const matchingOption = options?.find(
          (option) => option === normalizedValue
        );
        row[header as keyof ExerciseCSVData] = matchingOption || value;
      } else if (arrayFields.has(header)) {
        row[header as keyof ExerciseCSVData] = value; // Keep as comma-separated string for editing
      } else if (!textFields.has(header) && !isNaN(parseFloat(value))) {
        row[header as keyof ExerciseCSVData] = parseFloat(value);
      } else {
        row[header as keyof ExerciseCSVData] = value;
      }
    });
    data.push(row as ExerciseCSVData);
  }
  return data;
};

export const parseCSVWithMapping = (
  text: string,
  mapping: Record<string, string>
): ExerciseCSVData[] => {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

  const parsedHeaders = lines[0]
    ?.split(csvSplitRegex)
    .map((header) => header.trim().replace(/^"|"$/g, ''));
  const data: ExerciseCSVData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(csvSplitRegex).map((value) => {
      let trimmedValue = value.trim();
      if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
        trimmedValue = trimmedValue
          .substring(1, trimmedValue.length - 1)
          .replace(/""/g, '"');
      }
      return trimmedValue;
    });
    const row: Partial<ExerciseCSVData> = { id: generateUniqueId() };

    // Create a map from parsed header to index
    const headerIndexMap: Record<string, number> = {};
    parsedHeaders?.forEach((header, index) => {
      headerIndexMap[header] = index;
    });

    requiredHeaders.forEach((requiredHeader) => {
      const fileHeader = mapping[requiredHeader];
      const index = fileHeader ? headerIndexMap[fileHeader] : 0;
      const value =
        index !== undefined ? (values ? values[index] : '') || '' : '';

      if (booleanFields.has(requiredHeader)) {
        row[requiredHeader as keyof ExerciseCSVData] =
          value.toLowerCase() === 'true';
      } else if (dropdownFields.has(requiredHeader)) {
        const normalizedValue = value.toLowerCase();
        const options = dropdownOptions[requiredHeader];
        const matchingOption = options?.find(
          (option) => option === normalizedValue
        );
        row[requiredHeader as keyof ExerciseCSVData] = matchingOption || value;
      } else if (arrayFields.has(requiredHeader)) {
        row[requiredHeader as keyof ExerciseCSVData] = value;
      } else if (!textFields.has(requiredHeader) && !isNaN(parseFloat(value))) {
        row[requiredHeader as keyof ExerciseCSVData] = parseFloat(value);
      } else {
        row[requiredHeader as keyof ExerciseCSVData] = value;
      }
    });
    data.push(row as ExerciseCSVData);
  }
  return data;
};

export const generateUniqueId = () =>
  `temp_${Math.random().toString(36).slice(2, 11)}`;
