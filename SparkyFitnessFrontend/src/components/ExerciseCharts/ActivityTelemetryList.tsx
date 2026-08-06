import { useTranslation } from 'react-i18next';
import ActivityReportVisualizer from '@/pages/Reports/ActivityReportVisualizer'; // Adjust path if needed
import { providerLabel as resolveProviderLabel } from '@/utils/activityReportUtil';
import { ExerciseProgressResponse } from '@workspace/shared';

interface ActivityTelemetryListProps {
  entries: ExerciseProgressResponse[];
  formatDate: (date: Date, formatStr: string) => string;
  parseISO: (dateString: string) => Date;
  title?: string;
}

export const ActivityTelemetryList = ({
  entries,
  formatDate,
  parseISO,
  title,
}: ActivityTelemetryListProps) => {
  const { t } = useTranslation();

  if (entries.length === 0) return null;

  return (
    <div className="mt-8 space-y-8">
      <h2 className="text-2xl font-bold">
        {title || t('exerciseReportsDashboard.activityMaps', 'Activity Maps')}
      </h2>
      {entries.map((entry) => {
        const provider = resolveProviderLabel(entry.provider_name);
        const displayLabel = provider
          ? provider.isTranslationKey
            ? t(provider.label, provider.fallback)
            : provider.label
          : null;
        return (
          <div
            key={entry.exercise_entry_id}
            className="border p-4 rounded-lg shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className="text-xl font-semibold">
                {formatDate(parseISO(entry.entry_date), 'MMM dd, yyyy')}
              </h3>
              {displayLabel && (
                <span className="text-sm text-muted-foreground">
                  {displayLabel}
                </span>
              )}
            </div>
            {/* The raw provider_name is the DB lookup key — pass it through
                unmapped; resolveProviderLabel above is for display only. */}
            <ActivityReportVisualizer
              exerciseEntryId={entry.exercise_entry_id!}
              providerName={entry.provider_name || 'garmin'}
            />
          </div>
        );
      })}
    </div>
  );
};
