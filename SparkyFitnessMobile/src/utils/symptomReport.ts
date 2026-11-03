import {
  severityChartWindow,
  symptomEntryDays,
  type SymptomDayWindow,
  type SymptomEntryResponse,
  type SymptomFreeDayResponse,
  type SymptomImpact,
} from '@workspace/shared';

const pad = (n: number) => String(n).padStart(2, '0');

export interface MonthGrid {
  /** Blank cells before day 1, Monday-first. */
  offset: number;
  /** Day count in the month. */
  count: number;
  first: string;
  last: string;
}

/** Calendar-day arithmetic on plain numbers, so no timezone can shift a date. */
export function monthGrid(year: number, month: number): MonthGrid {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    offset: (firstDay.getUTCDay() + 6) % 7,
    count,
    first: `${year}-${pad(month)}-01`,
    last: `${year}-${pad(month)}-${pad(count)}`,
  };
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}

export type DayTone = 'free' | 'mild' | 'severe' | 'none';

/** The 1-10 scale the web calendar judges every day against. */
const CALENDAR_SCALE_MAX = 10;

export interface DaySummary {
  tone: DayTone;
  /** Entries that cover that day. */
  count: number;
}

/**
 * Per-day tone for the calendar, for the days in `window`. A day an entry
 * covers takes the worst entry's tone (an episode covers every day from its
 * start to its end, or to today while it is still going), a day marked
 * symptom-free (and with no entry) is green, and any other day is absent:
 * unknown, not symptom-free.
 */
export function summarizeDays(
  entries: readonly Pick<
    SymptomEntryResponse,
    | 'entry_date'
    | 'started_at'
    | 'ended_at'
    | 'severity'
    | 'peak_severity'
    | 'source'
  >[],
  freeDays: readonly Pick<SymptomFreeDayResponse, 'entry_date'>[],
  window: SymptomDayWindow
): Map<string, DaySummary> {
  const worst = new Map<string, { ratio: number; count: number }>();
  for (const e of entries) {
    if (e.source === 'cycle') continue;
    const ratio =
      e.severity != null
        ? (e.peak_severity ?? e.severity) / CALENDAR_SCALE_MAX
        : 0.1;
    for (const day of symptomEntryDays(e, window)) {
      const prev = worst.get(day);
      worst.set(day, {
        ratio: Math.max(prev?.ratio ?? 0, ratio),
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  const days = new Map<string, DaySummary>();
  for (const [day, { ratio, count }] of worst) {
    days.set(day, { tone: ratio > 0.67 ? 'severe' : 'mild', count });
  }
  for (const d of freeDays) {
    if (!days.has(d.entry_date)) {
      days.set(d.entry_date, { tone: 'free', count: 0 });
    }
  }
  return days;
}

export interface SeverityChartInput {
  started_at: string | null;
  logged_at: string;
  ended_at: string | null;
  severity: number | null;
  severity_timeline: readonly { at: string; severity: number }[];
  impact?: SymptomImpact | null;
  /** Missing on servers that predate it; the current impact stands in. */
  impact_timeline?: readonly { at: string; impact: SymptomImpact }[];
  treatments: readonly {
    id: string;
    name_snapshot: string;
    taken_at?: string | null;
  }[];
}

export interface SeverityChartLayout {
  points: { x: number; y: number; at: string; severity: number }[];
  /** One section per recorded effect on the day, from its time to the next. */
  band: { x: number; width: number; at: string; impact: SymptomImpact }[];
  marks: { x: number; id: string; name: string }[];
  ticks: { value: number; y: number }[];
  startIso: string;
  endIso: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ChartBox {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

/**
 * Where each reading, treatment marker, gridline and section of the effect
 * band goes. The time span comes from `severityChartWindow`, which the web
 * chart uses too.
 */
export function layoutSeverityChart(
  entry: SeverityChartInput,
  max: number,
  box: ChartBox
): SeverityChartLayout | null {
  const frame = severityChartWindow(entry);
  if (!frame || max <= 0) return null;
  const { start, end, span, startIso } = frame;

  const left = box.padLeft;
  const right = box.width - box.padRight;
  const top = box.padTop;
  const bottom = box.height - box.padBottom;
  const x = (time: number) => left + ((time - start) / span) * (right - left);
  const y = (value: number) => top + (1 - value / max) * (bottom - top);

  const marks = entry.treatments.flatMap((tr) => {
    if (!tr.taken_at) return [];
    const at = new Date(tr.taken_at).getTime();
    return at >= start && at <= end
      ? [{ x: x(at), id: tr.id, name: tr.name_snapshot }]
      : [];
  });

  // At least 2 wide so a level recorded at the very end still shows, and kept
  // inside the plot.
  const band = frame.impact.map((s) => ({
    x: Math.min(x(s.from), right - 2),
    width: Math.max(x(s.to) - x(s.from), 2),
    at: s.at,
    impact: s.impact,
  }));

  return {
    points: frame.points.map((p) => ({
      x: x(new Date(p.at).getTime()),
      y: y(p.severity),
      at: p.at,
      severity: p.severity,
    })),
    band,
    marks,
    ticks: [0, Math.round(max / 2), max].map((value) => ({
      value,
      y: y(value),
    })),
    startIso,
    endIso: new Date(end).toISOString(),
    left,
    right,
    top,
    bottom,
  };
}
