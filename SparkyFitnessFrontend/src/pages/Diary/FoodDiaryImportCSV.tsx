import { useMemo, useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, Download, Upload, Trash2, CalendarIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import {
  localDateToDay,
  isBlank,
  toNumber,
  parseCsv,
  parseCsvHeaders,
  suggestHeaderMapping,
  MAX_CSV_FILE_SIZE_BYTES,
  type DecimalFormat,
  type CsvFormatOptions,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { useCsvFormat } from '@/hooks/useCsvFormat';
import CsvFormatBar from '@/components/CsvImport/CsvFormatBar';
import CsvFormatPreview from '@/components/CsvImport/CsvFormatPreview';
import CsvImportResultPanel from '@/components/CsvImport/CsvImportResultPanel';
import CsvHeaderMappingDialog from '@/components/CsvImport/CsvHeaderMappingDialog';
import type {
  FoodDiaryImportRow,
  FoodDiaryImportScope,
  FoodDiaryImportResult,
} from '@/types/diary';

// Diary LOG import (creates food_entries, and auto-creates a food only when
// a row has no match) — distinct from the food-LIBRARY CSV import
// (FoodImportFromCSV.tsx / /foods/import-from-csv), which only writes
// master-data foods and is untouched by this feature.

interface FoodDiaryImportCSVProps {
  onSave: (
    entries: FoodDiaryImportRow[],
    scope: FoodDiaryImportScope,
    overrideNutrition: boolean
  ) => Promise<FoodDiaryImportResult>;
}

interface CSVRow {
  id: string;
  [key: string]: string;
}

const generateUniqueId = () =>
  `temp_${Math.random().toString(36).slice(2, 11)}`;

const unitOptions = [
  'g',
  'kg',
  'mg',
  'oz',
  'lb',
  'ml',
  'l',
  'cup',
  'tbsp',
  'tsp',
  'piece',
  'slice',
  'serving',
  'can',
  'bottle',
  'packet',
  'bag',
  'bowl',
  'plate',
  'handful',
  'scoop',
  'bar',
  'stick',
  'whole',
];

const FALLBACK_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'];

// Debounce for the reparse-on-format-change effect below — collapses rapid
// format-bar clicks into a single re-parse instead of one per click.
const REPARSE_DEBOUNCE_MS = 400;

const NUTRIENT_HEADERS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
];

// The fixed columns. Any EXTRA column in an uploaded file (or appended from the
// user's custom-nutrient definitions) is treated as a custom nutrient by name.
const BASE_HEADERS = [
  'date',
  'meal_type',
  'meal_name',
  'food_name',
  'brand',
  'quantity',
  'unit',
  ...NUTRIENT_HEADERS,
];
const BASE_HEADER_SET = new Set(BASE_HEADERS);

// The base columns that are free numbers rather than text/dropdown/calendar
// cells. These are sent to the server as strings (FoodDiaryImportRow types
// them that way) and parsed there with plain Number() — so a locale-comma
// value like "80,2" needs to be normalized to "80.2" here first, or the
// server-side Number() call will silently drop it the same way toNumber was
// introduced to prevent client-side (issue #1960).
const BASE_NUMERIC_HEADERS = ['quantity', ...NUTRIENT_HEADERS];

// Columns that are NOT free numbers: date is a calendar picker, meal_type/unit
// are dropdowns, and these three are free text. Everything else (quantity,
// standard nutrients, custom-nutrient columns) is numeric.
const TEXT_HEADERS = new Set(['meal_name', 'food_name', 'brand']);

// Keeps only digits and a single decimal point, so number cells reject 'e',
// '+', '-', and stray dots while still allowing decimals.
const sanitizeNumericInput = (value: string): string => {
  let cleaned = value.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  return cleaned;
};

// Header row only, via the shared parser (delimiter/quote-char driven by
// the user's format choice instead of Papa's silent auto-detect).
const getCsvHeaders = (
  text: string,
  options: CsvFormatOptions
): string[] | undefined => parseCsvHeaders(text, options).headers;

// parseCsv (shared, not a raw Papa.parse call): it handles quoted fields (a
// food or meal name containing a comma), RFC 4180 escaped quotes, and stray
// delimiters inside free-text columns, none of which line.split(',') gets
// right. `headers` may include columns (e.g. a custom nutrient) the file
// doesn't have — those come back as '' rather than being omitted.
//
// When `mapping` is given (after the header-mapping dialog is confirmed),
// each canonical BASE_HEADERS entry reads from its mapped file column
// instead of a column of the same name; custom-nutrient columns are never
// in `mapping` so they keep reading by their own name, same as before.
const parseCSV = (
  text: string,
  headers: string[],
  options: CsvFormatOptions,
  mapping?: Record<string, string>
): { rows: CSVRow[]; resolvedDecimal: DecimalFormat } => {
  const { rows: rawRows, resolvedDecimal } = parseCsv(text, options, {
    numericColumns: BASE_NUMERIC_HEADERS,
  });
  return {
    resolvedDecimal,
    rows: rawRows.map((rawRow) => {
      const row: CSVRow = { id: generateUniqueId() };
      headers.forEach((header) => {
        const fileColumn = mapping?.[header] ?? header;
        row[header] = (rawRow[fileColumn] ?? '').trim();
      });
      return row;
    }),
  };
};

const FoodDiaryImportCSV = ({ onSave }: FoodDiaryImportCSVProps) => {
  const { t } = useTranslation();
  const { formatDate, parseDateInUserTimezone } = usePreferences();
  const { data: mealTypes } = useMealTypes();
  const { data: customNutrients } = useCustomNutrients();
  const csvFormat = useCsvFormat();

  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvText, setCsvText] = useState('');
  // Independent of csvText (cleared on successful parse) so the format
  // bar's live preview reflects whatever was most recently loaded, from
  // either the file input or the paste textarea.
  const [loadedText, setLoadedText] = useState('');
  const [includeFamily, setIncludeFamily] = useState(false);
  const [includePublic, setIncludePublic] = useState(false);
  const [overrideNutrition, setOverrideNutrition] = useState(false);
  const [uploadedHeaders, setUploadedHeaders] = useState<string[] | null>(null);
  const [result, setResult] = useState<FoodDiaryImportResult | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>(
    {}
  );
  const [rawCsvText, setRawCsvText] = useState('');
  // Tracks whether csvData currently reflects the header-mapping path, so
  // the reparse-on-format-change effects below know whether to re-run
  // parseCSV against loadedText with no mapping, or against rawCsvText
  // with headerMapping.
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  // Decimal format resolved over the *whole* file by the last full parse.
  // The format bar's preview only sees the first 1000 rows, so a file whose
  // only disambiguating value sits past that would submit under the wrong
  // format if we reused the preview's answer here.
  const [resolvedDecimal, setResolvedDecimal] = useState<DecimalFormat>('us');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () =>
      loadedText
        ? csvFormat.parse(loadedText, { numericColumns: BASE_NUMERIC_HEADERS })
        : null,
    [loadedText, csvFormat]
  );

  const mealTypeOptions = useMemo(
    () =>
      mealTypes && mealTypes.length > 0
        ? mealTypes.map((m) => m.name)
        : FALLBACK_MEAL_TYPES,
    [mealTypes]
  );

  const lastEvaluatedKeyRef = useRef<string>('');

  // Base columns plus one column per user-defined custom nutrient (by name).
  const defaultHeaders = useMemo(
    () => [...BASE_HEADERS, ...(customNutrients?.map((cn) => cn.name) ?? [])],
    [customNutrients]
  );

  const activeHeaders = uploadedHeaders ?? defaultHeaders;
  const customCols = useMemo(
    () => activeHeaders.filter((h) => !BASE_HEADER_SET.has(h) && h !== 'id'),
    [activeHeaders]
  );

  // Overriding stored food nutrition only applies to the user's own foods, so
  // family/public matching is disabled while it is on.
  useEffect(() => {
    if (overrideNutrition) {
      setIncludeFamily(false);
      setIncludePublic(false);
    }
  }, [overrideNutrition]);

  const validateHeaders = (fileHeaders: string[] | undefined) =>
    !!fileHeaders && BASE_HEADERS.every((h) => fileHeaders.includes(h));

  // Decides whether `text` parses directly under the current format, or
  // needs the header-mapping dialog, and acts on that decision. Shared by
  // the initial load and the reparse-on-format-change effect below, so a
  // delimiter fix after Cancel re-evaluates from scratch instead of either
  // blindly parsing invalid columns or being stuck needing a fresh
  // re-upload.
  const evaluateAndParse = (
    text: string,
    {
      source,
      silent = false,
      // Callers that reset the format bar in the same tick must pass the
      // fresh options — `csvFormat.options` is still the outgoing file's.
      options = csvFormat.options,
    }: {
      source?: 'file' | 'text';
      silent?: boolean;
      options?: CsvFormatOptions;
    } = {}
  ) => {
    lastEvaluatedKeyRef.current = `${text}|${JSON.stringify(options)}`;
    const parsedFileHeaders = getCsvHeaders(text, options);
    if (!validateHeaders(parsedFileHeaders)) {
      setFileHeaders(parsedFileHeaders ?? []);
      setHeaderMapping(
        suggestHeaderMapping(BASE_HEADERS, parsedFileHeaders ?? [])
      );
      setRawCsvText(text);
      setShowMapping(true);
      if (!silent) {
        toast({
          title: t('diaryCsvImport.invalidFormatTitle', 'Invalid CSV Format'),
          description: t(
            'diaryCsvImport.headersMismatch',
            'The CSV is missing required columns. Please map the fields to continue.'
          ),
        });
      }
      if (source === 'file' && fileInputRef.current)
        fileInputRef.current.value = '';
      return;
    }
    setMappingConfirmed(false);
    setShowMapping(false);
    // Extra columns beyond the base set are kept as custom-nutrient columns.
    const headers = [
      ...BASE_HEADERS,
      ...parsedFileHeaders!.filter((h) => !BASE_HEADER_SET.has(h)),
    ];
    setUploadedHeaders(headers);
    const parsed = parseCSV(text, headers, options);
    setCsvData(parsed.rows);
    setResolvedDecimal(parsed.resolvedDecimal);
    setResult(null);
  };

  const handleConfirmMapping = () => {
    const mappedFileColumns = new Set(
      Object.values(headerMapping).filter(Boolean)
    );
    // File columns not used by the mapping are kept as custom nutrients,
    // reading by their own (file) name, same as the direct-parse path.
    const extraColumns = fileHeaders.filter((h) => !mappedFileColumns.has(h));
    const headers = [...BASE_HEADERS, ...extraColumns];
    const parsedData = parseCSV(
      rawCsvText,
      headers,
      csvFormat.options,
      headerMapping
    );
    setUploadedHeaders(headers);
    setCsvData(parsedData.rows);
    setResolvedDecimal(parsedData.resolvedDecimal);
    setResult(null);
    setShowMapping(false);
    setMappingConfirmed(true);
  };

  const handleCancelMapping = () => {
    setShowMapping(false);
    setFileHeaders([]);
    setHeaderMapping({});
    setRawCsvText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Re-evaluates the already-loaded file whenever the user changes the
  // format bar (delimiter/decimal/quote) after loading, including after
  // Cancelling out of the mapping dialog — a delimiter fix can flip a file
  // from "needs mapping" to "parses directly" or vice versa. Decimal alone
  // would already self-correct at submit time (buildEntries re-resolves it
  // from the live preview), but delimiter/quote directly control how
  // csvData's columns were split.
  //
  // Deliberately NOT keyed on showMapping/mappingConfirmed — see the
  // matching comment in useExerciseImport.ts for why.
  useEffect(() => {
    if (!loadedText || showMapping || mappingConfirmed) return;
    const currentKey = `${loadedText}|${JSON.stringify(csvFormat.options)}`;
    if (lastEvaluatedKeyRef.current === currentKey) return;
    const timer = setTimeout(() => {
      evaluateAndParse(loadedText, { silent: true });
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvFormat.options, loadedText]);

  // Same reparse-on-format-change behavior for files that went through the
  // header-mapping dialog — must use rawCsvText + headerMapping, not
  // loadedText with no mapping, or headers would no longer line up.
  useEffect(() => {
    if (!mappingConfirmed || showMapping) return;
    const timer = setTimeout(() => {
      const mappedFileColumns = new Set(
        Object.values(headerMapping).filter(Boolean)
      );
      const extraColumns = fileHeaders.filter((h) => !mappedFileColumns.has(h));
      const headers = [...BASE_HEADERS, ...extraColumns];
      setUploadedHeaders(headers);
      const parsed = parseCSV(
        rawCsvText,
        headers,
        csvFormat.options,
        headerMapping
      );
      setCsvData(parsed.rows);
      setResolvedDecimal(parsed.resolvedDecimal);
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    csvFormat.options,
    rawCsvText,
    headerMapping,
    fileHeaders,
    mappingConfirmed,
    showMapping,
  ]);

  const handleTextImport = () => {
    if (!csvText.trim()) {
      toast({
        title: t('diaryCsvImport.importErrorTitle', 'Import Error'),
        description: t(
          'diaryCsvImport.pasteFirst',
          'Please paste some CSV data first.'
        ),
        variant: 'destructive',
      });
      return;
    }
    const options = csvFormat.resetForNewInput();
    setLoadedText(csvText);
    evaluateAndParse(csvText, { source: 'text', options });
    setCsvText('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
      toast({
        title: t('diaryCsvImport.importErrorTitle', 'Import Error'),
        description: t(
          'diaryCsvImport.fileTooLarge',
          'The selected file is too large. Please upload a file smaller than 25MB.'
        ),
        variant: 'destructive',
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const options = csvFormat.resetForNewInput();
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text || text.trim() === '') {
        toast({
          title: t('diaryCsvImport.importErrorTitle', 'Import Error'),
          description: t(
            'diaryCsvImport.emptyFile',
            'The selected file is empty.'
          ),
          variant: 'destructive',
        });
        return;
      }
      setLoadedText(text);
      evaluateAndParse(text, { source: 'file', options });
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const sample: Record<string, string> = {
      date: localDateToDay(new Date()),
      meal_type: mealTypeOptions[0] ?? 'breakfast',
      meal_name: '',
      food_name: 'Oatmeal',
      brand: '',
      quantity: '200',
      unit: 'g',
      calories: '150',
      protein: '5',
      carbs: '27',
      fat: '3',
    };
    const headerString = defaultHeaders.join(',');
    const rowString = defaultHeaders.map((h) => sample[h] ?? '').join(',');
    const blob = new Blob([`${headerString}\n${rowString}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'food_diary_log_template.csv';
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
    const newRow: CSVRow = { id: generateUniqueId() };
    activeHeaders.forEach((h) => {
      newRow[h] = '';
    });
    newRow['unit'] = 'g';
    newRow['meal_type'] = mealTypeOptions[0] ?? 'breakfast';
    newRow['date'] = localDateToDay(new Date());
    setCsvData((prev) => [...prev, newRow]);
  };

  const clearData = () => {
    setCsvData([]);
    setResult(null);
    setUploadedHeaders(null);
    setLoadedText('');
    setMappingConfirmed(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const buildEntries = (format: DecimalFormat = 'us'): FoodDiaryImportRow[] =>
    csvData.map((row) => {
      const { id: _id, ...rest } = row;
      const entry: FoodDiaryImportRow = {
        ...(rest as unknown as FoodDiaryImportRow),
      };
      // Base numeric fields go to the server as strings and are parsed there
      // with plain Number(), so normalize a locale-comma cell like "80,2" to
      // "80.2" here — otherwise the server-side Number() call silently drops
      // it the same way toNumber exists to prevent client-side (#1960).
      for (const col of BASE_NUMERIC_HEADERS) {
        const raw = row[col];
        if (isBlank(raw)) continue;
        const num = toNumber(raw, format);
        if (num !== undefined) {
          (entry as Record<string, unknown>)[col] = String(num);
        }
      }
      const cn: Record<string, number> = {};
      for (const col of customCols) {
        const raw = row[col];
        if (!isBlank(raw)) {
          // toNumber (not Number/parseFloat) so a locale-comma decimal like
          // "80,2" parses to 80.2 instead of Number's NaN silently dropping
          // the whole custom-nutrient value (issue #1960).
          const num = toNumber(raw, format);
          if (num !== undefined) cn[col] = num;
        }
        delete (entry as Record<string, unknown>)[col];
      }
      if (Object.keys(cn).length > 0) entry.custom_nutrients = cn;
      return entry;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalidRow = csvData.find(
      (row) => !row['date']?.trim() || !row['meal_type']?.trim()
    );
    if (invalidRow) {
      toast({
        title: t('diaryCsvImport.validationErrorTitle', 'Validation Error'),
        description: t(
          'diaryCsvImport.dateMealTypeRequired',
          "Every row needs a 'date' and 'meal_type'."
        ),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const scope: FoodDiaryImportScope = {
        family: includeFamily,
        public: includePublic,
      };
      const res = await onSave(
        buildEntries(resolvedDecimal),
        scope,
        overrideNutrition
      );
      setResult(res);
      if (res.errors.length === 0) {
        clearData();
      }
      toast({
        title: t('diaryCsvImport.importComplete', 'Import complete'),
        description: t(
          'diaryCsvImport.importSummary',
          'Imported {{processed}} entries, {{errors}} failed.',
          { processed: res.processed.length, errors: res.errors.length }
        ),
        variant: res.errors.length > 0 ? 'destructive' : 'default',
      });
    } catch (error) {
      toast({
        title: t('diaryCsvImport.importErrorTitle', 'Import Error'),
        description:
          error instanceof Error
            ? error.message
            : t('diaryCsvImport.importFailed', 'Failed to import diary data.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderCell = (row: CSVRow, header: string) => {
    if (header === 'date') {
      const parsed = row[header]
        ? parseDateInUserTimezone(row[header])
        : undefined;
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full md:w-40 justify-start gap-2 font-normal"
            >
              <CalendarIcon className="h-4 w-4 shrink-0" />
              {parsed ? (
                <span className="truncate">{formatDate(parsed)}</span>
              ) : (
                <span className="text-muted-foreground">
                  {t('diaryCsvImport.pickDate', 'Pick a date')}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={parsed}
              onSelect={(date) =>
                date && handleEditCell(row.id, header, localDateToDay(date))
              }
              yearsRange={10}
            />
          </PopoverContent>
        </Popover>
      );
    }
    if (header === 'meal_type') {
      return (
        <Select
          value={row[header] || ''}
          onValueChange={(value) => handleEditCell(row.id, header, value)}
        >
          <SelectTrigger className="w-full md:w-36">
            <SelectValue placeholder={t('diaryCsvImport.mealType', 'Meal')} />
          </SelectTrigger>
          <SelectContent>
            {mealTypeOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (header === 'unit') {
      return (
        <Select
          value={row[header] || 'g'}
          onValueChange={(value) => handleEditCell(row.id, header, value)}
        >
          <SelectTrigger className="w-full md:w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((unit) => (
              <SelectItem key={unit} value={unit}>
                {unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    const isText = TEXT_HEADERS.has(header);
    return (
      <Input
        type="text"
        inputMode={isText ? undefined : 'decimal'}
        value={row[header] ?? ''}
        onChange={(e) =>
          handleEditCell(
            row.id,
            header,
            isText ? e.target.value : sanitizeNumericInput(e.target.value)
          )
        }
        required={header === 'food_name' ? false : undefined}
        className="w-full md:w-32"
      />
    );
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0">
        <CardTitle>
          {t('diaryCsvImport.title', 'Import Diary Log (CSV)')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAddNewRow}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {t('diaryCsvImport.addRow', 'Add Row')}
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Upload size={16} />{' '}
                {t('diaryCsvImport.uploadCsv', 'Upload CSV')}
              </Button>
              <Button
                type="button"
                onClick={handleDownloadTemplate}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Download size={16} />{' '}
                {t('diaryCsvImport.downloadTemplate', 'Download Template')}
              </Button>
              {csvData.length > 0 && (
                <Button
                  type="button"
                  onClick={clearData}
                  variant="destructive"
                  className="flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />{' '}
                  {t('diaryCsvImport.clearData', 'Clear Data')}
                </Button>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Textarea
                placeholder={t(
                  'diaryCsvImport.pastePlaceholder',
                  'Or paste CSV content here...'
                )}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[80px]"
              />
              <Button
                type="button"
                onClick={handleTextImport}
                variant="secondary"
                className="whitespace-nowrap h-[40px]"
              >
                {t('diaryCsvImport.parseText', 'Parse Text')}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <CsvFormatBar
              capabilities={{
                delimiter: true,
                decimal: true,
                quote: true,
                date: false,
              }}
              value={csvFormat.options}
              onChange={csvFormat.setOptions}
              detection={
                preview
                  ? {
                      delimiter: preview.detectedDelimiter,
                      delimiterFailed: preview.delimiterDetectionFailed,
                      decimal: preview.decimal,
                    }
                  : undefined
              }
            />
            {preview && (
              <CsvFormatPreview
                headers={preview.headers}
                rows={preview.rows}
                options={csvFormat.options}
                decimalDetection={preview.decimal}
                numericColumns={BASE_NUMERIC_HEADERS}
                totalRowCount={preview.rows.length}
                totalRowCountIsPartial={preview.previewTruncated}
              />
            )}
            <CsvHeaderMappingDialog
              open={showMapping}
              onOpenChange={setShowMapping}
              requiredHeaders={BASE_HEADERS}
              fileHeaders={fileHeaders}
              headerMapping={headerMapping}
              onHeaderMappingChange={setHeaderMapping}
              onConfirm={handleConfirmMapping}
              onCancel={handleCancelMapping}
            />
            {csvData.length > 0 && (
              <div className="text-sm text-green-600">
                {t('diaryCsvImport.recordsLoaded', {
                  count: csvData.length,
                  defaultValue: `Loaded ${csvData.length} rows.`,
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">
              {t('diaryCsvImport.matchScope', 'Match food names against')}
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Checkbox id="scope-mine" checked disabled />
                <Label htmlFor="scope-mine" className="cursor-not-allowed">
                  {t('diaryCsvImport.scopeMine', 'My Items')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="scope-family"
                  checked={includeFamily}
                  disabled={overrideNutrition}
                  onCheckedChange={(checked) =>
                    setIncludeFamily(checked === true)
                  }
                />
                <Label
                  htmlFor="scope-family"
                  className={
                    overrideNutrition
                      ? 'cursor-not-allowed text-muted-foreground'
                      : 'cursor-pointer'
                  }
                >
                  {t('diaryCsvImport.scopeFamily', 'Family')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="scope-public"
                  checked={includePublic}
                  disabled={overrideNutrition}
                  onCheckedChange={(checked) =>
                    setIncludePublic(checked === true)
                  }
                />
                <Label
                  htmlFor="scope-public"
                  className={
                    overrideNutrition
                      ? 'cursor-not-allowed text-muted-foreground'
                      : 'cursor-pointer'
                  }
                >
                  {t('diaryCsvImport.scopePublic', 'Public')}
                </Label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'diaryCsvImport.matchScopeDescription',
                "A food_name match outside the ticked scopes is ignored, and a new food is created for you instead (using the row's nutrient columns)."
              )}
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox
              id="override-nutrition"
              checked={overrideNutrition}
              onCheckedChange={(checked) =>
                setOverrideNutrition(checked === true)
              }
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="override-nutrition" className="cursor-pointer">
                {t(
                  'diaryCsvImport.overrideLabel',
                  'Override existing food nutrition with imported values'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'diaryCsvImport.overrideDescription',
                  "When a row matches one of your own foods, rewrite that food variant's stored nutrition with the imported values. Only applies to My Items — Family and Public matching are disabled."
                )}
              </p>
            </div>
          </div>

          {csvData.length > 0 && (
            <div className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="hidden md:table-header-group">
                    <tr>
                      {activeHeaders.map((header) => (
                        <th
                          key={header}
                          className="px-4 py-2 text-left bg-background font-medium whitespace-nowrap capitalize"
                        >
                          {header.replace(/_/g, ' ')}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-left bg-background font-medium whitespace-nowrap">
                        {t('diaryCsvImport.actions', 'Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.map((row) => (
                      <tr
                        key={row.id}
                        className="block md:table-row mb-4 md:mb-0 border rounded-lg overflow-hidden md:border-0 md:rounded-none md:border-t hover:bg-muted/50"
                      >
                        {activeHeaders.map((header) => (
                          <td
                            key={header}
                            className="block md:table-cell px-4 py-3 md:py-2 md:whitespace-nowrap border-b md:border-0 last:border-b-0"
                          >
                            <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                              {header.replace(/_/g, ' ')}
                            </span>
                            {renderCell(row, header)}
                          </td>
                        ))}
                        <td className="block md:table-cell px-4 py-3 md:py-2">
                          <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                            {t('diaryCsvImport.actions', 'Actions')}
                          </span>
                          <Button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            variant="destructive"
                            size="sm"
                            className="w-full md:w-auto"
                          >
                            <Trash2 size={14} className="md:mr-0" />
                            <span className="ml-2 md:hidden">
                              {t('diaryCsvImport.deleteRow', 'Delete Row')}
                            </span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <CsvImportResultPanel result={result} />

          <Button
            type="submit"
            disabled={loading || csvData.length === 0}
            className="w-52 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {t('diaryCsvImport.importing', 'Importing...')}
              </>
            ) : (
              <>
                <Upload size={16} />{' '}
                {t('diaryCsvImport.importData', 'Import Data')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default FoodDiaryImportCSV;
