import { ExerciseCSVData } from '@/pages/Exercises/ExerciseImportCSV';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../use-toast';
import { requiredHeaders } from '@/constants/exercises';
import { parseCSV, generateUniqueId } from '@/utils/exercises';
import {
  parseCsvHeaders,
  suggestHeaderMapping,
  MAX_CSV_FILE_SIZE_BYTES,
  type CsvFormatOptions,
} from '@workspace/shared';

// Debounce for the reparse-on-format-change effects below — collapses rapid
// format-bar clicks into a single re-parse instead of one per click.
const REPARSE_DEBOUNCE_MS = 400;

export function useExerciseImport(
  onSave: (data: Omit<ExerciseCSVData, 'id'>[]) => Promise<void>,
  csvFormat: CsvFormatOptions
) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<ExerciseCSVData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>(
    {}
  );
  const [rawCsvText, setRawCsvText] = useState<string>('');
  // Loaded file text kept around (independent of rawCsvText, which is only
  // set on the header-mapping-required branch) so the page can drive the
  // format-bar's live preview off whatever was last loaded.
  const [loadedText, setLoadedText] = useState<string>('');
  // Tracks whether csvData currently reflects the header-mapping path (so
  // the reparse-on-format-change effects below know whether to re-run
  // parseCSV against loadedText with no mapping, or against rawCsvText
  // with headerMapping — using the wrong one would silently produce empty
  // or misaligned rows).
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Decides whether `text` parses directly under the current format, or
  // needs the header-mapping dialog, and acts on that decision. Shared by
  // the initial upload and the reparse-on-format-change effect below, so a
  // delimiter fix after Cancel re-evaluates from scratch instead of either
  // blindly parsing invalid columns or being stuck needing a fresh
  // re-upload — this is the mapping dialog's "escape hatch back to the
  // bar": adjusting the format bar after Cancel is enough, no separate
  // button needed, because the decision itself re-runs.
  const evaluateAndParse = (text: string, { silent = false } = {}) => {
    const { headers: parsedFileHeaders } = parseCsvHeaders(text, csvFormat);
    const areHeadersValid = requiredHeaders.every((req) =>
      parsedFileHeaders.includes(req)
    );
    if (areHeadersValid) {
      setMappingConfirmed(false);
      setShowMapping(false);
      const parsedData = parseCSV(text, undefined, csvFormat);
      const header = parsedData[0];
      if (parsedData.length > 0 && header) {
        setHeaders(Object.keys(header).filter((key) => key !== 'id'));
        setCsvData(parsedData);
      } else if (!silent) {
        toast({
          title: t('exercise.exerciseImportCSV.noDataFound', 'No Data Found'),
          description: t(
            'exercise.exerciseImportCSV.noDataFoundDescription',
            'The CSV file contains headers but no data rows.'
          ),
          variant: 'destructive',
        });
      }
    } else {
      if (parsedFileHeaders) setFileHeaders(parsedFileHeaders);
      setHeaderMapping(
        suggestHeaderMapping(requiredHeaders, parsedFileHeaders ?? [])
      );
      setRawCsvText(text);
      setShowMapping(true);
      if (!silent) {
        toast({
          title: t(
            'exercise.exerciseImportCSV.headersMapped',
            'Headers Mapped'
          ),
          description: t(
            'exercise.exerciseImportCSV.mapRequiredFields',
            'Your CSV headers do not match the required format. Please map the fields to continue.'
          ),
          variant: 'default',
        });
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
      toast({
        title: t('exercise.exerciseImportCSV.importError', 'Import Error'),
        description: t(
          'exercise.exerciseImportCSV.fileTooLarge',
          'The selected file is too large. Please upload a file smaller than 25MB.'
        ),
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      if (!text || text.trim() === '') {
        toast({
          title: t('exercise.exerciseImportCSV.importError', 'Import Error'),
          description: t(
            'exercise.exerciseImportCSV.emptyFile',
            'The selected file is empty.'
          ),
          variant: 'destructive',
        });
        return;
      }
      setLoadedText(text);
      evaluateAndParse(text);
    };
    reader.onerror = () => {
      toast({
        title: t('exercise.exerciseImportCSV.importError', 'Import Error'),
        description: t(
          'exercise.exerciseImportCSV.readError',
          'Failed to read the selected file.'
        ),
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Re-evaluates the already-loaded file whenever the user changes the
  // format bar (delimiter/decimal/quote) after upload, including after
  // Cancelling out of the mapping dialog — a delimiter fix can flip a file
  // from "needs mapping" to "parses directly" or vice versa, so this reruns
  // the full decision, not just a blind reparse. Skipped once mapping has
  // been explicitly confirmed (see the effect below, which reparses with
  // the confirmed mapping instead of re-deciding).
  //
  // Deliberately NOT keyed on showMapping/mappingConfirmed — they're read
  // only as a guard, not a trigger. Cancel flips showMapping true->false,
  // and if that were a dependency this effect would immediately re-fire
  // with the unchanged format and silently reopen the very dialog the user
  // just closed. It should only run again once csvFormat/loadedText change.
  //
  // Debounced: a full re-parse is real work on a large file, and each
  // format-bar click would otherwise trigger one immediately. React cancels
  // the pending timeout (via the cleanup) whenever a dependency changes
  // again before it fires, so rapid clicks collapse into a single parse.
  useEffect(() => {
    if (!loadedText || showMapping || mappingConfirmed) return;
    const timer = setTimeout(() => {
      evaluateAndParse(loadedText, { silent: true });
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvFormat, loadedText]);

  // Same reparse-on-format-change behavior for files that went through the
  // header-mapping dialog — must use rawCsvText + headerMapping, not
  // loadedText with no mapping, or headers would no longer line up.
  useEffect(() => {
    if (!mappingConfirmed || showMapping) return;
    const timer = setTimeout(() => {
      const parsedData = parseCSV(rawCsvText, headerMapping, csvFormat);
      const header = parsedData[0];
      if (parsedData.length > 0 && header) {
        setHeaders(Object.keys(header).filter((key) => key !== 'id'));
        setCsvData(parsedData);
      }
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [csvFormat, rawCsvText, headerMapping, mappingConfirmed, showMapping]);

  const handleDownloadTemplate = () => {
    const sampleData: Omit<ExerciseCSVData, 'id'>[] = [
      {
        name: 'Push-ups',
        category: 'Strength',
        calories_per_hour: 300,
        description: 'Bodyweight exercise for chest, shoulders, and triceps.',
        force: 'Push',
        level: 'Beginner',
        mechanic: 'Compound',
        equipment: 'Bodyweight',
        primary_muscles: 'Chest, Triceps',
        secondary_muscles: 'Shoulders',
        instructions:
          'Start in plank position; Lower chest to floor; Push back up.',
        images:
          'https://example.com/pushup1.jpg,https://example.com/pushup2.jpg',
        is_custom: true,
        shared_with_public: false,
      },
    ];

    const headerString = requiredHeaders.map((h) => `"${h}"`).join(',');
    const rowsString = sampleData
      .map((row) =>
        requiredHeaders
          .map((header) => {
            const value = row[header as keyof typeof row];
            if (
              typeof value === 'string' &&
              (value.includes(',') ||
                value.includes('"') ||
                value.includes('\n'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([`${headerString}\n${rowsString}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'exercise_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditCell = (
    id: string,
    field: string,
    value: string | number | boolean
  ) => {
    setCsvData((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleDeleteRow = (id: string) => {
    setCsvData((prev) => prev.filter((row) => row.id !== id));
  };

  const handleAddNewRow = () => {
    const newRow: ExerciseCSVData = {
      id: generateUniqueId(),
      name: '',
      category: '',
      calories_per_hour: 0,
      description: '',
      force: '',
      level: '',
      mechanic: '',
      equipment: '',
      primary_muscles: '',
      secondary_muscles: '',
      instructions: '',
      images: '',
      is_custom: true,
      shared_with_public: false,
    };
    if (headers.length === 0) setHeaders(requiredHeaders);
    setCsvData((prev) => [...prev, newRow]);
  };

  const clearData = () => {
    setCsvData([]);
    setHeaders([]);
    setLoadedText('');
    setMappingConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmMapping = () => {
    const unmapped = requiredHeaders.filter((header) => !headerMapping[header]);
    if (unmapped.length > 0) {
      const confirmed = window.confirm(
        `Some required headers are not mapped. Unmapped fields will be empty: ${unmapped.join(', ')}. Continue?`
      );
      if (!confirmed) return;
    }
    parseWithMapping();
  };

  const parseWithMapping = () => {
    const parsedData = parseCSV(rawCsvText, headerMapping, csvFormat);
    const header = parsedData[0];
    if (parsedData.length > 0 && header) {
      setHeaders(Object.keys(header).filter((key) => key !== 'id'));
      setCsvData(parsedData);
      setShowMapping(false);
      setMappingConfirmed(true);
      toast({
        title: t(
          'exercise.exerciseImportCSV.parseSuccessful',
          'Parse Successful'
        ),
        description: t(
          'exercise.exerciseImportCSV.dataParsedSuccessfully',
          'CSV data has been parsed and loaded successfully.'
        ),
      });
    } else {
      toast({
        title: t('exercise.exerciseImportCSV.noDataFound', 'No Data Found'),
        variant: 'destructive',
      });
    }
  };

  const handleCancelMapping = () => {
    setShowMapping(false);
    setFileHeaders([]);
    setHeaderMapping({});
    setRawCsvText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (csvData.some((row) => !row.name || String(row.name).trim() === '')) {
      toast({
        title: t(
          'exercise.exerciseImportCSV.validationError',
          'Validation Error'
        ),
        description: t(
          'exercise.exerciseImportCSV.nameEmptyError',
          "The 'name' field cannot be empty."
        ),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      await onSave(csvData.map(({ id, ...rest }) => rest));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    csvData,
    headers,
    loadedText,
    showMapping,
    setShowMapping,
    fileHeaders,
    headerMapping,
    setHeaderMapping,
    fileInputRef,
    handleFileUpload,
    handleDownloadTemplate,
    handleEditCell,
    handleDeleteRow,
    handleAddNewRow,
    clearData,
    handleConfirmMapping,
    handleCancelMapping,
    handleSubmit,
  };
}
