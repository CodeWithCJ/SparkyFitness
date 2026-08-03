import { useTranslation } from 'react-i18next';
import { parse as parseDate, isValid as isValidDate, format } from 'date-fns';
import {
  toNumber,
  isDayString,
  type CsvFormatOptions,
  type DecimalDetection,
} from '@workspace/shared';

interface CsvFormatPreviewProps {
  headers: string[];
  rows: Array<Record<string, string>>;
  options: CsvFormatOptions;
  decimalDetection: DecimalDetection;
  numericColumns?: string[];
  dateColumn?: string;
  totalRowCount: number;
  /** True when `totalRowCount` is a lower bound (the parse hit its row cap). */
  totalRowCountIsPartial?: boolean;
}

const MAX_PREVIEW_ROWS = 5;
const MAX_PREVIEW_COLUMNS = 6;

/**
 * Live effect of the current CsvFormatOptions on a few real rows. This is
 * the primary defense against a wrong decimal/quote pick silently producing
 * a plausible-but-wrong value — mistakes here are visible (mangled cells,
 * a destructive-colored parse failure) instead of hidden until data lands.
 */
const CsvFormatPreview = ({
  headers,
  rows,
  options,
  decimalDetection,
  numericColumns = [],
  dateColumn,
  totalRowCount,
  totalRowCountIsPartial = false,
}: CsvFormatPreviewProps) => {
  const { t } = useTranslation();
  const resolvedDecimal =
    options.decimal === 'auto' ? decimalDetection.format : options.decimal;

  const previewHeaders = headers.slice(0, MAX_PREVIEW_COLUMNS);
  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);

  if (previewRows.length === 0) {
    return null;
  }

  const renderCell = (header: string, raw: string) => {
    if (numericColumns.includes(header)) {
      const parsed = toNumber(raw, resolvedDecimal);
      return (
        <span className={parsed === undefined ? 'text-destructive' : undefined}>
          {raw} {'→'} {parsed === undefined ? '—' : parsed}
        </span>
      );
    }
    if (dateColumn && header === dateColumn && options.dateFormat) {
      // An already-ISO date (yyyy-MM-dd) is valid regardless of the
      // selected date format and is never reformatted by Health/Food
      // Diary at submission time (they pass the string through as-is) —
      // showing "raw → —" here would be a false alarm about data that
      // imports correctly. Only cells that don't match ISO get evaluated
      // against the selected format, since that's the one genuinely
      // ambiguous case (e.g. Workout History, which does parse dates for
      // real using this same option).
      if (isDayString(raw)) {
        return raw;
      }
      const parsedDate = parseDate(raw, options.dateFormat, new Date());
      const valid = isValidDate(parsedDate);
      return (
        <span className={!valid ? 'text-destructive' : undefined}>
          {raw} {'→'} {valid ? format(parsedDate, 'yyyy-MM-dd') : '—'}
        </span>
      );
    }
    return raw;
  };

  return (
    <div className="mt-3 rounded-md border">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50">
              {previewHeaders.map((h) => (
                <th key={h} className="px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {previewHeaders.map((h) => (
                  <td key={h} className="px-2 py-1 whitespace-nowrap">
                    {renderCell(h, row[h] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-2 py-1 text-xs text-muted-foreground">
        {t(
          'csvImport.previewSummary',
          '{{columns}} columns, {{rows}} rows detected.',
          {
            columns: headers.length,
            rows: totalRowCountIsPartial ? `${totalRowCount}+` : totalRowCount,
          }
        )}
      </p>
    </div>
  );
};

export default CsvFormatPreview;
