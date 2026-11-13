import { useTranslation } from 'react-i18next';
import {
  SYMPTOM_IMPACT_LEVELS,
  severityChartWindow,
  type SymptomEntryResponse,
  type SymptomImpact,
} from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';

interface SeverityChartProps {
  entry: SymptomEntryResponse;
  /** Top of the y axis, from the symptom's scale. */
  max: number;
}

const W = 300;
const H = 130;
const PAD = { left: 26, right: 10, top: 10, bottom: 24 };
/** The effect-on-the-day band below the plot: its height and the space it adds. */
const BAND = { height: 8, extra: 14 };

/** One colour per effect level, for the band and its legend. */
const IMPACT_COLOR: Record<SymptomImpact, { fill: string; bg: string }> = {
  none: { fill: 'fill-green-500', bg: 'bg-green-500' },
  mild: { fill: 'fill-amber-400', bg: 'bg-amber-400' },
  moderate: { fill: 'fill-orange-500', bg: 'bg-orange-500' },
  severe: { fill: 'fill-red-500', bg: 'bg-red-500' },
};

/**
 * Severity over the length of an episode, with a marker where each treatment was
 * taken so a drop in pain after a dose is easy to see. One scale places the
 * points, gridlines and labels. When the episode records its effect on the day,
 * a band below the plot shows each level from the time it was recorded, with a
 * legend so the colours read without hovering.
 */
export default function SeverityChart({ entry, max }: SeverityChartProps) {
  const { t } = useTranslation();
  const { formatTime } = usePreferences();

  const frame = severityChartWindow(entry);
  if (!frame || max <= 0) return null;
  const { start, end, span, points, startIso } = frame;

  const x = (time: number) =>
    PAD.left + ((time - start) / span) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom);

  const line = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${x(new Date(p.at).getTime())} ${y(p.severity)}`
    )
    .join(' ');
  const bandSegments = frame.impact;
  const bandY = H - PAD.bottom + 4;
  const height = bandSegments.length > 0 ? H + BAND.extra : H;
  const impactLabel = t('symptoms.sections.impact', 'Effect on your day');

  const ticks = [0, Math.round(max / 2), max];
  const marks = entry.treatments.filter((tr) => {
    if (!tr.taken_at) return false;
    const at = new Date(tr.taken_at).getTime();
    return at >= start && at <= end;
  });
  const summary = t(
    'symptoms.chart.summary',
    'Severity over the episode, {{count}} readings',
    { count: points.length }
  );

  const chart = (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[9px]"
          >
            {tick}
          </text>
        </g>
      ))}
      {marks.map((tr) => {
        const at = new Date(tr.taken_at as string).getTime();
        return (
          <g key={tr.id}>
            <line
              x1={x(at)}
              x2={x(at)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              className="stroke-green-600"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <text
              x={x(at) + 3}
              y={PAD.top + 8}
              className="fill-green-700 text-[9px] dark:fill-green-400"
            >
              {tr.name_snapshot}
            </text>
          </g>
        );
      })}
      <path
        d={line}
        className="fill-none stroke-primary"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p) => (
        <circle
          key={p.at}
          cx={x(new Date(p.at).getTime())}
          cy={y(p.severity)}
          r={3.5}
          className="fill-primary"
        />
      ))}
      {bandSegments.length > 0 && (
        <g role="group" aria-label={impactLabel}>
          {bandSegments.map((s) => (
            <rect
              key={s.at}
              x={Math.min(x(s.from), W - PAD.right - 2)}
              y={bandY}
              width={Math.max(x(s.to) - x(s.from), 2)}
              height={BAND.height}
              rx={2}
              className={IMPACT_COLOR[s.impact].fill}
            >
              <title>
                {`${impactLabel}: ${t(`symptoms.impact.${s.impact}`, s.impact)} · ${formatTime(s.at)}`}
              </title>
            </rect>
          ))}
        </g>
      )}
      <text
        x={PAD.left}
        y={height - 6}
        className="fill-muted-foreground text-[9px]"
      >
        {formatTime(startIso)}
      </text>
      <text
        x={W - PAD.right}
        y={height - 6}
        textAnchor="end"
        className="fill-muted-foreground text-[9px]"
      >
        {formatTime(new Date(end).toISOString())}
      </text>
    </svg>
  );

  if (bandSegments.length === 0) return chart;
  return (
    <div className="space-y-1">
      {chart}
      {/* The chart is one image to a screen reader, so the recorded levels and
          their times are listed here as well as in the hover titles. */}
      <ul className="sr-only" aria-label={impactLabel}>
        {bandSegments.map((s) => (
          <li key={s.at}>
            {`${t(`symptoms.impact.${s.impact}`, s.impact)} · ${formatTime(s.at)}`}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{impactLabel}</span>
        {SYMPTOM_IMPACT_LEVELS.map((level) => (
          <span key={level} className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className={cn(
                'inline-block size-2 rounded-sm',
                IMPACT_COLOR[level].bg
              )}
            />
            {t(`symptoms.impact.${level}`, level)}
          </span>
        ))}
      </div>
    </div>
  );
}
