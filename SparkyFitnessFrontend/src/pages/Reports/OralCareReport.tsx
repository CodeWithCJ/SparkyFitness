import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { addDays, summarizeOralCareRange } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useOralCareHistory } from '@/hooks/CheckIn/useOralCare';

interface OralCareReportProps {
  startDate: string;
  endDate: string;
}

/** The history endpoint answers at most this many days. */
const MAX_DAYS = 366;
const GOAL_MET_COLOR = '#0ea5e9';
const BELOW_GOAL_COLOR = '#7dd3fc';

function clampStart(startDate: string, endDate: string): string {
  const earliest = addDays(endDate, -(MAX_DAYS - 1));
  return startDate < earliest ? earliest : startDate;
}

/** Reports → Oral care: brushing against the goal over the report's range. */
const OralCareReport = ({ startDate, endDate }: OralCareReportProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  const from = clampStart(startDate, endDate);
  const { data, isLoading, isError, refetch } = useOralCareHistory(
    from,
    endDate
  );

  const chartData = useMemo(
    () =>
      (data?.days ?? []).map((d) => ({
        ...d,
        label: formatDateInUserTimezone(d.date, 'MMM d'),
        minutes: Math.round((d.brushing_seconds / 60) * 10) / 10,
      })),
    [data?.days, formatDateInUserTimezone]
  );
  const summary = useMemo(
    () => summarizeOralCareRange(data?.days ?? []),
    [data?.days]
  );

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {t('oralCare.report.loading', 'Loading oral care...')}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-start gap-2 py-4">
        <p className="text-sm text-destructive">
          {t('oralCare.report.loadError', 'Failed to load oral care report.')}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    );
  }

  const target = data.settings.daily_target;
  const targetMinutes = (target * data.settings.target_seconds) / 60;

  const tiles = [
    {
      label: t('oralCare.report.goalDays', 'Goal met'),
      value: t('oralCare.report.goalDaysValue', '{{met}} of {{total}} days', {
        met: summary.goalDays,
        total: summary.totalDays,
      }),
      hint: `${summary.goalPercent}%`,
    },
    {
      label: t('oralCare.report.streak', 'Current streak'),
      value: t('oralCare.stats.days', '{{count}} days', {
        count: data.streak,
      }),
      hint: t('oralCare.stats.best', 'Best: {{count}} days', {
        count: data.best_streak,
      }),
    },
    {
      label: t('oralCare.report.brushesPerDay', 'Brushes per day'),
      value: summary.brushesPerDay.toFixed(1),
      hint: t('oralCare.report.goalValue', 'Goal: {{target}}', { target }),
    },
    {
      label: t('oralCare.report.minutesPerDay', 'Minutes brushing per day'),
      value: summary.minutesPerDay.toFixed(1),
      hint: t('oralCare.report.otherCare', 'Other care: {{count}}', {
        count: summary.other,
      }),
    },
  ];

  return (
    <div className="space-y-6">
      {from !== startDate && (
        <p className="text-xs text-muted-foreground">
          {t(
            'oralCare.report.clamped',
            'Showing the last 366 days of the range.'
          )}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{tile.label}</div>
              <div className="text-xl font-semibold mt-1">{tile.value}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {tile.hint}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('oralCare.report.brushesChart', 'Brushes per day')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={0}
              debounce={100}
            >
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" minTickGap={16} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <ReferenceLine
                  y={target}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={t('oralCare.report.goalLine', 'Goal')}
                />
                <Bar
                  dataKey="brushing_count"
                  name={t('oralCare.report.brushes', 'Brushes')}
                  isAnimationActive={false}
                >
                  {chartData.map((d) => (
                    <Cell
                      key={d.date}
                      fill={d.goal_met ? GOAL_MET_COLOR : BELOW_GOAL_COLOR}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('oralCare.report.minutesChart', 'Minutes brushing per day')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={0}
              debounce={100}
            >
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" minTickGap={16} />
                <YAxis />
                <Tooltip />
                <ReferenceLine
                  y={targetMinutes}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={t('oralCare.report.goalLine', 'Goal')}
                />
                <Bar
                  dataKey="minutes"
                  name={t('oralCare.report.minutes', 'Minutes')}
                  fill={GOAL_MET_COLOR}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t(
              'oralCare.report.minutesNote',
              'Only brushes logged with a duration add time.'
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OralCareReport;
