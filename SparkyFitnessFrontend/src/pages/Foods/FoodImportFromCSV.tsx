import { useEffect, useMemo, useState, useRef } from 'react';
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
import {
  Plus,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  Info,
  Filter,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { FoodDataForBackend } from '@/types/food';
import {
  toNumber,
  parseCsv,
  parseCsvHeaders,
  suggestHeaderMapping,
  MAX_CSV_FILE_SIZE_BYTES,
  DEFAULT_CSV_FORMAT,
  type CsvFormatOptions,
} from '@workspace/shared';
import { useCsvFormat } from '@/hooks/useCsvFormat';
import CsvFormatBar from '@/components/CsvImport/CsvFormatBar';
import CsvFormatPreview from '@/components/CsvImport/CsvFormatPreview';
import CsvHeaderMappingDialog from '@/components/CsvImport/CsvHeaderMappingDialog';

interface ImportFromCSVProps {
  onSave: (foodData: FoodDataForBackend[], overwrite: boolean) => Promise<void>;
}

export interface CSVData {
  id: string;
  name: string;
  brand: string;
  is_custom: boolean;
  shared_with_public: boolean;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  is_default: boolean;
  [key: string]: string | number | boolean;
}

const generateUniqueId = () =>
  `temp_${Math.random().toString(36).slice(2, 11)}`;

// Debounce for the reparse-on-format-change effect below — collapses rapid
// format-bar clicks into a single re-parse instead of one per click.
const REPARSE_DEBOUNCE_MS = 400;

const DEFAULT_SERVING_SIZE = 100;

const servingUnitOptions = [
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

const ImportFromCSV = ({ onSave }: ImportFromCSVProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  // Food records have no date column, so this importer's format bar never
  // renders a date control (capabilities.date is false below).
  const csvFormat = useCsvFormat();

  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<CSVData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [csvText, setCsvText] = useState<string>('');
  // Independent of csvText (which is cleared on successful parse) so the
  // format bar's live preview reflects whatever was most recently loaded,
  // from either the file input or the paste textarea.
  const [loadedText, setLoadedText] = useState<string>('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>(
    {}
  );
  const [rawCsvText, setRawCsvText] = useState('');
  // Tracks whether csvData currently reflects the header-mapping path, so
  // the reparse-on-format-change effect knows whether to re-run parseCSV
  // against loadedText with no mapping, or against rawCsvText with
  // headerMapping.
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [filterMissingDefault, setFilterMissingDefault] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textFields = new Set(['name', 'brand']);
  const booleanFields = new Set([
    'shared_with_public',
    'is_default',
    'is_custom',
  ]);

  const requiredHeaders = [
    'name',
    'brand',
    'is_custom',
    'shared_with_public',
    'serving_size',
    'serving_unit',
    'calories', // Assumed to be in kcal
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
    'is_default',
  ];

  // Numeric columns feed decimal-format auto-detection; everything except
  // the text/boolean/unit columns above.
  const numericColumns = requiredHeaders.filter(
    (h) => !textFields.has(h) && !booleanFields.has(h) && h !== 'serving_unit'
  );

  // parseCsv (shared, not a raw Papa.parse call) so delimiter/quote-char are
  // driven by the user's format choice instead of Papa's silent auto-detect.
  // When `mapping` is given, rows are built from requiredHeaders (using the
  // mapped file column for each) instead of the file's own column names —
  // used after the header-mapping dialog is confirmed.
  const parseCSV = (
    text: string,
    options: CsvFormatOptions = DEFAULT_CSV_FORMAT,
    mapping?: Record<string, string>
  ): CSVData[] => {
    const { rows, resolvedDecimal: format } = parseCsv(text, options, {
      numericColumns,
    });

    const buildValue = (
      header: string,
      raw: string
    ): string | number | boolean => {
      const value = raw.trim();
      if (booleanFields.has(header)) {
        return value.toLowerCase() === 'true';
      }
      if (!textFields.has(header) && header !== 'serving_unit') {
        // toNumber (not parseFloat) so a locale-comma decimal like "80,2"
        // parses to 80.2 instead of silently truncating to 80 at the
        // comma. Visible per-row error reporting for cells that fail to
        // parse at all is a separate, larger change (#1960 follow-up).
        const parsed = toNumber(value, format);
        // serving_size is the divisor in the consumed-nutrition formula
        // ((value * quantity) / serving_size), so 0 would make every entry
        // built from this food Infinity/NaN. Nothing downstream stops it —
        // FoodVariants.zod.ts types it as a plain z.number() with no
        // .positive() — so an unparseable or non-positive cell has to land
        // on the same 100 default a manually added row starts with.
        if (header === 'serving_size') {
          return parsed !== undefined && parsed > 0
            ? parsed
            : DEFAULT_SERVING_SIZE;
        }
        // Nutrients are safe at 0 (they're multiplied, never divided by).
        return parsed !== undefined ? parsed : 0;
      }
      return value;
    };

    return rows.map((rawRow) => {
      const row: CSVData = { id: generateUniqueId() } as CSVData;
      if (mapping) {
        requiredHeaders.forEach((header) => {
          const fileColumn = mapping[header];
          row[header] = buildValue(
            header,
            fileColumn ? (rawRow[fileColumn] ?? '') : ''
          );
        });
      } else {
        Object.keys(rawRow).forEach((header) => {
          row[header] = buildValue(header, rawRow[header] ?? '');
        });
      }
      return row;
    });
  };

  // Header row only, via the same options as parseCSV so a quoted or
  // delimiter-containing header name is read the same way in both places.
  const getCsvHeaders = (
    text: string,
    options: CsvFormatOptions = csvFormat.options
  ): string[] => parseCsvHeaders(text, options).headers;

  // Decides whether `text` parses directly under the current format, or
  // needs the header-mapping dialog, and acts on that decision. Shared by
  // the initial load and the reparse-on-format-change effect below, so a
  // delimiter fix after Cancel re-evaluates from scratch instead of either
  // blindly parsing invalid columns or being stuck needing a fresh
  // re-upload. Subset match (all required headers present, in any order),
  // unlike the strict exact-order check this replaced — a file with extra
  // or reordered columns no longer hard-fails with no recovery.
  const evaluateAndParse = (
    text: string,
    {
      silent = false,
      // Callers that reset the format bar in the same tick must pass the
      // fresh options — `csvFormat.options` is still the outgoing file's.
      options = csvFormat.options,
    }: { silent?: boolean; options?: CsvFormatOptions } = {}
  ) => {
    const fileHeaders = getCsvHeaders(text, options);
    const areHeadersValid = requiredHeaders.every((h) =>
      fileHeaders.includes(h)
    );
    if (areHeadersValid) {
      setMappingConfirmed(false);
      setShowMapping(false);
      const parsedData = parseCSV(text, options);
      const parsedHeaders = parsedData[0];
      if (parsedData.length > 0 && parsedHeaders) {
        setHeaders(Object.keys(parsedHeaders).filter((key) => key !== 'id'));
        setCsvData(parsedData);
      } else if (!silent) {
        toast({
          title: t('foodCsvImport.noDataTitle', 'No Data Found'),
          description: t(
            'foodCsvImport.noDataText',
            'The CSV file contains headers but no data rows.'
          ),
          variant: 'destructive',
        });
      }
    } else {
      setFileHeaders(fileHeaders);
      setHeaderMapping(suggestHeaderMapping(requiredHeaders, fileHeaders));
      setRawCsvText(text);
      setShowMapping(true);
      if (!silent) {
        toast({
          title: t('foodCsvImport.invalidFormatTitle', 'Invalid CSV Format'),
          description: t(
            'foodCsvImport.headersMismatchFile',
            'The CSV headers do not match the required format. Please map the fields to continue.'
          ),
        });
      }
    }
  };

  const handleTextImport = () => {
    if (!csvText || csvText.trim() === '') {
      toast({
        title: t('foodCsvImport.importErrorTitle', 'Import Error'),
        description: t(
          'foodCsvImport.pasteFirst',
          'Please paste some CSV data first.'
        ),
        variant: 'destructive',
      });
      return;
    }

    const options = csvFormat.resetForNewInput();
    setLoadedText(csvText);
    evaluateAndParse(csvText, { options });
    setCsvText('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
      toast({
        title: t('foodCsvImport.importErrorTitle', 'Import Error'),
        description: t(
          'foodCsvImport.fileTooLarge',
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
          title: t('foodCsvImport.importErrorTitle', 'Import Error'),
          description: t(
            'foodCsvImport.emptyFile',
            'The selected file is empty.'
          ),
          variant: 'destructive',
        });
        return;
      }
      setLoadedText(text);
      evaluateAndParse(text, { options });
    };
    reader.readAsText(file);
  };

  const handleConfirmMapping = () => {
    const parsedData = parseCSV(rawCsvText, csvFormat.options, headerMapping);
    const parsedHeaders = parsedData[0];
    if (parsedData.length > 0 && parsedHeaders) {
      setHeaders(Object.keys(parsedHeaders).filter((key) => key !== 'id'));
      setCsvData(parsedData);
      setShowMapping(false);
      setMappingConfirmed(true);
    } else {
      toast({
        title: t('foodCsvImport.noDataTitle', 'No Data Found'),
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

  // Re-evaluates the already-loaded file whenever the user changes the
  // format bar after loading, including after Cancelling out of the
  // mapping dialog — a delimiter fix can flip a file from "needs mapping"
  // to "parses directly" or vice versa. Unlike Health/Food Diary, this
  // importer's numeric coercion happens once at parse time (csvData holds
  // real numbers, not raw strings), so without this a corrected decimal
  // pick would only change the live preview.
  //
  // Deliberately NOT keyed on showMapping/mappingConfirmed — see the
  // matching comment in useExerciseImport.ts for why.
  useEffect(() => {
    // Not gated on headers.length: after cancelling out of the mapping
    // dialog there are no headers yet, and a delimiter fix in the format bar
    // is exactly what needs to re-evaluate the file.
    if (!loadedText || showMapping || mappingConfirmed) return;
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
      const parsedData = parseCSV(rawCsvText, csvFormat.options, headerMapping);
      const parsedHeaders = parsedData[0];
      if (parsedData.length > 0 && parsedHeaders) {
        setHeaders(Object.keys(parsedHeaders).filter((key) => key !== 'id'));
        setCsvData(parsedData);
      }
    }, REPARSE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    csvFormat.options,
    rawCsvText,
    headerMapping,
    mappingConfirmed,
    showMapping,
  ]);

  const handleDownloadSample = () => {
    const sampleData = [
      {
        name: 'Sparky Sample Food',
        brand: 'Sparky Sample Brand',
        is_custom: 'TRUE',
        shared_with_public: '',
        serving_size: 231,
        serving_unit: 'slice',
        calories: 431, // kcal
        protein: 379,
        carbs: 204,
        fat: 610,
        saturated_fat: 554,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 436,
        cholesterol: 81,
        sodium: 317,
        potassium: 64,
        dietary_fiber: 618,
        sugars: 595,
        vitamin_a: 563,
        vitamin_c: 635,
        calcium: 360,
        iron: 366,
        is_default: 'TRUE',
      },
    ];

    const headerString = requiredHeaders.join(',');
    const rowsString = sampleData
      .map((row) =>
        requiredHeaders
          .map((header) => row[header as keyof typeof row])
          .join(',')
      )
      .join('\n');
    const csvContent = `${headerString}\n${rowsString}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'food_template.csv');
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
    setCsvData((prevData) =>
      prevData.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleDeleteRow = (id: string) => {
    setCsvData((prevData) => prevData.filter((row) => row.id !== id));
  };

  const handleAddNewRow = () => {
    const newRow: CSVData = {
      id: generateUniqueId(),
      name: '',
      brand: '',
      is_custom: true,
      shared_with_public: false,
      serving_size: DEFAULT_SERVING_SIZE,
      serving_unit: 'g',
      calories: 0, // kcal
      protein: 0,
      carbs: 0,
      fat: 0,
      saturated_fat: 0,
      polyunsaturated_fat: 0,
      monounsaturated_fat: 0,
      trans_fat: 0,
      cholesterol: 0,
      sodium: 0,
      potassium: 0,
      dietary_fiber: 0,
      sugars: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      calcium: 0,
      iron: 0,
      is_default: csvData.length === 0,
    };
    if (headers.length === 0) {
      setHeaders(requiredHeaders);
    }
    setCsvData((prev) => [...prev, newRow]);
  };

  const clearData = () => {
    setCsvData([]);
    setHeaders([]);
    setLoadedText('');
    setMappingConfirmed(false);
    setFilterMissingDefault(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const preview = useMemo(
    () => (loadedText ? csvFormat.parse(loadedText, { numericColumns }) : null),
    // numericColumns is a fresh array each render; only its contents matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedText, csvFormat]
  );

  const getFoodKey = (row: CSVData) =>
    `${(row.name || '').trim().toLowerCase()}::${(row.brand || '').trim().toLowerCase()}`;

  const invalidFoodKeys = useMemo(() => {
    const defaultMap = new Map<string, boolean>();
    csvData.forEach((row) => {
      const key = getFoodKey(row);
      if (row.is_default === true) {
        defaultMap.set(key, true);
      } else if (!defaultMap.has(key)) {
        defaultMap.set(key, false);
      }
    });
    const invalid = new Set<string>();
    defaultMap.forEach((hasDefault, key) => {
      if (!hasDefault) invalid.add(key);
    });
    return invalid;
  }, [csvData]);

  const foodsWithoutDefaultCount = invalidFoodKeys.size;

  const displayedCsvData = useMemo(() => {
    if (!filterMissingDefault || foodsWithoutDefaultCount === 0) return csvData;
    return csvData.filter((row) => invalidFoodKeys.has(getFoodKey(row)));
  }, [
    csvData,
    filterMissingDefault,
    invalidFoodKeys,
    foodsWithoutDefaultCount,
  ]);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    const invalidRow = csvData.find(
      (row) => !row.name || String(row.name).trim() === ''
    );
    if (invalidRow) {
      toast({
        title: t('foodCsvImport.validationErrorTitle', 'Validation Error'),
        description: t(
          'foodCsvImport.nameRequired',
          "The 'name' field cannot be empty."
        ),
        variant: 'destructive',
      });
      return;
    }
    if (foodsWithoutDefaultCount > 0) {
      toast({
        title: t('foodCsvImport.validationErrorTitle', 'Validation Error'),
        description: t(
          'foodCsvImport.missingDefaultValidationError',
          'At least one variant per food must be set as the default unit.'
        ),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    // CSV import never creates quick foods; that is a separate workflow.
    const dataForBackend = csvData.map(({ id, ...rest }) => ({
      ...rest,
      is_quick_food: false,
    }));
    // console.log(dataForBackend);
    try {
      await onSave(dataForBackend, overwriteExisting);
    } catch (error) {
      console.error(
        'An error occurred while the parent was handling the save operation:',
        error
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('foodCsvImport.title', 'Import Food Data')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground bg-blue-50/60 dark:bg-blue-950/40 p-3 rounded-md border border-blue-200 dark:border-blue-800">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <span>
                {t(
                  'foodCsvImport.upfrontNote',
                  'Note: Each food must have at least one variant set as the default unit (Is Default = True).'
                )}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAddNewRow}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {t('foodCsvImport.addRow', 'Add Row')}
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Upload size={16} />{' '}
                {t('foodCsvImport.uploadCsv', 'Upload CSV')}
              </Button>
              <Button
                type="button"
                onClick={handleDownloadSample}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Download size={16} />{' '}
                {t('foodCsvImport.downloadTemplate', 'Download Template')}
              </Button>
              {csvData.length > 0 && (
                <Button
                  type="button"
                  onClick={clearData}
                  variant="destructive"
                  className="flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />{' '}
                  {t('foodCsvImport.clearData', 'Clear Data')}
                </Button>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Textarea
                placeholder={t(
                  'foodCsvImport.pastePlaceholder',
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
                {t('foodCsvImport.parseText', 'Parse Text')}
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
                numericColumns={numericColumns}
                totalRowCount={preview.rows.length}
                totalRowCountIsPartial={preview.previewTruncated}
              />
            )}
            <CsvHeaderMappingDialog
              open={showMapping}
              onOpenChange={setShowMapping}
              requiredHeaders={requiredHeaders}
              fileHeaders={fileHeaders}
              headerMapping={headerMapping}
              onHeaderMappingChange={setHeaderMapping}
              onConfirm={handleConfirmMapping}
              onCancel={handleCancelMapping}
            />
            {csvData.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-green-600 font-medium">
                  {t('foodCsvImport.recordsLoaded', {
                    count: csvData.length,
                    defaultValue: `Successfully loaded ${csvData.length} records.`,
                  })}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-md border">
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                  <span>
                    {t(
                      'foodCsvImport.defaultVariantNote',
                      'At least one variant per food must be set as the default unit (Is Default = True).'
                    )}
                  </span>
                </div>
                {foodsWithoutDefaultCount > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs sm:text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 p-3 rounded-md border border-amber-300 dark:border-amber-700">
                    <Button
                      type="button"
                      variant={filterMissingDefault ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setFilterMissingDefault(!filterMissingDefault)
                      }
                      className="shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Filter size={14} />
                      {filterMissingDefault
                        ? t('foodCsvImport.showAllRows', {
                            count: csvData.length,
                            defaultValue: `Show All Rows (${csvData.length})`,
                          })
                        : t('foodCsvImport.filterMissingDefault', {
                            count: foodsWithoutDefaultCount,
                            defaultValue: `Show Missing Default (${foodsWithoutDefaultCount})`,
                          })}
                    </Button>
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        {t('foodCsvImport.missingDefaultWarning', {
                          count: foodsWithoutDefaultCount,
                          defaultValue: `Warning: ${foodsWithoutDefaultCount} food(s) do not have a default variant set. Please set at least one variant as default (highlighted in yellow below).`,
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {csvData.length > 0 && (
            <div className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="hidden md:table-header-group">
                    <tr>
                      {headers.map((header) => (
                        <th
                          key={header}
                          className="px-4 py-2 text-left bg-background font-medium whitespace-nowrap capitalize"
                        >
                          {header.replace(/_/g, ' ')}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-left bg-background font-medium whitespace-nowrap">
                        {t('foodCsvImport.actions', 'Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedCsvData.map((row) => {
                      const isRowMissingDefault = invalidFoodKeys.has(
                        getFoodKey(row)
                      );
                      return (
                        <tr
                          key={row.id}
                          className={`block md:table-row mb-4 md:mb-0 border rounded-lg overflow-hidden md:border-0 md:rounded-none md:border-t transition-colors ${
                            isRowMissingDefault
                              ? 'bg-amber-100/80 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          {headers.map((header) => (
                            <td
                              key={header}
                              className="block md:table-cell px-4 py-3 md:py-2 md:whitespace-nowrap border-b md:border-0 last:border-b-0"
                            >
                              <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                                {header.replace(/_/g, ' ')}
                              </span>

                              {header === 'serving_unit' ? (
                                <Select
                                  value={String(row[header]) || 'g'}
                                  onValueChange={(value) =>
                                    handleEditCell(row.id, header, value)
                                  }
                                >
                                  <SelectTrigger className="w-full md:w-[100px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {servingUnitOptions.map((unit) => (
                                      <SelectItem key={unit} value={unit}>
                                        {unit}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : booleanFields.has(header) ? (
                                <Select
                                  value={String(row[header])}
                                  onValueChange={(value) =>
                                    handleEditCell(
                                      row.id,
                                      header,
                                      value === 'true'
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    className={`w-full md:w-[100px] ${
                                      header === 'is_default' &&
                                      isRowMissingDefault &&
                                      !row[header]
                                        ? 'border-amber-500 ring-1 ring-amber-500'
                                        : ''
                                    }`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">
                                      {t('foodCsvImport.booleanTrue', 'True')}
                                    </SelectItem>
                                    <SelectItem value="false">
                                      {t('foodCsvImport.booleanFalse', 'False')}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : textFields.has(header) ? (
                                <Input
                                  type="text"
                                  value={(row[header] as string) || ''}
                                  onChange={(e) =>
                                    handleEditCell(
                                      row.id,
                                      header,
                                      e.target.value
                                    )
                                  }
                                  required={header === 'name'}
                                  className="w-full md:w-40"
                                />
                              ) : (
                                // Generic number input
                                <Input
                                  type="number"
                                  value={
                                    header === 'calories' &&
                                    row[header] !== undefined
                                      ? Math.round(
                                          convertEnergy(
                                            row[header] as number,
                                            'kcal',
                                            energyUnit
                                          )
                                        )
                                      : (row[header] as number) || 0
                                  }
                                  onChange={(e) =>
                                    handleEditCell(
                                      row.id,
                                      header,
                                      header === 'calories' &&
                                        e.target.valueAsNumber
                                        ? convertEnergy(
                                            e.target.valueAsNumber,
                                            energyUnit,
                                            'kcal'
                                          )
                                        : e.target.valueAsNumber || 0
                                    )
                                  }
                                  min="0"
                                  step="any"
                                  className="w-full md:w-20"
                                />
                              )}
                            </td>
                          ))}
                          <td className="block md:table-cell px-4 py-3 md:py-2">
                            <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                              {t('foodCsvImport.actions', 'Actions')}
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
                                {t('foodCsvImport.deleteRow', 'Delete Row')}
                              </span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox
              id="overwrite-existing"
              checked={overwriteExisting}
              onCheckedChange={(checked) =>
                setOverwriteExisting(checked === true)
              }
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="overwrite-existing" className="cursor-pointer">
                {t(
                  'foodCsvImport.overrideLabel',
                  'Override existing food details'
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'foodCsvImport.overrideDescription',
                  'If a food with the same name and brand already exists, update its nutrition instead of failing the import. Leave unchecked to skip and error on duplicates.'
                )}
              </p>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || csvData.length === 0}
            className="w-52 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {t('foodCsvImport.importing', 'Importing...')}
              </>
            ) : csvData.length > 0 ? (
              <>
                <Upload size={16} />{' '}
                {t('foodCsvImport.importRecords', {
                  count: csvData.length,
                  defaultValue_one: `Import ${csvData.length} Record`,
                  defaultValue_other: `Import ${csvData.length} Records`,
                })}
              </>
            ) : (
              <>
                <Upload size={16} />{' '}
                {t('foodCsvImport.importData', 'Import Data')}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ImportFromCSV;
