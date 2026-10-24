import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type CompareQuestion,
  type CompareResponse,
  overTimeData,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ChartErrorBoundary } from '@/pages/Errors/ChartErrorFallback';
import { TOOLTIP_STYLE } from './compareChartTheme';
import { compareValueText } from './compareCopy';
import { COMPARE_METRIC_LABELS } from './compareMetricLabels';

interface CompareOverTimeChartProps {
  response: CompareResponse;
  question: CompareQuestion;
}

const COLOR_A = '#8884d8';
const COLOR_B = '#f97316';

interface TooltipProps {
  active?: boolean;
  label?: string | number;
}

export const CompareOverTimeChart = ({
  response,
  question,
}: CompareOverTimeChartProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, timeFormat } = usePreferences();
  const { rows, aRange, bRange } = useMemo(
    () => overTimeData(response),
    [response]
  );

  const aLabel = COMPARE_METRIC_LABELS[question.a](t);
  const bLabel = COMPARE_METRIC_LABELS[question.b](t);
  const title = t('compareReport.chart.overTime', 'Over time');

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-sm text-muted-foreground">
            {t('compareReport.chart.noOverTime', {
              defaultValue: 'Nothing logged in this range',
            })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const legend = [
    { id: 'a', key: question.a, range: aRange, color: COLOR_A, label: aLabel },
    { id: 'b', key: question.b, range: bRange, color: COLOR_B, label: bLabel },
  ].map((item) => ({
    ...item,
    text: item.range
      ? t('compareReport.chart.range', {
          defaultValue: '{{metric}} {{min}}–{{max}}',
          metric: item.label,
          min: compareValueText(item.key, item.range.min, timeFormat),
          max: compareValueText(item.key, item.range.max, timeFormat),
        })
      : item.label,
  }));

  const formatDay = (key: string) => formatDateInUserTimezone(key, 'MMM dd');

  const renderTooltip = ({ active, label }: TooltipProps) => {
    if (!active || typeof label !== 'string') return null;
    const day = label;
    const lines = [
      { name: aLabel, key: question.a, raw: response.a.values[day] },
      { name: bLabel, key: question.b, raw: response.b.values[day] },
    ];
    return (
      <div className="p-2 text-xs shadow-sm" style={TOOLTIP_STYLE}>
        <p className="mb-1 font-medium">{formatDay(day)}</p>
        {lines.map((line) => (
          <p key={line.name}>
            {line.name}:{' '}
            {line.raw === undefined
              ? '–'
              : compareValueText(line.key, line.raw, timeFormat)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <ChartErrorBoundary>
      <ZoomableChart title={title}>
        {(isMaximized, zoomLevel) => (
          <Card className={isMaximized ? 'flex h-full flex-col' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{title}</CardTitle>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {legend.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.text}
                  </li>
                ))}
              </ul>
            </CardHeader>
            <CardContent
              className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
            >
              <div
                role="img"
                aria-label={t('compareReport.chart.overTimeLabel', {
                  defaultValue:
                    '{{a}} and {{b}} over time, each scaled to its own range',
                  a: aLabel,
                  b: bLabel,
                })}
                className={(isMaximized ? 'grow min-h-0' : 'h-64') + ' min-w-0'}
              >
                <ResponsiveContainer
                  width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  height="100%"
                  minWidth={0}
                  minHeight={0}
                  debounce={100}
                >
                  <LineChart data={rows}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="key"
                      fontSize={10}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={formatDay}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={[0, 1]}
                      ticks={[0, 0.5, 1]}
                      tickFormatter={() => ''}
                      width={8}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip content={renderTooltip} />
                    <Line
                      type="monotone"
                      dataKey="a"
                      name={aLabel}
                      stroke={COLOR_A}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="b"
                      name={bLabel}
                      stroke={COLOR_B}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>
    </ChartErrorBoundary>
  );
};
