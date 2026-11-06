import type { SymptomImpact } from './constants.ts';

/** The fields of a symptom entry that the severity chart is drawn from. */
export interface SeverityWindowInput {
  started_at?: string | null;
  logged_at: string;
  ended_at?: string | null;
  severity?: number | null;
  severity_timeline: readonly { at: string; severity: number }[];
  impact?: SymptomImpact | null;
  /** Missing on servers that predate it; the current impact stands in. */
  impact_timeline?: readonly { at: string; impact: SymptomImpact }[];
}

/** The fields of a symptom entry its effect on the day is read from. */
export type ImpactPointsInput = Pick<
  SeverityWindowInput,
  'started_at' | 'logged_at' | 'impact' | 'impact_timeline'
>;

/**
 * The effect on the day over an entry, oldest first, shared by the severity
 * charts and the symptom report. A server without impact_timeline still sends
 * the current impact, which counts from the start, the same way a lone severity
 * is drawn. Sorted by time: an effect changed through an edit is appended with
 * the current time, which can come before a reading recorded for later. A time
 * Date cannot parse keeps its place instead of breaking the sort.
 */
export function episodeImpactPoints(
  entry: ImpactPointsInput
): { at: string; impact: SymptomImpact }[] {
  if (entry.impact_timeline && entry.impact_timeline.length > 0) {
    return [...entry.impact_timeline].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at) || 0
    );
  }
  if (entry.impact == null) return [];
  return [{ at: entry.started_at ?? entry.logged_at, impact: entry.impact }];
}

/** One section of the effect-on-the-day band, in milliseconds since the epoch. */
export interface ImpactSection {
  at: string;
  impact: SymptomImpact;
  from: number;
  to: number;
}

/** The time span a severity chart covers, and the sections of its effect band. */
export interface SeverityWindow {
  startIso: string;
  start: number;
  end: number;
  /** `end - start`, at least one minute so a scale never divides by zero. */
  span: number;
  /** Severity readings, or the current severity at the start when there are none. */
  points: { at: string; severity: number }[];
  /** Sorted by time and clamped to `start`..`end`. */
  impact: ImpactSection[];
}

const MINUTE = 60_000;
/** How far a running episode reaches past its last reading. */
const TAIL = 30 * MINUTE;

const time = (iso: string) => new Date(iso).getTime();
const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/**
 * Where the severity chart starts and ends, shared by the web and mobile charts.
 * An episode still running ends at its latest severity reading, and at least 30
 * minutes after its start and after its latest effect, so a change to the effect
 * alone stays in view and the chart never needs the clock. An ended episode ends
 * at `ended_at`; an effect recorded after that is drawn at the end so it still
 * shows. Returns null when there is nothing to draw.
 */
export function severityChartWindow(
  entry: SeverityWindowInput
): SeverityWindow | null {
  const startIso = entry.started_at ?? entry.logged_at;
  const points =
    entry.severity_timeline.length > 0
      ? [...entry.severity_timeline]
      : entry.severity != null
        ? [{ at: startIso, severity: entry.severity }]
        : [];
  if (points.length === 0) return null;

  const impactPoints = episodeImpactPoints(entry);

  const start = time(startIso);
  const lastReading = Math.max(...points.map((p) => time(p.at)));
  const latest = impactPoints[impactPoints.length - 1];
  const lastImpact = latest ? time(latest.at) : start;
  const end = entry.ended_at
    ? time(entry.ended_at)
    : Math.max(lastReading, start + TAIL, lastImpact + TAIL);

  const impact = impactPoints.map((p, i) => {
    const next = impactPoints[i + 1];
    return {
      at: p.at,
      impact: p.impact,
      from: clamp(time(p.at), start, end),
      to: clamp(next ? time(next.at) : end, start, end),
    };
  });

  return {
    startIso,
    start,
    end,
    span: Math.max(end - start, MINUTE),
    points,
    impact,
  };
}
