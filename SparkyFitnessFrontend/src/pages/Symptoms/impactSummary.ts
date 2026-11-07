import {
  SYMPTOM_IMPACT_LEVELS,
  episodeImpactPoints,
  type SymptomEntryResponse,
  type SymptomImpact,
} from '@workspace/shared';

type ImpactSource = Pick<
  SymptomEntryResponse,
  'impact' | 'impact_timeline' | 'started_at' | 'logged_at'
>;

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
