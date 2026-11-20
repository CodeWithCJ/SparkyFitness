import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Flag,
  Search,
  Trophy,
} from 'lucide-react';
import {
  challengeToday,
  leadsChallenge,
  standingProgress,
  type ChallengeDetail,
  type ChallengeStandingsResponse,
} from '@workspace/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { getInitials } from '@/utils/settings';
import LoadError from './LoadError';
import { metricValueText, type MetricUnits } from './challengeCopy';
import {
  nextPeriodDay,
  periodRangeText,
  previousPeriodDay,
} from './challengePeriods';

export type StandingRow = ChallengeStandingsResponse['rows'][number];

// Gold, silver and bronze for places 1 to 3, on the podium and in the table.
const PLACE_COLORS = [
  'bg-amber-400 text-amber-950',
  'bg-slate-300 text-slate-900',
  'bg-orange-400 text-orange-950',
];
const PLACE_TEXT = [
  'text-amber-600 dark:text-amber-400',
  'text-slate-500 dark:text-slate-300',
  'text-orange-600 dark:text-orange-400',
];
// Shows the find box once the table is longer than a glance.
const SEARCH_FROM_ROWS = 6;
// Block heights by place, so members tied on a place stand level.
const PLACE_HEIGHTS = ['h-24', 'h-16', 'h-12'];

/** Lower case without accents, so "jose" finds "José". */
const foldName = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const MemberAvatar = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => (
  <Avatar className={cn('h-8 w-8', className)} aria-hidden>
    <AvatarFallback className="text-xs font-medium">
      {getInitials(name)}
    </AvatarFallback>
  </Avatar>
);

/**
 * The first three places with something on the board, second on the left,
 * first in the middle and third on the right. The table below carries the
 * same names for screen readers, so this is hidden from them.
 */
const Podium = ({
  rows,
  final,
  value,
}: {
  rows: StandingRow[];
  final: boolean;
  value: (n: number) => string;
}) => {
  const top = rows.filter((row) => row.total > 0).slice(0, 3);
  if (top.length === 0) return null;
  const order = [top[1], top[0], top[2]];
  return (
    <div
      className="flex items-end justify-center gap-3 pt-2"
      aria-hidden
      data-testid="challenge-podium"
    >
      {order.map((row, i) => {
        if (!row) return <div key={i} className="w-24" />;
        const place = Math.min(row.rank, 3) - 1;
        const crowned = final ? row.winner : leadsChallenge(row);
        return (
          <div
            key={row.user_id}
            className="flex w-24 flex-col items-center gap-1 text-center"
          >
            {crowned && <Crown className="h-5 w-5 text-amber-500" />}
            <MemberAvatar
              name={row.display_name}
              className={cn(i === 1 ? 'h-14 w-14' : 'h-11 w-11')}
            />
            <span className="w-full truncate text-sm font-medium">
              {row.display_name}
            </span>
            <span className="text-xs text-muted-foreground">
              {value(row.total)}
            </span>
            <div
              className={cn(
                'flex w-full items-center justify-center rounded-t-lg text-xl font-bold',
                PLACE_HEIGHTS[place],
                PLACE_COLORS[place]
              )}
            >
              {row.rank}
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
  const [search, setSearch] = useState('');
  // A query typed in one period does not carry to the next, whose table may
  // be too short to show the find box that would clear it.
  const goTo = (next: string | null) => {
    setDay(next);
    setSearch('');
  };
  const standings = useChallengeStandings(challenge.id, day);
  const today = challengeToday(challenge.time_zone);
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
  const topTotal = data?.rows[0]?.total ?? 0;
  const showsProgress = rules.format !== 'group_goal';
  const query = foldName(search.trim());
  const rows =
    data?.rows.filter((row) => foldName(row.display_name).includes(query)) ??
    [];

  return (
    <div className="space-y-3" data-testid="challenge-leaderboard">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={!previous}
          onClick={() => previous && goTo(previous)}
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
            <Button variant="ghost" size="sm" onClick={() => goTo(null)}>
              {t('challenges.leaderboard.current', 'Current')}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            disabled={!next}
            onClick={() => next && goTo(next)}
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
      ) : standings.isError && !data ? (
        <LoadError
          message={t(
            'challenges.errors.standings',
            'Could not load the standings.'
          )}
          onRetry={() => void standings.refetch()}
        />
      ) : !data || data.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('challenges.leaderboard.empty', 'No scores yet in this period.')}
        </p>
      ) : (
        <div className="space-y-3">
          {showsProgress && (
            <Podium rows={data.rows} final={data.final} value={value} />
          )}
          {data.rows.length >= SEARCH_FROM_ROWS && (
            <div className="relative max-w-xs">
              <Search
                className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('challenges.leaderboard.find', 'Find a member')}
                aria-label={t('challenges.leaderboard.find', 'Find a member')}
                className="pl-8"
              />
            </div>
          )}
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
                {showsProgress && (
                  <TableHead className="hidden w-40 md:table-cell">
                    {t('challenges.leaderboard.progress', 'Progress')}
                  </TableHead>
                )}
                {showsMinutes && (
                  <TableHead className="hidden text-right sm:table-cell">
                    {t('challenges.leaderboard.minutes', 'Active min')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const progress = standingProgress(rules, row, topTotal);
                const percent = progress
                  ? Math.round(progress.fraction * 100)
                  : 0;
                return (
                  <TableRow
                    key={row.user_id}
                    className={cn('cursor-pointer', row.me && 'bg-accent/50')}
                    onClick={() => onSelectMember(row, data.period_start)}
                  >
                    <TableCell
                      className={cn(
                        'font-semibold',
                        row.total > 0 && PLACE_TEXT[row.rank - 1]
                      )}
                    >
                      {row.rank}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={row.display_name} />
                        <div>
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
                            {!data.final && leadsChallenge(row) && (
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
                                  {
                                    hit: row.days_hit,
                                    eligible: row.days_eligible,
                                  }
                                )}
                              </span>
                            )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {value(row.total)}
                    </TableCell>
                    {showsProgress && (
                      <TableCell className="hidden md:table-cell">
                        {progress && (
                          <div className="flex items-center gap-2">
                            <Progress
                              value={percent}
                              className="h-2"
                              aria-label={
                                progress.basis === 'leader'
                                  ? t(
                                      'challenges.leaderboard.ofLeader',
                                      '{{percent}}% of the top total',
                                      { percent }
                                    )
                                  : progress.basis === 'days'
                                    ? t(
                                        'challenges.leaderboard.ofDays',
                                        'Goal hit on {{percent}}% of days',
                                        { percent }
                                      )
                                    : t(
                                        'challenges.leaderboard.ofTarget',
                                        '{{percent}}% of the goal',
                                        { percent }
                                      )
                              }
                            />
                            {progress.basis !== 'leader' && (
                              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                                {percent}%
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {showsMinutes && (
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {Math.round(row.minutes)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('challenges.leaderboard.noMatch', 'No member matches.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ChallengeLeaderboard;
