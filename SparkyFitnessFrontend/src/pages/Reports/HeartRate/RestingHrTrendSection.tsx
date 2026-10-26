import React from 'react';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HeartRateChartTheme } from './useHeartRateChartTheme';
import type { HeartRateData } from './useHeartRateData';
import type { HeartRateWindow } from './useHeartRateWindow';

interface RestingHrTrendSectionProps {
  heartRateWindow: HeartRateWindow;
  data: HeartRateData;
  chartTheme: HeartRateChartTheme;
}

const RestingHrTrendSection: React.FC<RestingHrTrendSectionProps> = ({
  heartRateWindow,
  data,
  chartTheme,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const { setDayWindow, isSingleDay, focusedDate } = heartRateWindow;
  const { restingHrTrendStats } = data;

  return (
    <div className="pt-4 border-t border-border/60">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">
              {t('heartRate.restingHrHistoryTitle', 'Resting Heart Rate Trend')}
            </h3>
            {restingHrTrendStats.dayCount > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              >
                {t('heartRate.daysCount', '{{count}} days', {
                  count: restingHrTrendStats.dayCount,
                })}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(
              'heartRate.restingHrHistorySub',
              'Daily baseline heart rate. Click any day to focus 24-hour timeline above.'
            )}
          </p>
        </div>

        {/* Quick Stat Badges */}
        {restingHrTrendStats.avgBpm !== null && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
              <span className="text-muted-foreground">
                {t('common.average', 'Avg')}:
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {restingHrTrendStats.avgBpm} bpm
              </span>
            </div>
            {restingHrTrendStats.minBpm !== null &&
              restingHrTrendStats.maxBpm !== null && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-xs">
                  <span className="text-muted-foreground">
                    {t('common.range', 'Range')}:
                  </span>
                  <span className="font-semibold text-foreground">
                    {restingHrTrendStats.minBpm} – {restingHrTrendStats.maxBpm}{' '}
                    bpm
                  </span>
                </div>
              )}
            {restingHrTrendStats.trendDelta !== null && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                  restingHrTrendStats.trendDelta < 0
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : restingHrTrendStats.trendDelta > 0
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-muted border-border text-muted-foreground'
                }`}
              >
                <span>
                  {restingHrTrendStats.trendDelta < 0
                    ? `↓ ${Math.abs(restingHrTrendStats.trendDelta)} bpm (${t('heartRate.improving', 'Improving')})`
                    : restingHrTrendStats.trendDelta > 0
                      ? `↑ ${restingHrTrendStats.trendDelta} bpm (${t('heartRate.elevated', 'Elevated')})`
                      : t('heartRate.stable', 'Stable')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {restingHrTrendStats.points.length > 0 ? (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={restingHrTrendStats.points}
              margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
              onClick={(e) => {
                const idx = Number(e?.activeTooltipIndex);
                const clickedDate = Number.isInteger(idx)
                  ? restingHrTrendStats.points[idx]?.date
                  : undefined;
                if (clickedDate) {
                  setDayWindow({ start: clickedDate, end: clickedDate });
                }
              }}
            >
              <CartesianGrid
                stroke={chartTheme.gridColor}
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="shortDate"
                stroke={chartTheme.axisLineColor}
                tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                domain={[
                  (dataMin: number) => Math.max(35, dataMin - 4),
                  (dataMax: number) => dataMax + 4,
                ]}
                stroke={chartTheme.axisLineColor}
                tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                tickLine={false}
                width={38}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const dataPoint = payload[0]?.payload as {
                    date: string;
                    shortDate: string;
                    bpm: number;
                    isFocused: boolean;
                  };
                  const diffVsAvg =
                    restingHrTrendStats.avgBpm !== null
                      ? dataPoint.bpm - restingHrTrendStats.avgBpm
                      : null;
                  return (
                    <div
                      className="rounded-xl p-3 shadow-xl border text-xs space-y-1.5"
                      style={{
                        backgroundColor: chartTheme.tooltipBg,
                        borderColor: chartTheme.tooltipBorder,
                        color: chartTheme.tooltipText,
                      }}
                    >
                      <div className="font-semibold text-muted-foreground text-[11px]">
                        {formatDateInUserTimezone(dataPoint.date, dateFormat)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-emerald-500">
                          {dataPoint.bpm} bpm
                        </span>
                        {diffVsAvg !== null && diffVsAvg !== 0 && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              diffVsAvg < 0
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-amber-500/10 text-amber-500'
                            }`}
                          >
                            {diffVsAvg > 0 ? `+${diffVsAvg}` : diffVsAvg} vs avg
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-border/50">
                        {dataPoint.date === focusedDate && isSingleDay
                          ? `✓ ${t('heartRate.currentlyViewing', 'Viewing 24h detail above')}`
                          : `👉 ${t('heartRate.clickToFocus', 'Click to zoom into 24h detail')}`}
                      </div>
                    </div>
                  );
                }}
              />
              {restingHrTrendStats.avgBpm !== null && (
                <ReferenceLine
                  y={restingHrTrendStats.avgBpm}
                  stroke={chartTheme.restingLineColor}
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              )}
              <Line
                type="monotone"
                dataKey="bpm"
                stroke="#22c55e"
                strokeWidth={2.4}
                activeDot={{
                  r: 6,
                  fill: '#22c55e',
                  stroke: '#ffffff',
                  strokeWidth: 2,
                  cursor: 'pointer',
                }}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  const isCurrent = payload.date === focusedDate && isSingleDay;
                  return (
                    <circle
                      key={`dot-${payload.date}`}
                      cx={cx}
                      cy={cy}
                      r={isCurrent ? 5.5 : 3.5}
                      fill={isCurrent ? '#22c55e' : '#16a34a'}
                      stroke={isCurrent ? '#ffffff' : 'none'}
                      strokeWidth={isCurrent ? 2 : 0}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setDayWindow({
                          start: payload.date,
                          end: payload.date,
                        });
                      }}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-4">
          {t(
            'heartRate.noRestingHrHistory',
            'No resting HR recorded in this date range'
          )}
        </p>
      )}
    </div>
  );
};

export default RestingHrTrendSection;
