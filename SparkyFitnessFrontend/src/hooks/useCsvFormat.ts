import { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_CSV_FORMAT,
  parseCsv,
  type CsvFormatOptions,
  type CsvParseResult,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';

export interface UseCsvFormatOptions {
  /** date-fns pattern default; omit when the importer has no date axis. */
  defaultDateFormat?: string;
}

/**
 * Owns the CsvFormatOptions state for one importer. Resets to defaults
 * whenever a new file/paste is loaded (`resetForNewInput`) so an override
 * made for one file can't silently corrupt the next — see the "detection vs.
 * override staleness" risk in the CSV-import-unification plan.
 */
export function useCsvFormat({ defaultDateFormat }: UseCsvFormatOptions = {}) {
  const { dateFormat: preferredDateFormat } = usePreferences();

  const initialOptions = useCallback(
    (): CsvFormatOptions => ({
      ...DEFAULT_CSV_FORMAT,
      dateFormat: defaultDateFormat ?? preferredDateFormat,
    }),
    [defaultDateFormat, preferredDateFormat]
  );

  const [options, setOptions] = useState<CsvFormatOptions>(initialOptions);

  const resetForNewInput = useCallback(() => {
    setOptions(initialOptions());
  }, [initialOptions]);

  /**
   * Cheap preview parse — pass `numericColumns` to drive decimal detection
   * and `preview` to override the row cap. Full-parse-on-submit should call
   * `parseCsv` directly instead (which parses the whole file, uncapped).
   *
   * Default cap is 1000 rows, not the ~5 the preview table actually
   * renders (CsvFormatPreview truncates display on its own) — decimal
   * detection needs enough rows to find sparse clarifying evidence (e.g. a
   * 1000-row file that's ambiguous everywhere except row 999); capping
   * Papa's own parse at a handful of rows for speed would mean detection
   * never sees anything past what's displayed, and could silently resolve
   * the whole file under the wrong format. 1000 rows of pure string
   * parsing is still fast enough to run on every format-bar keystroke.
   */
  const parse = useCallback(
    (
      text: string,
      opts?: { numericColumns?: string[]; preview?: number }
    ): CsvParseResult => parseCsv(text, options, { preview: 1000, ...opts }),
    [options]
  );

  return useMemo(
    () => ({ options, setOptions, resetForNewInput, parse }),
    [options, resetForNewInput, parse]
  );
}
