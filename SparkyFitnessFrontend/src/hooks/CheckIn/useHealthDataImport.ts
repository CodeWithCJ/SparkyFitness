import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
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

// Rows are POSTed in chunks so a large historical import stays within the
// server's 5000-row cap and body-size limits.
const CHUNK_SIZE = 1000;
// Guard against reading a pathologically large file fully into memory (which
// can freeze the tab). 25MB of CSV is well beyond any realistic export.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function useHealthDataImport() {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = useMemo(() => getCategoryConfig(category), [category]);
  const headers = config.requiredHeaders;

  const clearData = () => {
    setCsvData([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setCategory = (next: ImportCategory) => {
    setCategoryState(next);
    setCsvData([]);
    setResult(null);
    setShowMapping(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
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
      const { meta } = Papa.parse(text, {
        header: true,
        preview: 1,
        skipEmptyLines: true,
      });
      const parsedFileHeaders = meta.fields || [];
      const headersValid = config.requiredHeaders.every((req) =>
        parsedFileHeaders.includes(req)
      );
      if (headersValid) {
        setCsvData(parseHealthCSV(text, category));
        setResult(null);
      } else {
        const initialMapping: Record<string, string> = {};
        config.requiredHeaders.forEach((required) => {
          const normalized = required.toLowerCase().replace(/[_ ]/g, '');
          const match = parsedFileHeaders.find(
            (h) => h.toLowerCase().replace(/[_ ]/g, '') === normalized
          );
          if (match) initialMapping[required] = match;
        });
        setFileHeaders(parsedFileHeaders);
        setHeaderMapping(initialMapping);
        setRawCsvText(text);
        setShowMapping(true);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmMapping = () => {
    setCsvData(parseHealthCSV(rawCsvText, category, headerMapping));
    setResult(null);
    setShowMapping(false);
  };

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
      csvData
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
