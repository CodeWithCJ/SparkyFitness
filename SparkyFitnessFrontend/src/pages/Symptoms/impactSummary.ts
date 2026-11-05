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
    return [...entry.impact_timeline].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
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
