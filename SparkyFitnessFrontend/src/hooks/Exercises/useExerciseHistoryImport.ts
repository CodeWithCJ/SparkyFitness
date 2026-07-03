import { useState, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
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

const requiredHeaders = [
  'entry_date',
  'exercise_name',
  ...Array.from(dropdownFields),
];

export function useExerciseHistoryImport(
  fileInputRef: RefObject<HTMLInputElement | null>,
  onImportComplete: () => void
) {
  const { t } = useTranslation();
  const { dateFormat, weightUnit, distanceUnit } = usePreferences();
  const { mutateAsync: importAsCsv } = useImportExerciseHistoryMutation();

  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [groupedEntries, setGroupedEntries] = useState<
    HistoryGroupedExerciseEntry[]
  >([]);
  const [selectedDateFormat, setSelectedDateFormat] =
    useState<string>(dateFormat);

  const weightUnitLabel = weightUnit === 'lbs' ? 'lbs' : 'kg';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.[0]) {
      setFile(event.target.files[0]);
      setGroupedEntries([]);
    } else {
      setFile(null);
    }
  };

  const groupAndValidateData = (rows: CsvRow[]) => {
    const grouped: Record<string, HistoryGroupedExerciseEntry> = {};

    rows.forEach((row, index) => {
      const entryDateStr = row.entry_date;
      const exerciseName = row.exercise_name?.trim();
      const presetName = row.preset_name?.trim() || 'Individual Entry';

      if (!entryDateStr || !exerciseName) {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'exercise.importHistoryCSV.validationError',
            "Row {{rowNum}}: Missing required 'entry_date' or 'exercise_name'. Skipping row.",
            { rowNum: index + 2 }
          ),
          variant: 'destructive',
        });
        return;
      }

      let parsedDate: Date;
      try {
        parsedDate = parse(entryDateStr, selectedDateFormat, new Date());
        if (isNaN(parsedDate.getTime())) throw new Error('Invalid date.');
      } catch {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'exercise.importHistoryCSV.invalidDate',
            "Row {{rowNum}}: Invalid date format for '{{date}}'. Expected {{format}}.",
            {
              rowNum: index + 2,
              date: entryDateStr,
              format: selectedDateFormat,
            }
          ),
          variant: 'destructive',
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
          calories_burned: row.calories_burned
            ? parseFloat(row.calories_burned)
            : undefined,
          distance: row.distance ? parseFloat(row.distance) : undefined,
          avg_heart_rate: row.avg_heart_rate
            ? parseFloat(row.avg_heart_rate)
            : undefined,
          exercise_category: row.exercise_category?.trim(),
          calories_per_hour: row.calories_per_hour
            ? parseFloat(row.calories_per_hour)
            : undefined,
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
        grouped[key].sets.push({
          set_number: parseInt(row.set_number),
          set_type: row.set_type?.trim(),
          reps: row.reps ? parseInt(row.reps) : undefined,
          weight: row.weight ? parseFloat(row.weight) : undefined,
          duration_min: row.duration_min
            ? parseInt(row.duration_min)
            : undefined,
          rest_time_sec: row.rest_time_sec
            ? parseInt(row.rest_time_sec)
            : undefined,
          notes: row.set_notes?.trim(),
        });
      }

      if (row.activity_field_name && row.activity_value) {
        grouped[key].activity_details.push({
          field_name: row.activity_field_name.trim(),
          value:
            !isNaN(Number(row.activity_value)) &&
            row.activity_value.trim() !== ''
              ? Number(row.activity_value)
              : row.activity_value.trim(),
        });
      }
    });

    Object.values(grouped).forEach((entry) => {
      entry.sets.sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
    });

    setGroupedEntries(Object.values(grouped));
  };

  const parseCsvFile = (csvFile: File) => {
    setLoading(true);
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          toast({
            title: t('common.error', 'Error'),
            description: t(
              'exercise.importHistoryCSV.parseError',
              'Failed to parse CSV: {{error}}',
              { error: results.errors[0]?.message }
            ),
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        const missingHeaders = requiredHeaders.filter(
          (header) => !results.meta.fields?.includes(header)
        );
        if (missingHeaders.length > 0) {
          toast({
            title: t('common.error', 'Error'),
            description: t(
              'exercise.importHistoryCSV.missingHeaders',
              'Missing required headers: {{headers}}',
              { headers: missingHeaders.join(', ') }
            ),
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        groupAndValidateData(results.data as CsvRow[]);
        setLoading(false);
      },
      error: (error: unknown) => {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'exercise.importHistoryCSV.parseError',
            'Failed to parse CSV: {{error}}',
            { error: getErrorMessage(error) }
          ),
          variant: 'destructive',
        });
        setLoading(false);
      },
    });
  };

  const handleProcessFile = () => {
    if (file) {
      parseCsvFile(file);
    } else {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.importHistoryCSV.noFile',
          'Please select a CSV file to import.'
        ),
        variant: 'destructive',
      });
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
    setGroupedEntries([]);
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
    groupedEntries,
    selectedDateFormat,
    setSelectedDateFormat,
    dropdownOptions,
    weightUnit,
    distanceUnit,
    dateFormat,
    handleFileChange,
    handleProcessFile,
    handleImportSubmit,
    handleClearData,
    handleAddNewEntry,
    handleDownloadTemplate,
    getSetDisplay,
    getActivityDetailsDisplay,
  };
}
