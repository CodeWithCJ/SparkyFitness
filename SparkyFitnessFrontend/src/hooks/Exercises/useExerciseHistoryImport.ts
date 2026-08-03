import { useState, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parse } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { useImportExerciseHistoryMutation } from '@/hooks/Exercises/useExercises';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  CsvRow,
  HistoryGroupedExerciseEntry,
  HistoryImportEntry,
} from '@/types/exercises';
import { getErrorMessage } from '@/utils/api';
import { CSV_DUMMY_DATA } from '@/constants/exercises';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import {
  readNumberCell,
  parseCsv,
  suggestHeaderMapping,
  MAX_CSV_FILE_SIZE_BYTES,
  isDayString,
  type DecimalFormat,
  type CsvFormatOptions,
  type CsvImportIssue,
  type CsvImportOutcome,
} from '@workspace/shared';

// readNumberCell (not parseFloat/parseInt/Number) so a locale-comma decimal
// like "300,5" parses to 300.5 instead of parseFloat's silent truncation at
// the comma — the same #1960 bug already fixed in the other importers.
const readOptionalNumber = (
  raw: string | undefined,
  format: DecimalFormat
): number | undefined => {
  if (!raw) return undefined;
  const read = readNumberCell(raw, format);
  return read.ok ? read.value : undefined;
};

const readOptionalInt = (
  raw: string | undefined,
  format: DecimalFormat
): number | undefined => {
  const value = readOptionalNumber(raw, format);
  return value === undefined ? undefined : Math.trunc(value);
};

// Numeric columns scanned for decimal-format auto-detection.
const NUMERIC_COLUMNS = [
  'calories_burned',
  'distance',
  'avg_heart_rate',
  'calories_per_hour',
  'reps',
  'weight',
  'duration_min',
  'rest_time_sec',
  'activity_value',
];

interface FailedEntry {
  entry: { exercise_name: string };
  reason: string;
}

interface ImportError {
  details?: {
    failedEntries?: FailedEntry[];
  };
}

const dropdownFields = new Set([
  'exercise_force',
  'exercise_level',
  'exercise_mechanic',
]);

export const dropdownOptions: Record<string, string[]> = {
  exercise_level: ['beginner', 'intermediate', 'expert'],
  exercise_force: ['pull', 'push', 'static'],
  exercise_mechanic: ['isolation', 'compound'],
};

export const requiredHeaders = [
  'entry_date',
  'exercise_name',
  ...Array.from(dropdownFields),
];

export function useExerciseHistoryImport(
  fileInputRef: RefObject<HTMLInputElement | null>,
  onImportComplete: () => void,
  csvFormat: CsvFormatOptions
) {
  const { t } = useTranslation();
  const { dateFormat, weightUnit, distanceUnit } = usePreferences();
  const { mutateAsync: importAsCsv } = useImportExerciseHistoryMutation();

  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  // Whatever was most recently loaded (file or paste), kept for the format
  // bar's live preview independent of csvText (which is cleared on parse).
  const [loadedText, setLoadedText] = useState('');
  const [groupedEntries, setGroupedEntries] = useState<
    HistoryGroupedExerciseEntry[]
  >([]);
  // Structured parse/validation outcome — replaces the former per-row
  // destructive toast storm (a 1400-row bad file used to fire 1400 toasts).
  const [result, setResult] = useState<CsvImportOutcome | null>(null);

  // Header-mapping dialog state — shown when required headers aren't found
  // by name. `pendingRows`/`pendingResolvedDecimal`/`pendingWarnings` hold
  // the already-parsed (but not yet grouped) data from the attempt that
  // triggered the dialog, so confirming the mapping doesn't need to
  // re-parse the file, only remap and regroup.
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>(
    {}
  );
  const [pendingRows, setPendingRows] = useState<Record<string, string>[]>([]);
  const [pendingResolvedDecimal, setPendingResolvedDecimal] =
    useState<DecimalFormat>('us');
  const [pendingWarnings, setPendingWarnings] = useState<
    CsvImportOutcome['parseWarnings']
  >([]);

  const weightUnitLabel = weightUnit === 'lbs' ? 'lbs' : 'kg';
  const dateFormatToUse = csvFormat.dateFormat ?? dateFormat;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      const selected = event.target.files[0];
      if (selected.size > MAX_CSV_FILE_SIZE_BYTES) {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'exercise.importHistoryCSV.fileTooLarge',
            'The selected file is too large. Please upload a file smaller than 25MB.'
          ),
          variant: 'destructive',
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setFile(selected);
      setGroupedEntries([]);
      setResult(null);
    } else {
      setFile(null);
    }
  };

  const handleTextChange = (value: string) => {
    setCsvText(value);
  };

  // Groups validated rows into one entry per (date, exercise, preset), and
  // collects every rejection as a structured issue instead of a toast — the
  // caller shows them in one result panel + one summary toast.
  const groupAndValidateData = (
    rows: CsvRow[],
    decimalFormat: DecimalFormat
  ): { grouped: HistoryGroupedExerciseEntry[]; errors: CsvImportIssue[] } => {
    const grouped: Record<string, HistoryGroupedExerciseEntry> = {};
    const errors: CsvImportIssue[] = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const entryDateStr = row.entry_date;
      const exerciseName = row.exercise_name?.trim();
      const presetName = row.preset_name?.trim() || 'Individual Entry';

      if (!entryDateStr || !exerciseName) {
        errors.push({
          row: rowNum,
          error: t(
            'exercise.importHistoryCSV.validationError',
            "Row {{rowNum}}: Missing required 'entry_date' or 'exercise_name'. Skipping row.",
            { rowNum }
          ),
          entry: row,
        });
        return;
      }

      let parsedDate: Date;
      try {
        // An already-ISO date (yyyy-MM-dd) parses correctly regardless of
        // the selected date format — without this, a file with ISO dates
        // (the common case for exports from other apps) would fail on
        // every single row whenever the selected/default format isn't
        // also yyyy-MM-dd, since date-fns' parse() only recognizes the
        // exact pattern given.
        parsedDate = isDayString(entryDateStr)
          ? parse(entryDateStr, 'yyyy-MM-dd', new Date())
          : parse(entryDateStr, dateFormatToUse, new Date());
        if (isNaN(parsedDate.getTime())) throw new Error('Invalid date.');
      } catch {
        errors.push({
          row: rowNum,
          error: t(
            'exercise.importHistoryCSV.invalidDate',
            "Row {{rowNum}}: Invalid date format for '{{date}}'. Expected {{format}}.",
            {
              rowNum,
              date: entryDateStr,
              format: dateFormatToUse,
            }
          ),
          entry: row,
        });
        return;
      }

      const key = `${format(parsedDate, 'yyyy-MM-dd')}|${exerciseName}|${presetName}`;

      if (!grouped[key]) {
        const resolveDropdown = (field: string, value?: string) =>
          dropdownFields.has(field)
            ? dropdownOptions[field]?.find(
                (o) => o === value?.trim()?.toLowerCase()
              ) || value?.trim()
            : value?.trim();

        grouped[key] = {
          id: key,
          entry_date: parsedDate,
          exercise_name: exerciseName,
          preset_name:
            presetName !== 'Individual Entry' ? presetName : undefined,
          entry_notes: row.entry_notes?.trim(),
          calories_burned: readOptionalNumber(
            row.calories_burned,
            decimalFormat
          ),
          distance: readOptionalNumber(row.distance, decimalFormat),
          avg_heart_rate: readOptionalNumber(row.avg_heart_rate, decimalFormat),
          exercise_category: row.exercise_category?.trim(),
          calories_per_hour: readOptionalNumber(
            row.calories_per_hour,
            decimalFormat
          ),
          exercise_description: row.exercise_description?.trim(),
          exercise_source: row.exercise_source?.trim(),
          exercise_force: resolveDropdown('exercise_force', row.exercise_force),
          exercise_level: resolveDropdown('exercise_level', row.exercise_level),
          exercise_mechanic: resolveDropdown(
            'exercise_mechanic',
            row.exercise_mechanic
          ),
          exercise_equipment: row.exercise_equipment
            ? row.exercise_equipment
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          primary_muscles: row.primary_muscles
            ? row.primary_muscles
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          secondary_muscles: row.secondary_muscles
            ? row.secondary_muscles
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          instructions: row.instructions
            ? row.instructions
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          sets: [],
          activity_details: [],
        };
      }

      if (row.set_number) {
        const setNum = readOptionalInt(row.set_number, decimalFormat);
        if (setNum === undefined) {
          errors.push({
            row: rowNum,
            error: t(
              'exercise.importHistoryCSV.invalidSetNumber',
              "Row {{rowNum}}: Invalid set number '{{value}}'.",
              { rowNum, value: row.set_number }
            ),
            entry: row,
          });
        } else {
          grouped[key].sets.push({
            set_number: setNum,
            set_type: row.set_type?.trim(),
            reps: readOptionalInt(row.reps, decimalFormat),
            weight: readOptionalNumber(row.weight, decimalFormat),
            duration_min: readOptionalNumber(row.duration_min, decimalFormat),
            rest_time_sec: readOptionalInt(row.rest_time_sec, decimalFormat),
            notes: row.set_notes?.trim(),
          });
        }
      }

      if (row.activity_field_name && row.activity_value) {
        // activity_value is intentionally number-or-string: fall back to the
        // trimmed raw text when it doesn't parse as a number, same as before.
        const activityNumber = readOptionalNumber(
          row.activity_value,
          decimalFormat
        );
        grouped[key].activity_details.push({
          field_name: row.activity_field_name.trim(),
          value: activityNumber ?? row.activity_value.trim(),
        });
      }
    });

    Object.values(grouped).forEach((entry) => {
      entry.sets.sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
    });

    return { grouped: Object.values(grouped), errors };
  };

  // Groups+validates already-parsed rows and publishes the result. Shared
  // by the direct path and the post-mapping-confirm path so both end the
  // same way.
  const finalizeGroup = (
    rows: CsvRow[],
    resolvedDecimal: DecimalFormat,
    warnings: CsvImportOutcome['parseWarnings']
  ) => {
    const { grouped, errors } = groupAndValidateData(rows, resolvedDecimal);
    setGroupedEntries(grouped);
    setResult({
      processed: grouped,
      skipped: [],
      errors,
      parseWarnings: warnings,
    });

    if (errors.length > 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.rowsRejected',
          '{{failed}} of {{total}} rows could not be imported — see details below.',
          { failed: errors.length, total: rows.length }
        ),
        variant: 'destructive',
      });
    }
  };

  // Applies a confirmed header mapping to a raw row: the required fields
  // (entry_date, exercise_name, exercise_force/level/mechanic) read from
  // their mapped file column; every other column (calories_burned, sets,
  // activity fields, ...) is optional and assumed to already match by name,
  // same as the direct-parse path.
  const remapRow = (
    rawRow: Record<string, string>,
    mapping: Record<string, string>
  ): CsvRow => {
    const remapped: Record<string, string> = { ...rawRow };
    requiredHeaders.forEach((header) => {
      const fileColumn = mapping[header];
      remapped[header] = fileColumn ? (rawRow[fileColumn] ?? '') : '';
    });
    return remapped as CsvRow;
  };

  // Single text-based parse path shared by file upload and paste — this is
  // what gives Workout History paste-text parity with Food DB/Food Diary,
  // and lets both go through the same delimiter/quote-char/decimal options.
  // Returns whether the file parsed and grouped directly (false means the
  // header-mapping dialog was opened instead), so callers can decide
  // whether it's safe to clear the paste textarea.
  const parseAndGroupText = (text: string): boolean => {
    setLoadedText(text);
    const { rows, headers, resolvedDecimal, warnings, fatal } = parseCsv(
      text,
      csvFormat,
      { numericColumns: NUMERIC_COLUMNS }
    );

    if (fatal) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.parseError',
          'Failed to parse CSV: {{error}}',
          { error: fatal.message }
        ),
        variant: 'destructive',
      });
      return false;
    }

    const missingHeaders = requiredHeaders.filter(
      (header) => !headers.includes(header)
    );
    if (missingHeaders.length > 0) {
      setFileHeaders(headers);
      setHeaderMapping(suggestHeaderMapping(requiredHeaders, headers));
      setPendingRows(rows);
      setPendingResolvedDecimal(resolvedDecimal);
      setPendingWarnings(warnings);
      setShowMapping(true);
      toast({
        title: t('exercise.importHistoryCSV.headersMapped', 'Headers Mapped'),
        description: t(
          'exercise.importHistoryCSV.mapRequiredFields',
          'Your CSV headers do not match the required format. Please map the fields to continue.'
        ),
      });
      return false;
    }

    setShowMapping(false);
    finalizeGroup(rows as CsvRow[], resolvedDecimal, warnings);
    return true;
  };

  const handleConfirmMapping = () => {
    const remapped = pendingRows.map((row) => remapRow(row, headerMapping));
    setShowMapping(false);
    finalizeGroup(remapped, pendingResolvedDecimal, pendingWarnings);
  };

  const handleCancelMapping = () => {
    setShowMapping(false);
    setFileHeaders([]);
    setHeaderMapping({});
    setPendingRows([]);
  };

  const handleProcessFile = () => {
    if (!file) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.noFile',
          'Please select a CSV file to import.'
        ),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text || text.trim() === '') {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'exercise.importHistoryCSV.emptyFile',
            'The selected file is empty.'
          ),
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }
      parseAndGroupText(text);
      setLoading(false);
    };
    reader.onerror = () => {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.parseError',
          'Failed to parse CSV: {{error}}',
          { error: getErrorMessage(reader.error) }
        ),
        variant: 'destructive',
      });
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const handleProcessText = () => {
    if (!csvText.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.pasteFirst',
          'Please paste some CSV data first.'
        ),
        variant: 'destructive',
      });
      return;
    }
    // Only clear the pasted text on a successful direct parse — if it
    // triggered the mapping dialog instead, clearing it here would leave
    // no way to re-parse after Cancel (the textarea would just be empty).
    if (parseAndGroupText(csvText)) {
      setCsvText('');
    }
  };

  const handleImportSubmit = async () => {
    if (groupedEntries.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.noDataToImport',
          'No valid data to import.'
        ),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const entries: HistoryImportEntry[] = groupedEntries.map((entry) => ({
        ...entry,
        entry_date: format(entry.entry_date, 'yyyy-MM-dd'),
      }));
      await importAsCsv(entries);
      onImportComplete();
    } catch (error: unknown) {
      const importError = error as ImportError;
      let errorMessage = t('exercise.importHistoryCSV.importError');

      if (importError?.details?.failedEntries) {
        errorMessage = t('exercise.importHistoryCSV.partialImportError', {
          details: importError.details.failedEntries
            .map((e) => `${e.entry.exercise_name} - ${e.reason}`)
            .join(', '),
        });
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast({
        title: t('common.error', 'Error'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = () => {
    setFile(null);
    setCsvText('');
    setLoadedText('');
    setGroupedEntries([]);
    setResult(null);
    setShowMapping(false);
    setFileHeaders([]);
    setHeaderMapping({});
    setPendingRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast({
      title: t('common.success', 'Success'),
      description: t(
        'exercise.importHistoryCSV.dataCleared',
        'All parsed data cleared.'
      ),
    });
  };

  const handleAddNewEntry = () => {
    const newEntryId = `manual_entry_${uuidv4()}`;
    setGroupedEntries((prev) => [
      ...prev,
      {
        id: newEntryId,
        entry_date: new Date(),
        exercise_name: '',
        sets: [],
        activity_details: [],
      },
    ]);
    toast({
      title: t('common.success', 'Success'),
      description: t(
        'exercise.importHistoryCSV.emptyEntryAdded',
        'New empty entry added. Please fill in the details.'
      ),
    });
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'entry_date',
      'exercise_name',
      'preset_name',
      'entry_notes',
      'calories_burned',
      'distance',
      'avg_heart_rate',
      'set_number',
      'set_type',
      'reps',
      'weight',
      'duration_min',
      'rest_time_sec',
      'set_notes',
      'exercise_category',
      'calories_per_hour',
      'exercise_description',
      'exercise_source',
      'exercise_force',
      'exercise_level',
      'exercise_mechanic',
      'exercise_equipment',
      'primary_muscles',
      'secondary_muscles',
      'instructions',
      'activity_field_name',
      'activity_value',
    ];
    const csv = Papa.unparse({ fields: headers, data: CSV_DUMMY_DATA });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'historical_exercise_entries_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSetDisplay = (sets: HistoryGroupedExerciseEntry['sets']) =>
    sets
      .map(
        (set) =>
          `${set.set_number}: ${set.reps ?? '-'} reps @ ${set.weight != null ? `${set.weight}${weightUnitLabel}` : '-'} (${set.set_type || '-'})`
      )
      .join('; ');

  const getActivityDetailsDisplay = (
    details: HistoryGroupedExerciseEntry['activity_details']
  ) => details.map((d) => `${d.field_name}: ${d.value}`).join('; ');

  return {
    loading,
    file,
    csvText,
    loadedText,
    groupedEntries,
    result,
    dropdownOptions,
    weightUnit,
    distanceUnit,
    dateFormat,
    numericColumns: NUMERIC_COLUMNS,
    showMapping,
    setShowMapping,
    fileHeaders,
    headerMapping,
    setHeaderMapping,
    handleFileChange,
    handleTextChange,
    handleProcessFile,
    handleProcessText,
    handleConfirmMapping,
    handleCancelMapping,
    handleImportSubmit,
    handleClearData,
    handleAddNewEntry,
    handleDownloadTemplate,
    getSetDisplay,
    getActivityDetailsDisplay,
  };
}
