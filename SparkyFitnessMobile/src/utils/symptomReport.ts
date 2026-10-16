import type {
  SymptomEntryResponse,
  SymptomFreeDayResponse,
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
  /** Entries logged that day. */
  count: number;
}

/**
 * Per-day tone for the calendar. A day with an entry takes the worst entry's
 * tone, a day marked symptom-free (and with no entry) is green, and any other
 * day is absent: unknown, not symptom-free.
 */
export function summarizeDays(
  entries: readonly Pick<
    SymptomEntryResponse,
    'entry_date' | 'severity' | 'peak_severity' | 'source'
  >[],
  freeDays: readonly Pick<SymptomFreeDayResponse, 'entry_date'>[]
): Map<string, DaySummary> {
  const worst = new Map<string, { ratio: number; count: number }>();
  for (const e of entries) {
    if (e.source === 'cycle') continue;
    const ratio =
      e.severity != null
        ? (e.peak_severity ?? e.severity) / CALENDAR_SCALE_MAX
        : 0.1;
    const prev = worst.get(e.entry_date);
    worst.set(e.entry_date, {
      ratio: Math.max(prev?.ratio ?? 0, ratio),
      count: (prev?.count ?? 0) + 1,
    });
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
  treatments: readonly {
    id: string;
    name_snapshot: string;
    taken_at?: string | null;
  }[];
}

export interface SeverityChartLayout {
  points: { x: number; y: number; at: string; severity: number }[];
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
 * Where each reading, treatment marker and gridline goes. An episode still
 * running ends at its latest reading (or 30 minutes after the start when there
 * is only one), so the chart never needs the clock.
 */
export function layoutSeverityChart(
  entry: SeverityChartInput,
  max: number,
  box: ChartBox
): SeverityChartLayout | null {
  const startIso = entry.started_at ?? entry.logged_at;
  const timeline =
    entry.severity_timeline.length > 0
      ? entry.severity_timeline
      : entry.severity != null
        ? [{ at: startIso, severity: entry.severity }]
        : [];
  if (timeline.length === 0 || max <= 0) return null;

  const start = new Date(startIso).getTime();
  const lastPoint = Math.max(...timeline.map((p) => new Date(p.at).getTime()));
  const end = entry.ended_at
    ? new Date(entry.ended_at).getTime()
    : Math.max(lastPoint, start + 30 * 60_000);
  const span = Math.max(end - start, 60_000);

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

  return {
    points: timeline.map((p) => ({
      x: x(new Date(p.at).getTime()),
      y: y(p.severity),
      at: p.at,
      severity: p.severity,
    })),
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
