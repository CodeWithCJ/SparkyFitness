import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  COMPARE_METRICS,
  compareDigits,
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareResponse,
  displayDots,
  pairedDots,
  timingOf,
  trendLine,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ZoomableChart from '@/components/ZoomableChart';
import { ChartErrorBoundary } from '@/pages/Errors/ChartErrorFallback';
import { CompareBars } from './CompareBars';
import { TOOLTIP_STYLE } from './compareChartTheme';
import { compareShownAmountText, dotsAxisCaption } from './compareCopy';
import { COMPARE_METRIC_LABELS } from './compareMetricLabels';
import { hasDeviation } from './compareTables';

interface CompareDotsChartProps {
  response: CompareResponse;
  question: CompareQuestion;
}

const DOT_COLOR = '#8884d8';
// The dots are already on the display scale, so they are formatted as shown
// amounts to the metric's precision and never rescaled. A deviation is signed;
// a yes/no side by day is its 0/1 flag, which is not.
const dotText =
  (key: CompareMetricKey, mode: CompareMode) =>
  (value: number): string =>
    compareShownAmountText(key, value, hasDeviation(key, mode));

export const CompareDotsChart = ({
  response,
  question,
}: CompareDotsChartProps) => {
  const { t } = useTranslation();
  const { mode, timing } = timingOf(question.choice);

  const { dots, trend } = useMemo(() => {
    const paired = displayDots(pairedDots(response, mode, timing), question);
    // A fitted line reads as a finding, so it is drawn only for a real link.
    const line = response.result.linked === true ? trendLine(paired) : null;
    if (!line || paired.length === 0) return { dots: paired, trend: null };
    const xs = paired.map((dot) => dot.x);
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return {
      dots: paired,
      trend: [
        { x: lo, y: line.slope * lo + line.intercept },
        { x: hi, y: line.slope * hi + line.intercept },
      ] as const,
    };
  }, [response, question, mode, timing]);

  const yesNoByDay =
    mode === 'day' &&
    (COMPARE_METRICS[question.a].kind === 'binary' ||
      COMPARE_METRICS[question.b].kind === 'binary');
  if (yesNoByDay && response.result.binary) {
    return <CompareBars response={response} question={question} />;
  }

  const aLabel = COMPARE_METRIC_LABELS[question.a](t);
  const bLabel = COMPARE_METRIC_LABELS[question.b](t);
  const title =
    mode === 'week'
      ? t('compareReport.chart.eachWeek', 'Each week as a dot')
      : t('compareReport.chart.eachDay', 'Each day as a dot');

  if (dots.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'week'
              ? t('compareReport.chart.noDotsWeeks', {
                  defaultValue: 'No weeks with both yet',
                })
              : t('compareReport.chart.noDots', {
                  defaultValue: 'No days with both yet',
                })}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ChartErrorBoundary>
      <ZoomableChart title={title}>
        {(isMaximized, zoomLevel) => (
          <Card className={isMaximized ? 'flex h-full flex-col' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{title}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {dotsAxisCaption(question.b, mode, t)}
              </p>
            </CardHeader>
            <CardContent
              className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
            >
              <div
                role="img"
                aria-label={t('compareReport.chart.dotsLabel', {
                  defaultValue: 'Each dot pairs {{a}} with {{b}}',
                  a: aLabel,
                  b: bLabel,
                })}
                className={(isMaximized ? 'grow min-h-0' : 'h-72') + ' min-w-0'}
              >
                <ResponsiveContainer
                  width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  height="100%"
                  minWidth={0}
                  minHeight={0}
                  debounce={100}
                >
                  <ScatterChart
                    margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={aLabel}
                      fontSize={10}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      domain={['auto', 'auto']}
                      allowDecimals={compareDigits(question.a) > 0}
                      tickFormatter={dotText(question.a, mode)}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name={bLabel}
                      fontSize={10}
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      domain={['auto', 'auto']}
                      allowDecimals={compareDigits(question.b) > 0}
                      tickFormatter={dotText(question.b, mode)}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value, name) => {
                        const key = name === aLabel ? question.a : question.b;
                        return [dotText(key, mode)(Number(value)), name];
                      }}
                    />
                    <Scatter data={dots} fill={DOT_COLOR} />
                    {trend && (
                      <ReferenceLine
                        segment={[...trend]}
                        stroke="#888888"
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                        ifOverflow="extendDomain"
                      />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                {dotsAxisCaption(question.a, mode, t)}
              </p>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>
    </ChartErrorBoundary>
  );
};
