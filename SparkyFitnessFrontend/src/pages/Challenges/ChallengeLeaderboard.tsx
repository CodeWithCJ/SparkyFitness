import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Flag, Trophy } from 'lucide-react';
import {
  todayInZone,
  type ChallengeDetail,
  type ChallengeStandingsResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useChallengeStandings } from '@/hooks/Challenges/useChallenges';
import { cn } from '@/lib/utils';
import { metricValueText, type MetricUnits } from './challengeCopy';
import {
  nextPeriodDay,
  periodRangeText,
  previousPeriodDay,
} from './challengePeriods';

export type StandingRow = ChallengeStandingsResponse['rows'][number];

interface ChallengeLeaderboardProps {
  challenge: ChallengeDetail;
  units: MetricUnits;
  onSelectMember: (row: StandingRow, periodStart: string) => void;
}

/**
 * The standings of one period, with buttons to step to the period before or
 * after. Scores come from the server; this only lays them out.
 */
const ChallengeLeaderboard = ({
  challenge,
  units,
  onSelectMember,
}: ChallengeLeaderboardProps) => {
  const { t, i18n } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  // null is the current period; otherwise any day of the period shown.
  const [day, setDay] = useState<string | null>(null);
  const standings = useChallengeStandings(challenge.id, day);
  const today = todayInZone(challenge.time_zone);
  const formatDay = (d: string, pattern: string) =>
    formatDateInUserTimezone(d, pattern);

  const data = standings.data;
  // The rules that scored the period shown come with its standings.
  const rules = data?.rules ?? challenge.rules;
  const previous = data
    ? previousPeriodDay(data.period_start, challenge.start_date)
    : null;
  const next = data
    ? nextPeriodDay(data.period_end, challenge.end_date, today)
    : null;
  const value = (n: number) =>
    metricValueText(t, rules.metric, n, units, i18n.language);
  const showsMinutes =
    rules.metric !== 'active_minutes' && rules.metric !== 'hr_zone_minutes';

  return (
    <div className="space-y-3" data-testid="challenge-leaderboard">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={!previous}
          onClick={() => previous && setDay(previous)}
          aria-label={t('challenges.leaderboard.previous', 'Previous period')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-medium">
            {data
              ? periodRangeText(
                  t,
                  rules.period,
                  data.period_start,
                  data.period_end,
                  formatDay
                )
              : '…'}
          </p>
          {data && (
            <Badge variant={data.final ? 'secondary' : 'outline'}>
              {data.final
                ? t('challenges.leaderboard.final', 'Final')
                : t('challenges.leaderboard.live', 'In progress')}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {day !== null && (
            <Button variant="ghost" size="sm" onClick={() => setDay(null)}>
              {t('challenges.leaderboard.current', 'Current')}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            disabled={!next}
            onClick={() => next && setDay(next)}
            aria-label={t('challenges.leaderboard.next', 'Next period')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {rules.format === 'group_goal' && data && rules.target !== null && (
        <div className="space-y-1">
          <p className="text-sm">
            {t(
              'challenges.leaderboard.groupProgress',
              'Together: {{total}} of {{target}}',
              { total: value(data.group_total), target: value(rules.target) }
            )}
          </p>
          <Progress
            value={Math.min(100, (data.group_total / rules.target) * 100)}
          />
          {data.group_reached && (
            <p className="text-sm font-medium">
              {t('challenges.leaderboard.groupReached', 'Goal reached!')}
            </p>
          )}
        </div>
      )}

      {standings.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('challenges.leaderboard.empty', 'No scores yet in this period.')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>
                {t('challenges.leaderboard.member', 'Member')}
              </TableHead>
              <TableHead className="text-right">
                {t('challenges.leaderboard.total', 'Total')}
              </TableHead>
              {showsMinutes && (
                <TableHead className="hidden text-right sm:table-cell">
                  {t('challenges.leaderboard.minutes', 'Active min')}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow
                key={row.user_id}
                className={cn('cursor-pointer', row.me && 'bg-accent/50')}
                onClick={() => onSelectMember(row, data.period_start)}
              >
                <TableCell className="font-medium">{row.rank}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMember(row, data.period_start);
                    }}
                  >
                    {row.winner && data.final && (
                      <Trophy
                        className="h-4 w-4 text-amber-500"
                        aria-label={t(
                          'challenges.leaderboard.winner',
                          'Winner'
                        )}
                      />
                    )}
                    <span>{row.display_name}</span>
                    {!data.final && row.rank === 1 && (
                      <Badge variant="secondary">
                        {t('challenges.leaderboard.leads', 'Leads')}
                      </Badge>
                    )}
                    {row.me && (
                      <Badge variant="outline">
                        {t('challenges.leaderboard.you', 'You')}
                      </Badge>
                    )}
                  </button>
                  {row.reached_on && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Flag className="h-3 w-3" aria-hidden />
                      {t(
                        'challenges.leaderboard.reachedOn',
                        'Reached {{day}}',
                        {
                          day: formatDay(row.reached_on, 'MMM d'),
                        }
                      )}
                    </span>
                  )}
                  {rules.format === 'hit_goal' &&
                    row.days_eligible !== undefined &&
                    row.days_hit !== undefined && (
                      <span className="block text-xs text-muted-foreground">
                        {t(
                          'challenges.leaderboard.daysHit',
                          'Goal hit on {{hit}} of {{eligible}} days',
                          { hit: row.days_hit, eligible: row.days_eligible }
                        )}
                      </span>
                    )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {value(row.total)}
                </TableCell>
                {showsMinutes && (
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {Math.round(row.minutes)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default ChallengeLeaderboard;
