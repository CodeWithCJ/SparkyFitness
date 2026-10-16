import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SymptomEntryResponse } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';
import type { MedicationDetail } from '@/types/medications';
import {
  AddReliefButton,
  EndEpisodeButton,
  UpdateSeverityButton,
} from './EpisodeActions';
import { SEVERITY_BAND_CLASS } from './symptomHelpers';
import {
  formatDuration,
  minutesBetween,
  severityBand,
} from '@workspace/shared';

interface OngoingEpisodeCardProps {
  episodes: SymptomEntryResponse[];
  meds: MedicationDetail[];
  onOpen: (entry: SymptomEntryResponse) => void;
}

/** Re-renders once a minute so a running duration stays current, with no animation. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** One banner per episode that has started and not ended. */
export default function OngoingEpisodeCard({
  episodes,
  meds,
  onOpen,
}: OngoingEpisodeCardProps) {
  const { t } = useTranslation();
  const { formatTime } = usePreferences();
  const now = useMinuteClock();

  if (episodes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {episodes.map((episode) => {
        const startedAt = episode.started_at ?? episode.logged_at;
        const band =
          episode.severity != null
            ? severityBand(episode.severity, '1-10')
            : null;
        return (
          <div
            key={episode.id}
            className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <button
                type="button"
                onClick={() => onOpen(episode)}
                className="min-w-0 truncate text-left text-base font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {episode.symptom_name_snapshot}
                <span className="font-normal text-muted-foreground">
                  {' '}
                  {t('symptoms.episode.ongoing2', '· ongoing')}
                </span>
              </button>
              <span className="shrink-0 tabular-nums text-sm text-primary">
                {formatDuration(minutesBetween(startedAt, new Date(now)))}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {band && episode.severity != null && (
                <Badge
                  variant="secondary"
                  className={cn(
                    'border-none font-semibold',
                    SEVERITY_BAND_CLASS[band]
                  )}
                >
                  {episode.severity}
                </Badge>
              )}
              {episode.body_locations.length > 0 && (
                <span>{episode.body_locations.join(', ')} · </span>
              )}
              <span>
                {t('symptoms.episode.startedAt', 'started {{time}}', {
                  time: formatTime(startedAt),
                })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <UpdateSeverityButton entry={episode} />
              <AddReliefButton entry={episode} meds={meds} />
              <EndEpisodeButton entry={episode} meds={meds} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
