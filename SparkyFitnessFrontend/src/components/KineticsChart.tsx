import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@/contexts/ThemeContext';
import {
  formatDayRelativeTick,
  formatRelativeDateTime,
  hourlyTicks,
  localDayStartMs,
} from '@/utils/kineticsTime';

type CurvePoint<K extends string> = { t: number } & Record<K, number>;

interface KineticsChartProps<K extends string> {
  data: CurvePoint<K>[];
  /** Which field of each point is plotted. */
  dataKey: K;
  /** The plotted span in epoch ms; the wall clock never widens it. */
  window: { start: number; end: number };
  /** The diary day on screen (YYYY-MM-DD); ticks and tooltips are relative to it. */
  viewedDate: string;
  yMax: number;
  color: string;
  gradientId: string;
  /** Draws the "now" marker; null when now is not on the day being viewed. */
  nowMs: number | null;
  /** Tooltip series name. */
  valueLabel: string;
  formatValue: (value: number) => string;
  /** Card-specific marks (reference lines, dose dots), drawn over the curve. */
  children?: ReactNode;
}

/**
 * The chart frame shared by the Diary's modeled-curve cards: hourly time axis
 * relative to the viewed day, themed grid and tooltip, the filled curve and the
 * "now" marker. Each card adds its own marks as children and names every mark
 * in its own legend.
 */
export function KineticsChart<K extends string>({
  data,
  dataKey,
  window,
  viewedDate,
  yMax,
  color,
  gradientId,
  nowMs,
  valueLabel,
  formatValue,
  children,
}: KineticsChartProps<K>) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const dayStartMs = localDayStartMs(viewedDate);
  const relativeLabels = {
    yesterday: t('common.yesterday', 'Yesterday'),
    tomorrow: t('common.tomorrow', 'Tomorrow'),
  };
  const axisColor = isDark ? '#888' : '#666';

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: -14, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
          vertical={false}
        />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[window.start, window.end]}
          ticks={hourlyTicks(window.start, window.end)}
          tickFormatter={(instant: number) =>
            formatDayRelativeTick(instant, dayStartMs)
          }
          stroke={axisColor}
          fontSize={11}
          minTickGap={30}
        />
        <YAxis domain={[0, yMax]} stroke={axisColor} fontSize={11} width={38} />
        <Tooltip
          contentStyle={{
            backgroundColor: isDark ? '#1e1e1e' : '#fff',
            border: `1px solid ${isDark ? '#333' : '#ddd'}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelFormatter={(value) =>
            formatRelativeDateTime(Number(value), viewedDate, relativeLabels)
          }
          formatter={(
            value: string | number | ReadonlyArray<string | number> | undefined
          ) => [formatValue(Number(value)), valueLabel]}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
        {nowMs !== null && (
          <ReferenceLine
            x={nowMs}
            stroke={isDark ? '#94a3b8' : '#475569'}
            strokeWidth={1}
          />
        )}
        {children}
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface DoseChip {
  at: string;
  label: string;
  amount: string;
}

/** The doses behind a curve, each with its time relative to the viewed day. */
export function KineticsDoseChips({
  title,
  doses,
  viewedDate,
}: {
  title: string;
  doses: DoseChip[];
  viewedDate: string;
}) {
  const { t } = useTranslation();
  if (doses.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {doses.map((dose, idx) => (
          <div
            key={`${dose.at}-${idx}`}
            className="text-xs px-2 py-1 rounded bg-muted flex items-center gap-1.5"
          >
            <span className="font-medium">{dose.label}:</span>
            <span>{dose.amount}</span>
            <span className="text-[10px] text-muted-foreground">
              (
              {formatRelativeDateTime(dose.at, viewedDate, {
                yesterday: t('common.yesterday', 'Yesterday'),
                tomorrow: t('common.tomorrow', 'Tomorrow'),
              })}
              )
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
