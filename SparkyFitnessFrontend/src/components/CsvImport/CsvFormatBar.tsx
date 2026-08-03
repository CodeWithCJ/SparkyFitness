import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CSV_DELIMITER_LABEL_KEYS,
  DATE_FORMATS,
  type CsvDelimiter,
  type CsvFormatCapabilities,
  type CsvFormatOptions,
  type DecimalDetection,
} from '@workspace/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface CsvFormatBarDetection {
  delimiter: CsvDelimiter | null;
  delimiterFailed: boolean;
  decimal: DecimalDetection;
}

interface CsvFormatBarProps {
  capabilities: CsvFormatCapabilities;
  value: CsvFormatOptions;
  onChange: (next: CsvFormatOptions) => void;
  detection?: CsvFormatBarDetection;
}

const DELIMITER_OPTIONS: CsvDelimiter[] = [',', ';', '\t', '|'];

/**
 * Format controls for one CSV import screen. Only axes declared in
 * `capabilities` are rendered at all — e.g. an importer with no date column
 * passes `date: false` and no date control appears, not a disabled one.
 *
 * Collapsed by default to a one-line summary (the main defense against
 * option fatigue for imports where the defaults are already correct);
 * auto-expands when delimiter detection fails so the fix is visible without
 * a click.
 */
const CsvFormatBar = ({
  capabilities,
  value,
  onChange,
  detection,
}: CsvFormatBarProps) => {
  const { t } = useTranslation();
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = userExpanded ?? !!detection?.delimiterFailed;
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const set = <K extends keyof CsvFormatOptions>(
    key: K,
    val: CsvFormatOptions[K]
  ) => onChange({ ...value, [key]: val });

  const delimiterLabel = (d: CsvDelimiter) =>
    t(
      `csvImport.delimiter.${CSV_DELIMITER_LABEL_KEYS[d]}`,
      CSV_DELIMITER_LABEL_KEYS[d]
    );

  const summaryParts: string[] = [];
  if (capabilities.delimiter) {
    summaryParts.push(
      value.delimiter === 'auto'
        ? detection?.delimiter
          ? t('csvImport.summary.autoDelimiter', 'Auto-detect ({{label}})', {
              label: delimiterLabel(detection.delimiter),
            })
          : t('csvImport.summary.auto', 'Auto-detect')
        : delimiterLabel(value.delimiter)
    );
  }
  if (capabilities.decimal) {
    summaryParts.push(
      value.decimal === 'auto'
        ? detection?.decimal.format === 'eu'
          ? t('csvImport.summary.autoDecimalEu', 'Auto decimals (1.234,56)')
          : t('csvImport.summary.autoDecimalUs', 'Auto decimals (1,234.56)')
        : value.decimal === 'eu'
          ? t('csvImport.decimal.euShort', '1.234,56 (EU)')
          : t('csvImport.decimal.usShort', '1,234.56 (US)')
    );
  }

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          {summaryParts.join(' · ')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setUserExpanded(!expanded)}
        >
          {expanded
            ? t('csvImport.hideOptions', 'Hide format options')
            : t('csvImport.changeFormat', 'Change')}
          {expanded ? (
            <ChevronDown className="ml-1 h-4 w-4" />
          ) : (
            <ChevronRight className="ml-1 h-4 w-4" />
          )}
        </Button>
      </div>

      {detection?.delimiterFailed && (
        <p className="mt-2 text-destructive">
          {t(
            'csvImport.delimiterDetectionFailed',
            "Couldn't detect a delimiter — pick one below."
          )}
        </p>
      )}

      {expanded && (
        <div className="mt-3 flex flex-wrap gap-3">
          {capabilities.delimiter && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t('csvImport.delimiterLabel', 'Delimiter')}
              </label>
              <Select
                value={value.delimiter}
                onValueChange={(v) =>
                  set('delimiter', v as CsvFormatOptions['delimiter'])
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {detection?.delimiter
                      ? t(
                          'csvImport.summary.autoDelimiter',
                          'Auto-detect ({{label}})',
                          { label: delimiterLabel(detection.delimiter) }
                        )
                      : t('csvImport.summary.auto', 'Auto-detect')}
                  </SelectItem>
                  {DELIMITER_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {delimiterLabel(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {capabilities.decimal && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t('csvImport.decimalLabel', 'Number format')}
              </label>
              <Select
                value={value.decimal}
                onValueChange={(v) =>
                  set('decimal', v as CsvFormatOptions['decimal'])
                }
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {t('csvImport.decimal.auto', 'Auto-detect')}
                  </SelectItem>
                  <SelectItem value="us">
                    {t('csvImport.decimal.us', '1,234.56 (US)')}
                  </SelectItem>
                  <SelectItem value="eu">
                    {t('csvImport.decimal.eu', '1.234,56 (EU)')}
                  </SelectItem>
                </SelectContent>
              </Select>
              {value.decimal === 'auto' && detection?.decimal && (
                <p className="text-xs text-muted-foreground">
                  {detection.decimal.confident
                    ? t(
                        'csvImport.decimalDetected',
                        'Detected: {{format}} (from "{{evidence}}")',
                        {
                          format:
                            detection.decimal.format === 'eu' ? 'EU' : 'US',
                          evidence: detection.decimal.evidence,
                        }
                      )
                    : t(
                        'csvImport.decimalNotConfident',
                        'No ambiguous numbers found; using US.'
                      )}
                </p>
              )}
            </div>
          )}

          {capabilities.date && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                {t('csvImport.dateLabel', 'Date format')}
              </label>
              <Select
                value={value.dateFormat}
                onValueChange={(v) => set('dateFormat', v)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {t(
                        `csvImport.dateFormat.${f}`,
                        f === 'MM/dd/yyyy'
                          ? 'MM/dd/yyyy (e.g., 12/25/2024)'
                          : f === 'dd/MM/yyyy'
                            ? 'dd/MM/yyyy (e.g., 25/12/2024)'
                            : f === 'dd-MMM-yyyy'
                              ? 'dd-MMM-yyyy (e.g., 25-Dec-2024)'
                              : f === 'yyyy-MM-dd'
                                ? 'yyyy-MM-dd (e.g., 2024-12-25)'
                                : f === 'MMM dd, yyyy'
                                  ? 'MMM dd, yyyy (e.g., Dec 25, 2024)'
                                  : f === 'yyyy/MM/dd'
                                    ? 'yyyy/MM/dd (e.g., 2024/12/25)'
                                    : f === 'dd.MM.yyyy'
                                      ? 'dd.MM.yyyy (e.g., 25.12.2024)'
                                      : f
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {capabilities.quote && (
            <Collapsible
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="w-full"
            >
              <CollapsibleTrigger asChild>
                <Button type="button" variant="link" size="sm" className="px-0">
                  {advancedOpen ? (
                    <ChevronDown className="mr-1 h-3 w-3" />
                  ) : (
                    <ChevronRight className="mr-1 h-3 w-3" />
                  )}
                  {t('csvImport.advanced', 'Advanced')}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    {t('csvImport.quoteLabel', 'Quote character')}
                  </label>
                  <Select
                    value={value.quoteChar}
                    onValueChange={(v) =>
                      set('quoteChar', v as CsvFormatOptions['quoteChar'])
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={'"'}>{'"'}</SelectItem>
                      <SelectItem value={"'"}>{"'"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
};

export default CsvFormatBar;
