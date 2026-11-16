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

import i18n from 'i18next';
// Debounce for the reparse-on-format-change effects below — collapses rapid
// format-bar clicks into a single re-parse instead of one per click.
const REPARSE_DEBOUNCE_MS = 400;

export function useExerciseImport(
  onSave: (data: Omit<ExerciseCSVData, 'id'>[]) => Promise<void>,
  csvFormat: CsvFormatOptions,
  onDirtyChange: (dirty: boolean) => void
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
  // The pending reparse-on-format-change timer, if any. The two effects below
  // are mutually exclusive (one requires mappingConfirmed, the other not), so
  // at most one timer is live at a time. Cleared at the save boundary so a
  // delayed reparse of the just-saved file can't replace csvData with new row
  // IDs and falsely mark the form dirty.
  const reparseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True once the user has edited the table (cell/row add/delete) since the
  // last parse. Edited rows are the source of truth: a pending reparse must not
  // rebuild them from the (now-stale) file text. Reset on every fresh parse and
  // on clear.
  const editedSinceParseRef = useRef(false);
  // The serialized format used for the last parse. Lets the reparse effects skip
  // a redundant timer when the format hasn't changed since the table was last
  // parsed (e.g. right after a fresh load) — arming it then would only re-parse
  // the same file and wipe an edit made in the window.
  const lastParsedFormatRef = useRef<string | null>(null);

  // The launcher confirms closing only while this form is dirty. A successful
  // save doesn't clear the table, so remember the saved csvData reference and
  // treat the form as clean until it changes again (state, not a ref, so the
  // save boundary change triggers a re-render and recompute).
  const [savedSnapshot, setSavedSnapshot] =
    useState<ExerciseCSVData[]>(csvData);
  // Compare by reference only when there are rows: a freshly cleared/deleted
  // empty table is a new array that would differ from the snapshot and falsely
  // report dirty. An empty table with no pending mapping is clean.
  const isDirty =
    (csvData.length > 0 && csvData !== savedSnapshot) || showMapping;
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

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
        editedSinceParseRef.current = false;
        lastParsedFormatRef.current = JSON.stringify(csvFormat);
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
    // Arm the timer only when the format actually changed since the last parse.
    // Right after a fresh load the format is unchanged, so a reparse would just
    // re-parse the same file and wipe an edit made in the window.
    if (lastParsedFormatRef.current === JSON.stringify(csvFormat)) return;
    const timer = setTimeout(() => {
      reparseTimerRef.current = null;
      evaluateAndParse(loadedText, { silent: true });
    }, REPARSE_DEBOUNCE_MS);
    reparseTimerRef.current = timer;
    return () => {
      if (reparseTimerRef.current === timer) reparseTimerRef.current = null;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvFormat, loadedText]);

  // Same reparse-on-format-change behavior for files that went through the
  // header-mapping dialog — must use rawCsvText + headerMapping, not
  // loadedText with no mapping, or headers would no longer line up.
  useEffect(() => {
    if (!mappingConfirmed || showMapping) return;
    // Arm only on a real format change, same as the no-mapping path above.
    if (lastParsedFormatRef.current === JSON.stringify(csvFormat)) return;
    const timer = setTimeout(() => {
      reparseTimerRef.current = null;
      const parsedData = parseCSV(rawCsvText, headerMapping, csvFormat);
      const header = parsedData[0];
      if (parsedData.length > 0 && header) {
        setHeaders(Object.keys(header).filter((key) => key !== 'id'));
        setCsvData(parsedData);
        editedSinceParseRef.current = false;
        lastParsedFormatRef.current = JSON.stringify(csvFormat);
      }
    }, REPARSE_DEBOUNCE_MS);
    reparseTimerRef.current = timer;
    return () => {
      if (reparseTimerRef.current === timer) reparseTimerRef.current = null;
      clearTimeout(timer);
    };
  }, [csvFormat, rawCsvText, headerMapping, mappingConfirmed, showMapping]);

  const handleDownloadTemplate = () => {
    const sampleData: Omit<ExerciseCSVData, 'id'>[] = [
      {
        name: 'Push-ups',
        category: 'Strength',
        calories_per_hour: 300,
        description: i18n.t(
          'hooks.useExerciseImport.bodyweightExerciseForChestShoulders',
          'Bodyweight exercise for chest, shoulders, and triceps.'
        ),
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
    editedSinceParseRef.current = true;
    setCsvData((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleDeleteRow = (id: string) => {
    editedSinceParseRef.current = true;
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
    editedSinceParseRef.current = true;
    setCsvData((prev) => [...prev, newRow]);
  };

  const clearData = () => {
    editedSinceParseRef.current = false;
    lastParsedFormatRef.current = null;
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
      editedSinceParseRef.current = false;
      lastParsedFormatRef.current = JSON.stringify(csvFormat);
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

  // Applies a pending reparse-on-format-change synchronously, so a save issued
  // within the debounce window doesn't persist rows parsed under the previous
  // format (e.g. a decimal-format change that hasn't re-parsed yet). Returns
  // the rows to save (the edited rows, or the freshly parsed rows), or null to
  // abort the save (the format change flipped the file into header-mapping
  // mode, where there's no confirmed table). Clears the pending timer.
  const flushPendingReparse = (): ExerciseCSVData[] | null => {
    if (!reparseTimerRef.current) return null;
    // A format change is pending and the table has edits: applying the new
    // format would wipe the edits, while saving now would persist values from
    // the previous format. Return null to block the save, but leave the timer
    // alive so the reparse still fires and settles the conflict — clearing it
    // here would let a retry save the stale old-format rows.
    if (editedSinceParseRef.current) return null;
    clearTimeout(reparseTimerRef.current);
    reparseTimerRef.current = null;
    if (mappingConfirmed && rawCsvText) {
      const parsedData = parseCSV(rawCsvText, headerMapping, csvFormat);
      const header = parsedData[0];
      if (parsedData.length > 0 && header) {
        setHeaders(Object.keys(header).filter((key) => key !== 'id'));
        setCsvData(parsedData);
        editedSinceParseRef.current = false;
        lastParsedFormatRef.current = JSON.stringify(csvFormat);
        return parsedData;
      }
      // The format change broke the confirmed parse; reopen mapping so the user
      // remaps, and block saving the stale table.
      setShowMapping(true);
      return null;
    } else if (loadedText && !showMapping) {
      const { headers: parsedFileHeaders } = parseCsvHeaders(
        loadedText,
        csvFormat
      );
      const areHeadersValid = requiredHeaders.every((req) =>
        parsedFileHeaders.includes(req)
      );
      if (areHeadersValid) {
        const parsedData = parseCSV(loadedText, undefined, csvFormat);
        const header = parsedData[0];
        if (parsedData.length > 0 && header) {
          setHeaders(Object.keys(header).filter((key) => key !== 'id'));
          setCsvData(parsedData);
          editedSinceParseRef.current = false;
          lastParsedFormatRef.current = JSON.stringify(csvFormat);
          return parsedData;
        }
      }
      // Headers no longer valid under the new format: enter mapping recovery
      // (opens the dialog) instead of silently dropping the table, and block
      // saving the stale rows.
      evaluateAndParse(loadedText, { silent: true });
      return null;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // While the header-mapping dialog is open there's no confirmed table to
    // save — a format change that invalidated the headers opens it via
    // flushPendingReparse, so don't persist the stale rows.
    if (showMapping) return;
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
      // A pending reparse (scheduled by a format-bar change) would otherwise
      // save rows parsed under the previous format. Apply it first so the
      // saved values reflect the current format, and stamp the snapshot with
      // the same rows so the form closes cleanly.
      let dataToSave: ExerciseCSVData[];
      if (reparseTimerRef.current) {
        const flushed = flushPendingReparse();
        if (flushed === null) {
          // The pending reparse can't be applied safely (edits + format change,
          // or the file flipped into header-mapping mode). Abort rather than
          // persist stale rows; the user lets the reparse settle and retries.
          toast({
            title: t(
              'exercise.exerciseImportCSV.reparsePending',
              'Please Wait'
            ),
            description: t(
              'exercise.exerciseImportCSV.reparsePendingDescription',
              'A format change is still processing. Try again in a moment.'
            ),
            variant: 'default',
          });
          return;
        }
        dataToSave = flushed;
      } else {
        dataToSave = csvData;
      }
      await onSave(dataToSave.map(({ id, ...rest }) => rest));
      // Saved: the table now matches what's stored, so closing shouldn't prompt.
      setSavedSnapshot(dataToSave);
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
