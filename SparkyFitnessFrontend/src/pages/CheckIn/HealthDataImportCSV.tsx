import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Slider } from '@/components/ui/slider';
import {
  Plus,
  Download,
  Upload,
  Trash2,
  Copy,
  CalendarIcon,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { localDateToDay } from '@workspace/shared';
import { HEALTH_IMPORT_CATEGORIES } from '@/constants/healthDataImport';
import { useHealthDataImport } from '@/hooks/CheckIn/useHealthDataImport';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getMoodDisplay } from '@/utils/moodUtils';
import AliasChipInput from '@/components/Foods/AliasChipInput';
import { useCsvFormat } from '@/hooks/useCsvFormat';
import CsvFormatBar from '@/components/CsvImport/CsvFormatBar';
import CsvFormatPreview from '@/components/CsvImport/CsvFormatPreview';
import CsvImportResultPanel from '@/components/CsvImport/CsvImportResultPanel';
import CsvHeaderMappingDialog from '@/components/CsvImport/CsvHeaderMappingDialog';
import { NUMERIC_COLUMNS_BY_CATEGORY } from '@/utils/healthDataImport';

// Calendar date-picker cell, matching the compact popover pattern used by
// DayNavigator, so the date column respects the user's date-format
// preference across every import category instead of free-typed text.
const DateCell = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const { formatDate, parseDateInUserTimezone } = usePreferences();
  const parsed = value ? parseDateInUserTimezone(value) : undefined;
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
            <span className="text-muted-foreground">Pick a date</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parsed}
          onSelect={(date) => date && onChange(localDateToDay(date))}
          yearsRange={10}
        />
      </PopoverContent>
    </Popover>
  );
};

// mood_value is a 10-100 intensity scale (see MoodMeter.tsx); a slider with
// its live emoji/label is far less error-prone than typing a raw number.
const MoodValueCell = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const parsed = parseInt(value, 10);
  const clamped = Number.isNaN(parsed)
    ? 50
    : Math.min(100, Math.max(10, parsed));
  const { emoji, label } = getMoodDisplay(clamped);
  return (
    <div className="flex items-center gap-2 w-full md:w-56">
      <Slider
        value={[clamped]}
        min={10}
        max={100}
        step={10}
        onValueChange={(vals) => onChange(String(vals[0] ?? 50))}
        className="flex-1"
      />
      <span className="text-xs whitespace-nowrap">
        {emoji} {label}
      </span>
    </div>
  );
};

// Reuses the same chip/tag input as the custom-nutrient provider alias
// field: type a tag, press Enter to add it as a removable chip. Stored in
// the row as a single '|'-joined string, matching the CSV cell format.
const MoodTagsCell = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => {
  const tags = value
    ? value
        .split('|')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  return (
    <AliasChipInput
      value={tags}
      onChange={(next) => onChange(next.join('|'))}
      placeholder="Add mood tag"
    />
  );
};

const HealthDataImportCSV = () => {
  const { t } = useTranslation();
  const csvFormat = useCsvFormat();
  const {
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
  } = useHealthDataImport(csvFormat.options);

  const numericColumns = NUMERIC_COLUMNS_BY_CATEGORY[category];
  const preview = useMemo(
    () => (loadedText ? csvFormat.parse(loadedText, { numericColumns }) : null),
    [loadedText, csvFormat, numericColumns]
  );

  const handleFileUploadWithReset: typeof handleFileUpload = (event) => {
    csvFormat.resetForNewInput();
    handleFileUpload(event);
  };

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({
      title: t('healthDataImport.copied', 'Copied!'),
      description: t('healthDataImport.copiedValue', "'{{value}}' copied.", {
        value,
      }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('healthDataImport.title', 'Import Health Data')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 space-y-2">
          <label className="text-sm font-medium">
            {t('healthDataImport.category', 'Data category')}
          </label>
          <Select
            value={category}
            onValueChange={(val) => setCategory(val as typeof category)}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEALTH_IMPORT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>

        {config.guides && config.guides.length > 0 && (
          <div className="mb-6 p-4 border rounded-lg bg-muted/50">
            {config.guides.map((guide) => (
              <div key={guide.title}>
                <h4 className="font-medium mb-2">{guide.title}</h4>
                <div className="flex flex-wrap gap-2">
                  {guide.options.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 flex items-center gap-1"
                      onClick={() => copyToClipboard(opt)}
                    >
                      {opt} <Copy className="h-3 w-3" />
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleAddNewRow}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus size={16} /> {t('healthDataImport.addRow', 'Add Row')}
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Upload size={16} />{' '}
              {t('healthDataImport.uploadCSV', 'Upload CSV')}
            </Button>
            <Button
              type="button"
              onClick={handleDownloadTemplate}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download size={16} />{' '}
              {t('healthDataImport.downloadTemplate', 'Download Template')}
            </Button>
            {csvData.length > 0 && (
              <Button
                type="button"
                onClick={clearData}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Trash2 size={16} /> {t('healthDataImport.clearData', 'Clear')}
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUploadWithReset}
            className="hidden"
          />
          <CsvFormatBar
            capabilities={{
              delimiter: true,
              decimal: true,
              quote: true,
              // No date control: mapRowsToHealthItems passes the `date` cell
              // through verbatim, so a non-ISO date would preview correctly
              // under the chosen format and then fail at conversion.
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
          {csvData.length > 0 && (
            <div className="text-sm text-green-600">
              {t('healthDataImport.loadedRecords', 'Loaded {{count}} rows.', {
                count: csvData.length,
              })}
            </div>
          )}

          <CsvHeaderMappingDialog
            open={showMapping}
            onOpenChange={setShowMapping}
            requiredHeaders={config.requiredHeaders}
            fileHeaders={fileHeaders}
            headerMapping={headerMapping}
            onHeaderMappingChange={setHeaderMapping}
            onConfirm={handleConfirmMapping}
            onCancel={handleCancelMapping}
          />

          {csvData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="hidden md:table-header-group">
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-medium capitalize"
                      >
                        {h.replace(/_/g, ' ')}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((row) => (
                    <tr
                      key={row.id}
                      className="block md:table-row mb-4 border rounded-lg md:border-0 md:rounded-none md:border-t hover:bg-muted/50"
                    >
                      {headers.map((h) => (
                        <td
                          key={h}
                          className="block md:table-cell px-3 py-3 md:py-2 border-b md:border-0"
                        >
                          <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                            {h.replace(/_/g, ' ')}
                          </span>
                          {h === 'date' ? (
                            <DateCell
                              value={row[h] ?? ''}
                              onChange={(val) => handleEditCell(row.id, h, val)}
                            />
                          ) : category === 'mood' && h === 'mood_value' ? (
                            <MoodValueCell
                              value={row[h] ?? ''}
                              onChange={(val) => handleEditCell(row.id, h, val)}
                            />
                          ) : category === 'mood' && h === 'mood_tags' ? (
                            <MoodTagsCell
                              value={row[h] ?? ''}
                              onChange={(val) => handleEditCell(row.id, h, val)}
                            />
                          ) : config.dropdownColumns?.[h] ? (
                            <Select
                              value={row[h] ?? ''}
                              onValueChange={(val) =>
                                handleEditCell(row.id, h, val)
                              }
                            >
                              <SelectTrigger className="w-full md:w-24">
                                <SelectValue placeholder="unit" />
                              </SelectTrigger>
                              <SelectContent>
                                {config.dropdownColumns[h].map((opt) => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type="text"
                              value={row[h] ?? ''}
                              onChange={(e) =>
                                handleEditCell(row.id, h, e.target.value)
                              }
                              className="w-full md:w-32"
                            />
                          )}
                        </td>
                      ))}
                      <td className="block md:table-cell px-3 py-3 md:py-2">
                        <Button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          variant="destructive"
                          size="sm"
                          className="w-full md:w-auto"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <CsvImportResultPanel result={result} />

          <Button
            type="submit"
            disabled={loading || csvData.length === 0}
            className="w-full flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Upload size={16} />
            )}
            {loading
              ? t('healthDataImport.importing', 'Importing...')
              : t('healthDataImport.import', 'Import')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default HealthDataImportCSV;
