import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '../use-toast';
import {
  ImportCategory,
  getCategoryConfig,
} from '@/constants/healthDataImport';
import {
  HealthImportRow,
  generateUniqueId,
  mapRowsToHealthItems,
  parseHealthCSV,
} from '@/utils/healthDataImport';
import {
  importHealthDataCsv,
  HealthDataImportResult,
} from '@/api/CheckIn/checkInService';
import { moodKeys } from '@/api/keys/checkin';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';
import {
  parseCsvHeaders,
  suggestHeaderMapping,
  MAX_CSV_FILE_SIZE_BYTES,
  type CsvFormatOptions,
} from '@workspace/shared';

// Rows are POSTed in chunks so a large historical import stays within the
// server's 5000-row cap and body-size limits.
const CHUNK_SIZE = 1000;

// Debounce for the reparse-on-format-change effects below — collapses rapid
// format-bar clicks into a single re-parse instead of one per click.
const REPARSE_DEBOUNCE_MS = 400;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function useHealthDataImport(csvFormat: CsvFormatOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidateDiaryQueries = useDiaryInvalidation();

  const [category, setCategoryState] = useState<ImportCategory>('measurements');
  const [csvData, setCsvData] = useState<HealthImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthDataImportResult | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>(
    {}
  );
  const [rawCsvText, setRawCsvText] = useState('');
  // Kept independent of rawCsvText (only set on the mapping-required branch)
  // so the page can drive the format-bar's live preview off whatever file
  // was most recently loaded, regardless of which branch it took.
  const [loadedText, setLoadedText] = useState('');
  // Tracks whether csvData currently reflects the header-mapping path, so
  // the reparse-on-format-change effects below know whether to re-run
  // parseHealthCSV against loadedText with no mapping, or against
  // rawCsvText with headerMapping.
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = useMemo(() => getCategoryConfig(category), [category]);
  const headers = config.requiredHeaders;

  const clearData = () => {
    setCsvData([]);
    setResult(null);
    setLoadedText('');
    setMappingConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setCategory = (next: ImportCategory) => {
    setCategoryState(next);
    setCsvData([]);
    setResult(null);
    setShowMapping(false);
    setLoadedText('');
    setMappingConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const lastEvaluatedKeyRef = useRef<string>('');

  // Decides whether `text` parses directly under the current format, or
  // needs the header-mapping dialog, and acts on that decision. Shared by
  // the initial upload and the reparse-on-format-change effect below, so a
  // delimiter fix after Cancel re-evaluates from scratch instead of either
  // blindly parsing invalid columns or requiring a fresh re-upload — this
  // is the mapping dialog's "escape hatch back to the bar": adjusting the
  // format bar after Cancel is enough, because the decision itself reruns.
  const evaluateAndParse = (text: string) => {
    lastEvaluatedKeyRef.current = `${category}|${text}|${JSON.stringify(csvFormat)}`;
    const { headers: parsedFileHeaders } = parseCsvHeaders(text, csvFormat);
    const headersValid = config.requiredHeaders.every((req) =>
      parsedFileHeaders.includes(req)
    );
    if (headersValid) {
      setMappingConfirmed(false);
      setShowMapping(false);
      setCsvData(parseHealthCSV(text, category, undefined, csvFormat));
      setResult(null);
    } else {
      setFileHeaders(parsedFileHeaders);
      setHeaderMapping(
        suggestHeaderMapping(config.requiredHeaders, parsedFileHeaders)
      );
      setRawCsvText(text);
      setShowMapping(true);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
      toast({
        title: t('healthDataImport.importError', 'Import Error'),
        description: t(
          'healthDataImport.fileTooLarge',
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
          title: t('healthDataImport.importError', 'Import Error'),
          description: t(
            'healthDataImport.emptyFile',
            'The selected file is empty.'
          ),
          variant: 'destructive',
        });
        return;
      }
      setLoadedText(text);
      evaluateAndParse(text);
    };
    reader.readAsText(file);
  };

  const handleConfirmMapping = () => {
    setCsvData(parseHealthCSV(rawCsvText, category, headerMapping, csvFormat));
    setResult(null);
    setShowMapping(false);
    setMappingConfirmed(true);
  };

  // Re-evaluates the already-loaded file whenever the user changes the
  // format bar (delimiter/decimal/quote) after upload, including after
  // Cancelling out of the mapping dialog — a delimiter fix can flip a file
  // from "needs mapping" to "parses directly" or vice versa, so this reruns
  // the full decision. Decimal alone would already self-correct at submit
  // time (mapRowsToHealthItems re-detects it from csvData), but
  // delimiter/quote directly control how csvData's columns were split.
  //
  // Deliberately NOT keyed on showMapping/mappingConfirmed — they're read
  // only as a guard, not a trigger. Cancel flips showMapping true->false,
  // and if that were a dependency this effect would immediately re-fire
  // with the unchanged format and silently reopen the dialog just closed.
  useEffect(() => {
    if (!loadedText || showMapping || mappingConfirmed) return;
    const currentKey = `${category}|${loadedText}|${JSON.stringify(csvFormat)}`;
    if (lastEvaluatedKeyRef.current === currentKey) return;
    const timer = setTimeout(() => {
      evaluateAndParse(loadedText);
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvFormat, loadedText, category]);

  useEffect(() => {
    if (!mappingConfirmed || showMapping) return;
    const timer = setTimeout(() => {
      setCsvData(
        parseHealthCSV(rawCsvText, category, headerMapping, csvFormat)
      );
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    csvFormat,
    rawCsvText,
    headerMapping,
    category,
    mappingConfirmed,
    showMapping,
  ]);

  const handleCancelMapping = () => {
    setShowMapping(false);
    setFileHeaders([]);
    setHeaderMapping({});
    setRawCsvText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadTemplate = () => {
    const escape = (value: string) =>
      value.includes(',') || value.includes('"') || value.includes('\n')
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    const headerString = config.requiredHeaders.map(escape).join(',');
    const rowsString = config.sample
      .map((row) =>
        config.requiredHeaders.map((h) => escape(row[h] ?? '')).join(',')
      )
      .join('\n');
    const blob = new Blob([`${headerString}\n${rowsString}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${category}_template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditCell = (id: string, field: string, value: string) => {
    setCsvData((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleDeleteRow = (id: string) => {
    setCsvData((prev) => prev.filter((row) => row.id !== id));
  };

  const handleAddNewRow = () => {
    const newRow: HealthImportRow = { id: generateUniqueId() };
    config.requiredHeaders.forEach((h) => {
      newRow[h] = '';
    });
    setCsvData((prev) => [...prev, newRow]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { items, errors: clientErrors } = mapRowsToHealthItems(
      category,
      csvData,
      csvFormat.decimal
    );
    if (items.length === 0 && clientErrors.length === 0) {
      toast({
        title: t('healthDataImport.validationError', 'Nothing to import'),
        description: t(
          'healthDataImport.noItems',
          'No importable values were found. Check for empty rows or missing dates.'
        ),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      // Client-side rejections (e.g. unrecognized units) are surfaced in the
      // same result panel as the server's per-record errors.
      const aggregate: HealthDataImportResult = {
        message: '',
        processed: [],
        errors: [...clientErrors],
        skipped: [],
      };
      // A failed batch (network/server) must not discard the progress of
      // batches that already succeeded: record it and stop, then still show
      // the aggregate so the user knows exactly what was imported.
      for (const batch of chunk(items, CHUNK_SIZE)) {
        try {
          const res = await importHealthDataCsv(batch);
          aggregate.processed.push(...(res.processed ?? []));
          aggregate.errors.push(...(res.errors ?? []));
          aggregate.skipped.push(...(res.skipped ?? []));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Network or server error';
          aggregate.errors.push({
            error: `Batch of ${batch.length} rows failed and remaining rows were not sent: ${message}`,
            entry: { rows: batch.length },
          });
          break;
        }
      }
      setResult(aggregate);
      // Only clear the working table once every row succeeded; if anything
      // failed, leave the rows in place (with their errors shown below) so
      // the user can fix and resubmit instead of retyping the whole import.
      if (aggregate.errors.length === 0) {
        setCsvData([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      // Covers check-in measurements, custom measurements, sleep, water,
      // exercise, food entries, goals, and reports — every table
      // processHealthData can write to except mood, which has its own key.
      invalidateDiaryQueries();
      queryClient.invalidateQueries({ queryKey: moodKeys.all });
      // Mood-tag imports can auto-create custom mood definitions
      // (ensureCustomMoodsExist on the server); this ad-hoc key is what
      // useCustomMoods() reads, separate from moodKeys (mood entries).
      queryClient.invalidateQueries({ queryKey: ['custom-moods'] });
      toast({
        title: t('healthDataImport.importComplete', 'Import complete'),
        description: t(
          'healthDataImport.importSummary',
          'Imported {{processed}} records, {{skipped}} skipped, {{errors}} failed.',
          {
            processed: aggregate.processed.length,
            skipped: aggregate.skipped.length,
            errors: aggregate.errors.length,
          }
        ),
        variant: aggregate.errors.length > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      console.error(error);
      toast({
        title: t('healthDataImport.importError', 'Import Error'),
        description:
          error instanceof Error
            ? error.message
            : t(
                'healthDataImport.importFailed',
                'Failed to import health data.'
              ),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    category,
    setCategory,
    config,
    csvData,
    headers,
    loadedText,
    loading,
    result,
    showMapping,
    setShowMapping,
    fileHeaders,
    headerMapping,
    setHeaderMapping,
    fileInputRef,
    handleFileUpload,
    handleConfirmMapping,
    handleCancelMapping,
    handleDownloadTemplate,
    handleEditCell,
    handleDeleteRow,
    handleAddNewRow,
    clearData,
    handleSubmit,
  };
}
