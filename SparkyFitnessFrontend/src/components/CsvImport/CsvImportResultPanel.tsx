import { useTranslation } from 'react-i18next';
import type { CsvImportOutcome, CsvParseWarning } from '@workspace/shared';

interface CsvImportResultPanelProps {
  result: CsvImportOutcome | null | undefined;
}

/**
 * Standard result panel for every CSV importer: processed/skipped/failed
 * counts, an expandable failed-row list, and any parse-level warnings
 * (delimiter/decimal detection issues) surfaced above the counts so a
 * format mistake is diagnosable without opening devtools.
 *
 * Extracted from HealthDataImportCSV.tsx, which had the best error UX of
 * the original six importers — this is that same panel, generalized.
 */
const CsvImportResultPanel = ({ result }: CsvImportResultPanelProps) => {
  const { t } = useTranslation();
  if (!result) return null;

  const warnings: CsvParseWarning[] = result.parseWarnings ?? [];

  return (
    <div className="p-4 border rounded-lg space-y-3">
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="p-2 rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 text-sm"
            >
              {w.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="text-green-600 font-medium">
          {t('csvImport.resultImported', 'Imported')}: {result.processed.length}
        </span>
        <span className="text-muted-foreground">
          {t('csvImport.resultSkipped', 'Skipped')}: {result.skipped.length}
        </span>
        <span className="text-red-600">
          {t('csvImport.resultFailed', 'Failed')}: {result.errors.length}
        </span>
      </div>
      {result.errors.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            {t('csvImport.viewErrors', 'View failed rows')}
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
            {result.errors.map((err, i) => (
              <div
                key={i}
                className="p-2 rounded bg-red-500/10 text-red-700 dark:text-red-300"
              >
                <div>{err.error}</div>
                {err.entry !== undefined && (
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(err.entry)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default CsvImportResultPanel;
