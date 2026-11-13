import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatRaceTime,
  type RaceDistanceStandard,
  type RacePrediction,
  type RacePredictionTarget,
  type RunningTrends,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RunningTrendsCardProps {
  trends: RunningTrends;
  raceTimes: readonly RacePrediction[];
  distanceUnit: 'km' | 'miles';
  /** Converts a distance between units (the preferences' `convertDistance`). */
  convertDistance: (
    value: number,
    from: 'km' | 'miles',
    to: 'km' | 'miles'
  ) => number;
  /** Formats a YYYY-MM-DD day for the chart's week labels. */
  formatWeekLabel: (weekStart: string) => string;
}

export const RunningTrendsCard = ({
  trends,
  raceTimes,
  distanceUnit,
  convertDistance,
  formatWeekLabel,
}: RunningTrendsCardProps) => {
  const { t } = useTranslation();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const toUnit = (meters: number) =>
    convertDistance(meters / 1000, 'km', distanceUnit);

  const raceLabel: Record<RacePredictionTarget | RaceDistanceStandard, string> =
    {
      '1k': t('exerciseAnalytics.cardio.trends.basis1k', '1K'),
      '1mi': t('exerciseAnalytics.cardio.trends.basis1mi', 'mile'),
      '5k': t('exerciseAnalytics.cardio.trends.race5k', '5K'),
      '10k': t('exerciseAnalytics.cardio.trends.race10k', '10K'),
      '15k': t('exerciseAnalytics.cardio.trends.basis15k', '15K'),
      half_marathon: t(
        'exerciseAnalytics.cardio.trends.raceHalf',
        'Half marathon'
      ),
      marathon: t('exerciseAnalytics.cardio.trends.raceMarathon', 'Marathon'),
    };

  const chartData = trends.weeks.map((week, index) => ({
    week: formatWeekLabel(week.weekStart),
    distance: Number(toUnit(week.distanceMeters).toFixed(2)),
    isCurrent: index === trends.weeks.length - 1,
  }));

  const percent = trends.weekVsAveragePercent;
  const efficiency = trends.efficiencyChangePercent;

  return (
    <Card className="shadow-sm border" data-testid="running-trends">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t('exerciseAnalytics.cardio.trends.title', 'Running, last 12 weeks')}
        </CardTitle>
        <p className="text-2xl font-bold" data-testid="running-this-week">
          {toUnit(trends.thisWeekMeters).toFixed(1)} {unitLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {percent == null
            ? t('exerciseAnalytics.cardio.trends.thisWeek', 'This week')
            : percent >= 0
              ? t(
                  'exerciseAnalytics.cardio.trends.thisWeekAbove',
                  'This week, {{percent}}% above your recent average',
                  { percent: Math.abs(percent).toFixed(0) }
                )
              : t(
                  'exerciseAnalytics.cardio.trends.thisWeekBelow',
                  'This week, {{percent}}% below your recent average',
                  { percent: Math.abs(percent).toFixed(0) }
                )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} interval={1} />
              <YAxis
                width={36}
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `${value}`}
              />
              <Tooltip
                formatter={(value) => [`${value} ${unitLabel}`, unitLabel]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  borderColor: 'hsl(var(--border))',
                }}
              />
              <Bar dataKey="distance" isAnimationActive={false}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.week}
                    fill={
                      entry.isCurrent
                        ? 'hsl(var(--primary))'
                        : 'hsl(var(--muted-foreground))'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {t('exerciseAnalytics.cardio.trends.longestRun', 'Longest run')}
            </p>
            <p className="font-semibold" data-testid="running-longest">
              {toUnit(trends.longestRunMeters).toFixed(1)} {unitLabel}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t('exerciseAnalytics.cardio.trends.efficiency', 'Efficiency')}
            </p>
            <p className="font-semibold" data-testid="running-efficiency">
              {efficiency == null
                ? '—'
                : `${efficiency > 0 ? '+' : ''}${efficiency.toFixed(1)}%`}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.trends.efficiencyHint',
            'Efficiency is distance per heartbeat on runs of 20 minutes or more, earlier weeks against recent ones. Higher means fitter at the same effort.'
          )}
        </p>

        {raceTimes.length > 0 && (
          <div data-testid="running-race-times">
            <p className="text-sm font-semibold mb-1">
              {t(
                'exerciseAnalytics.cardio.trends.raceTimes',
                'Race time estimates'
              )}
            </p>
            <ul className="space-y-0.5 text-sm">
              {raceTimes.map((prediction) => (
                <li
                  key={prediction.target}
                  className="flex justify-between gap-2"
                >
                  <span className="text-muted-foreground">
                    {raceLabel[prediction.target]}
                  </span>
                  <span className="font-semibold">
                    {formatRaceTime(prediction.seconds)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      {prediction.isRecord
                        ? t(
                            'exerciseAnalytics.cardio.trends.yourRecord',
                            'your record'
                          )
                        : t(
                            'exerciseAnalytics.cardio.trends.fromBest',
                            'from your {{distance}}',
                            { distance: raceLabel[prediction.basedOn] }
                          )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'exerciseAnalytics.cardio.trends.raceTimesHint',
                'Estimates scale your best efforts to each distance. They run optimistic for distances you have not trained for.'
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
