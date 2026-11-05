import {
  SYMPTOM_IMPACT_LEVELS,
  type SymptomEntryResponse,
  type SymptomImpact,
} from '@workspace/shared';

type ImpactSource = Pick<
  SymptomEntryResponse,
  'impact' | 'started_at' | 'logged_at'
> & {
  /** Missing on servers that predate it; the current impact stands in. */
  impact_timeline?: readonly { at: string; impact: SymptomImpact }[];
};

/**
 * The effect on the day over an episode, oldest first. A server without
 * impact_timeline still sends the current impact, which counts from the start.
 */
export function episodeImpactPoints(
  entry: ImpactSource
): { at: string; impact: SymptomImpact }[] {
  if (entry.impact_timeline && entry.impact_timeline.length > 0) {
    // A time JavaScript cannot parse keeps its place instead of breaking the sort.
    return [...entry.impact_timeline].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at) || 0
    );
  }
  if (entry.impact == null) return [];
  return [
    {
      at: entry.started_at ?? entry.logged_at,
      impact: entry.impact,
    },
  ];
}

/** The strongest effect on the day during the episode, or null if none was recorded. */
export function peakImpact(entry: ImpactSource): SymptomImpact | null {
  let peak: SymptomImpact | null = null;
  for (const { impact } of episodeImpactPoints(entry)) {
    if (
      peak === null ||
      SYMPTOM_IMPACT_LEVELS.indexOf(impact) >
        SYMPTOM_IMPACT_LEVELS.indexOf(peak)
    ) {
      peak = impact;
    }
  }
  return peak;
}

/**
 * The timeline for a CSV cell: `<ISO time> <level>`, oldest first, joined by
 * `; `. A time JavaScript cannot parse is written as stored, so one odd value
 * does not stop the export.
 */
export function impactTimelineText(entry: ImpactSource): string {
  return episodeImpactPoints(entry)
    .map((p) => {
      const time = Date.parse(p.at);
      const at = Number.isNaN(time) ? p.at : new Date(time).toISOString();
      return `${at} ${p.impact}`;
    })
    .join('; ');
}
