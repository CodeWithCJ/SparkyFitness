import { useTranslation } from 'react-i18next';
import ActivityReportVisualizer from '@/pages/Reports/ActivityReportVisualizer'; // Adjust path if needed
import { ExerciseProgressResponse } from '@workspace/shared';

interface GarminActivityListProps {
  entries: ExerciseProgressResponse[];
  formatDate: (date: Date, formatStr: string) => string;
  parseISO: (dateString: string) => Date;
}

export const GarminActivityList = ({
  entries,
  formatDate,
  parseISO,
}: GarminActivityListProps) => {
  const { t } = useTranslation();

  if (entries.length === 0) return null;

  return (
    <div className="mt-8 space-y-8">
      <h2 className="text-2xl font-bold">
        {t('exerciseReportsDashboard.activityMaps', 'Activity Maps')}
      </h2>
      {entries.map((entry) => (
        <div
          key={entry.exercise_entry_id}
          className="border p-4 rounded-lg shadow-sm"
        >
          <h3 className="text-xl font-semibold mb-2">
            {formatDate(parseISO(entry.entry_date), 'MMM dd, yyyy')}
          </h3>
          <ActivityReportVisualizer
            exerciseEntryId={entry.exercise_entry_id!}
            providerName={entry.provider_name || 'garmin'}
          />
        </div>
      ))}
    </div>
  );
};
