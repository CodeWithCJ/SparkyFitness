import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import type { ChallengeSummary } from '@workspace/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useChallengeStandings,
  useChallengeUnits,
} from '@/hooks/Challenges/useChallenges';
import { cn } from '@/lib/utils';
import { metricValueText } from './challengeCopy';

/** The top of the current standings, plus the viewer's own place if lower. */
const ChallengeStandingsPreview = ({
  challenge,
  currentUserId,
  top = 3,
}: {
  challenge: ChallengeSummary;
  currentUserId: string | undefined;
  top?: number;
}) => {
  const { t, i18n } = useTranslation();
  const units = useChallengeUnits();
  const standings = useChallengeStandings(challenge.id);
  if (standings.isLoading) return <Skeleton className="h-16 w-full" />;
  const rows = standings.data?.rows ?? [];
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('challenges.leaderboard.empty', 'No scores yet in this period.')}
      </p>
    );
  }
  const shown = rows.slice(0, top);
  const mine = rows.find((r) => r.user_id === currentUserId);
  if (mine && !shown.includes(mine)) shown.push(mine);
  return (
    <ol className="space-y-1 text-sm" data-testid="standings-preview">
      {shown.map((row) => (
        <li
          key={row.user_id}
          className={cn(
            'flex items-center justify-between gap-2 rounded px-1',
            row.user_id === currentUserId && 'bg-accent/50 font-medium'
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="w-6 tabular-nums text-muted-foreground">
              {row.rank}
            </span>
            {row.winner && standings.data?.final && (
              <Crown
                className="h-3 w-3 shrink-0 text-amber-500"
                aria-label={t('challenges.leaderboard.winner', 'Winner')}
              />
            )}
            <span className="truncate">{row.display_name}</span>
          </span>
          <span className="tabular-nums">
            {metricValueText(
              t,
              challenge.rules.metric,
              row.total,
              units,
              i18n.language
            )}
          </span>
        </li>
      ))}
    </ol>
  );
};

export default ChallengeStandingsPreview;
