import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber, formatWeight } from '@/utils/numberFormatting';
import { ExerciseDashboardData } from '@/types/reports';

interface KeyStatsWidgetProps {
  data: ExerciseDashboardData;
  totalTonnage: number;
  weightUnit: string;
}

export const KeyStatsWidget = ({
  data,
  totalTonnage,
  weightUnit,
}: KeyStatsWidgetProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.overallPerformanceSnapshot',
            'Overall Performance Snapshot'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg h-full">
          <span className="text-3xl font-bold">
            {formatNumber(data.keyStats.totalWorkouts)}
          </span>
          <span className="text-sm text-center">
            {t('exerciseReportsDashboard.totalWorkouts', 'Total Workouts')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-lg h-full">
          <span className="text-3xl font-bold">
            {formatWeight(totalTonnage, weightUnit)}
          </span>
          <span className="text-sm text-center">
            {t('exerciseReportsDashboard.totalTonnage', 'Total Tonnage')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600 text-white shadow-lg h-full">
          <span className="text-3xl font-bold">
            {formatWeight(data.keyStats.totalVolume, weightUnit)}
          </span>
          <span className="text-sm text-center">
            {t('exerciseReportsDashboard.totalVolume', 'Total Volume')}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-red-500 to-pink-600 text-white shadow-lg h-full">
          <span className="text-3xl font-bold">
            {formatNumber(data.keyStats.totalReps)}
          </span>
          <span className="text-sm text-center">
            {t('exerciseReportsDashboard.totalReps', 'Total Reps')}
          </span>
        </div>
        {data.consistencyData && (
          <>
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg h-full">
              <span className="text-3xl font-bold">
                {data.consistencyData.currentStreak}
              </span>
              <span className="text-sm text-center">
                {t(
                  'exerciseReportsDashboard.currentStreakDays',
                  'Current Streak (days)'
                )}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg h-full">
              <span className="text-3xl font-bold">
                {data.consistencyData.longestStreak}
              </span>
              <span className="text-sm text-center">
                {t(
                  'exerciseReportsDashboard.longestStreakDays',
                  'Longest Streak (days)'
                )}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-emerald-500 to-lime-600 text-white shadow-lg h-full">
              <span className="text-3xl font-bold">
                {data.consistencyData.weeklyFrequency.toFixed(1)}
              </span>
              <span className="text-sm text-center">
                {t(
                  'exerciseReportsDashboard.weeklyFrequency',
                  'Weekly Frequency'
                )}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg h-full">
              <span className="text-3xl font-bold">
                {data.consistencyData.monthlyFrequency.toFixed(1)}
              </span>
              <span className="text-sm text-center">
                {t(
                  'exerciseReportsDashboard.monthlyFrequency',
                  'Monthly Frequency'
                )}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
