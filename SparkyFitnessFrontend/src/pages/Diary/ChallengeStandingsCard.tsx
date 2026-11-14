import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ChallengeSummary } from '@workspace/shared';
import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import ChallengeStandingsPreview from '@/pages/Challenges/ChallengeStandingsPreview';
import { challengesForCard } from '@/pages/Challenges/challengeCopy';

/**
 * "Challenge standings" on the Diary: the current standings of the person's
 * challenges. The Diary only registers it while Challenges are on, the
 * person is on their own account and is in at least one challenge.
 */
const ChallengeStandingsCard = ({
  challenges,
}: {
  challenges: readonly ChallengeSummary[];
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const shown = challengesForCard(challenges);
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base dark:text-slate-300">
          <Trophy className="w-4 h-4 mr-2" />
          {t('challenges.widget.title', 'Challenge standings')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-3 dark:text-slate-300">
        {shown.map((c) => (
          <div key={c.id} className="space-y-1">
            <Link
              to={`/challenges/${c.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {c.emoji ? `${c.emoji} ` : ''}
              {c.name}
            </Link>
            <ChallengeStandingsPreview challenge={c} currentUserId={user?.id} />
          </div>
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
