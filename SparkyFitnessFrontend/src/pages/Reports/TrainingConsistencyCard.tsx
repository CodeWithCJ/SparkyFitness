import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localizeMuscle } from '@/utils/exerciseTaxonomy';
import type { TrainingConsistency } from '@workspace/shared';

/** Weeks drawn in the bar strip; the streak itself looks further back. */
const WEEKS_SHOWN = 12;

interface TrainingConsistencyCardProps {
  data: TrainingConsistency | undefined;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="text-center">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-bold">{value}</div>
  </div>
);

const TrainingConsistencyCard = ({ data }: TrainingConsistencyCardProps) => {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    if (!data) return [];
    const muscles = new Set([
      ...Object.keys(data.muscleSets.thisWeek),
      ...Object.keys(data.muscleSets.lastWeek),
    ]);
    return [...muscles]
      .map((muscle) => ({
        muscle,
        thisWeek: data.muscleSets.thisWeek[muscle] ?? 0,
        lastWeek: data.muscleSets.lastWeek[muscle] ?? 0,
      }))
      .sort(
        (a, b) =>
          b.thisWeek - a.thisWeek ||
          b.lastWeek - a.lastWeek ||
          a.muscle.localeCompare(b.muscle)
      );
  }, [data]);

  if (!data) return null;

  const recentWeeks = data.weeks.slice(-WEEKS_SHOWN);
  const thisWeekDays = data.weeks[data.weeks.length - 1]?.workoutDays ?? 0;
  const weeksText = (count: number) =>
    t('trainingConsistency.weeks', { count, defaultValue: '{{count}} weeks' });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('trainingConsistency.title', 'Training Consistency')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label={t('trainingConsistency.streak', 'Week streak')}
            value={weeksText(data.weeklyStreak.current)}
          />
          <Stat
            label={t('trainingConsistency.longest', 'Longest')}
            value={weeksText(data.weeklyStreak.longest)}
          />
          <Stat
            label={t('trainingConsistency.thisWeek', 'This week')}
            value={t('trainingConsistency.days', {
              count: thisWeekDays,
              defaultValue: '{{count}} days',
            })}
          />
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {t('trainingConsistency.daysPerWeek', {
              count: recentWeeks.length,
              defaultValue: 'Workout days per week, last {{count}} weeks',
            })}
          </div>
          <div
            className="flex items-end gap-1 h-16"
            role="img"
            aria-label={t('trainingConsistency.chartLabel', {
              defaultValue: 'Workout days per week',
            })}
          >
            {recentWeeks.map((week) => (
              <div
                key={week.weekStart}
                className="flex-1 flex flex-col justify-end h-full"
                title={`${week.weekStart}: ${week.workoutDays}`}
              >
                <div
                  data-testid="consistency-week-bar"
                  className={
                    week.workoutDays > 0
                      ? 'rounded-sm bg-green-500'
                      : 'rounded-sm bg-muted'
                  }
                  style={{
                    height: `${Math.max(week.workoutDays, 0) * (100 / 7)}%`,
                    minHeight: 3,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold mb-2">
            {t('trainingConsistency.setsTitle', 'Sets per muscle')}
          </div>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'trainingConsistency.noSets',
                'No sets logged this week or last.'
              )}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-normal" />
                  <th className="text-right font-normal">
                    {t('trainingConsistency.thisWeek', 'This week')}
                  </th>
                  <th className="text-right font-normal">
                    {t('trainingConsistency.lastWeek', 'Last week')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.muscle} className="border-t">
                    <td className="py-1.5">{localizeMuscle(t, row.muscle)}</td>
                    <td className="py-1.5 text-right font-semibold">
                      {row.thisWeek}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {row.lastWeek}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TrainingConsistencyCard;
