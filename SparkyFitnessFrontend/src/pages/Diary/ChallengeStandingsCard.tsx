import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { challengesForCard, type ChallengeSummary } from '@workspace/shared';
import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useChallengeStandings,
  useChallengeUnits,
} from '@/hooks/Challenges/useChallenges';
import {
  metricValueText,
  standingsSummary,
} from '@/pages/Challenges/challengeCopy';

/** At most this many challenges on the card. */
const CARD_CHALLENGES_SHOWN = 2;

/** One challenge on the card: your place and who leads this period. */
const ChallengeStandingsLine = ({
  challenge,
}: {
  challenge: ChallengeSummary;
}) => {
  const { t, i18n } = useTranslation();
  const units = useChallengeUnits();
  const standings = useChallengeStandings(challenge.id);
  const { metric } = standings.data?.rules ?? challenge.rules;
  const rows = standings.data?.rows ?? [];
  const summary = standingsSummary(t, rows, (total) =>
    metricValueText(t, metric, total, units, i18n.language)
  );
  return (
    <Link
      to={`/challenges/${challenge.id}`}
      className="block space-y-0.5 rounded px-1 py-1 hover:bg-accent/50"
      data-testid="challenge-standings-line"
    >
      <span className="block truncate text-sm font-medium">
        {challenge.emoji ? `${challenge.emoji} ` : ''}
        {challenge.name}
      </span>
      {standings.isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : standings.isError && !standings.data ? (
        <span className="block text-sm text-destructive">
          {t('challenges.errors.standings', 'Could not load the standings.')}
        </span>
      ) : rows.length === 0 ? (
        <span className="block text-sm text-muted-foreground">
          {t('challenges.leaderboard.empty', 'No scores yet in this period.')}
        </span>
      ) : (
        <>
          <span className="block text-lg font-semibold tabular-nums">
            {summary.place}
          </span>
          {summary.leader && (
            <span className="block text-sm text-muted-foreground">
              {summary.leader}
            </span>
          )}
        </>
      )}
    </Link>
  );
};

/**
 * "Challenge standings" on the Diary: your place and who leads in each of
 * your current challenges. The Diary only registers it while Challenges are
 * on, the person is on their own account and is in at least one challenge.
 */
const ChallengeStandingsCard = ({
  challenges,
}: {
  challenges: readonly ChallengeSummary[];
}) => {
  const { t } = useTranslation();
  const shown = challengesForCard(challenges, CARD_CHALLENGES_SHOWN);
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base dark:text-slate-300">
          <Trophy className="w-4 h-4 mr-2" />
          {t('challenges.widget.title', 'Challenge standings')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3 dark:text-slate-300">
        {shown.map((c) => (
          <ChallengeStandingsLine key={c.id} challenge={c} />
        ))}
        <Link
          to="/challenges"
          className="block text-xs text-muted-foreground hover:underline"
        >
          {t('challenges.widget.all', 'All challenges')}
        </Link>
      </CardContent>
    </Card>
  );
};

export default ChallengeStandingsCard;
