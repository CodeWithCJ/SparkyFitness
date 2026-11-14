import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  buildChallengeWeekNotices,
  challengeDaysLabel,
  challengeRulesSummary,
  challengeState,
  formatChallengeValue,
  isLeading,
  ownStanding,
  parseInviteCode,
  showsTrophy,
  sortChallenges,
  standingsLeader,
  weekLeaderNotificationDate,
  type ChallengeUnits,
} from '../../src/utils/challenges';
import {
  FRIEND,
  ME,
  makeChallenge,
  makeSharedLeadStandings,
  makeStandings,
  standingsSeenBy,
} from '../helpers/challengeFixtures';

const t = i18n.t.bind(i18n);
const KM: ChallengeUnits = { distanceUnit: 'km', energyUnit: 'kcal' };
const MILES: ChallengeUnits = { distanceUnit: 'miles', energyUnit: 'kcal' };
const CODE = 'Ab3_-defghijklmnopqrst';

beforeAll(async () => {
  await initializeI18n('en');
});

describe('formatChallengeValue', () => {
  it('formats each metric in its unit', () => {
    expect(formatChallengeValue(412.25, 'points', KM, t)).toBe('412.3 pts');
    expect(formatChallengeValue(12345, 'steps', KM, t)).toBe('12,345 steps');
    expect(formatChallengeValue(95.4, 'active_minutes', KM, t)).toBe('95 min');
    expect(formatChallengeValue(42195, 'distance', KM, t)).toBe('42.2 km');
    expect(formatChallengeValue(42195, 'distance', MILES, t)).toBe('26.2 mi');
    expect(formatChallengeValue(1, 'workout_days', KM, t)).toBe('1 day');
    expect(formatChallengeValue(4, 'workout_days', KM, t)).toBe('4 days');
    expect(formatChallengeValue(350, 'active_calories', KM, t)).toBe(
      '350 kcal'
    );
    expect(formatChallengeValue(100, 'elevation', KM, t)).toBe('100 m');
    expect(formatChallengeValue(100, 'elevation', MILES, t)).toBe('328 ft');
  });
});

describe('rules summary', () => {
  it('names metric, period and format, and the days when not all count', () => {
    const allDays = makeChallenge();
    expect(challengeRulesSummary(allDays.rules, t, 'en-US')).toBe(
      'Points · Weekly · Leaderboard'
    );
    const workweek = makeChallenge({
      rules: { version: 1, metric: 'steps', period: 'week', days: [5, 1, 2] },
    });
    expect(challengeRulesSummary(workweek.rules, t, 'en-US')).toBe(
      'Steps · Weekly · Leaderboard · Mon, Tue, Fri'
    );
    expect(challengeDaysLabel([1, 2, 3, 4, 5, 6, 7], 'en-US')).toBeNull();
  });
});

describe('challengeState and sortChallenges', () => {
  it('tells running, upcoming and ended apart and sorts running first', () => {
    const running = makeChallenge({ id: 'run', start_date: '2026-11-02' });
    const upcoming = makeChallenge({ id: 'up', start_date: '2026-12-01' });
    const ended = makeChallenge({
      id: 'end',
      start_date: '2026-10-01',
      end_date: '2026-10-31',
    });
    const closed = makeChallenge({
      id: 'closed',
      ended_at: '2026-11-05T00:00:00Z',
    });
    const today = '2026-11-14';
    expect(challengeState(running, today)).toBe('running');
    expect(challengeState(upcoming, today)).toBe('upcoming');
    expect(challengeState(ended, today)).toBe('ended');
    expect(challengeState(closed, today)).toBe('ended');
    expect(
      sortChallenges([ended, upcoming, running], today).map((c) => c.id)
    ).toEqual(['run', 'up', 'end']);
  });
});

describe('parseInviteCode', () => {
  it('takes the bare code, or the code at the end of a pasted link', () => {
    expect(parseInviteCode(`  ${CODE} `)).toBe(CODE);
    expect(
      parseInviteCode(
        `Join me: https://fit.example.com/challenges/join?code=${CODE}`
      )
    ).toBe(CODE);
    expect(parseInviteCode('short')).toBeNull();
    expect(parseInviteCode('')).toBeNull();
  });
});

describe('standings helpers', () => {
  it('finds the user by the server’s `me` flag and the leader by rank', () => {
    const { rows } = makeStandings();
    expect(ownStanding(rows)?.user_id).toBe(ME);
    expect(ownStanding(rows.map(({ me: _me, ...r }) => r))).toBeNull();
    expect(standingsLeader(rows)?.user_id).toBe(FRIEND);
    expect(standingsLeader(rows.map((r) => ({ ...r, total: 0 })))).toBeNull();
    expect(isLeading(ownStanding(rows))).toBe(false);
    expect(
      isLeading(ownStanding(standingsSeenBy(makeStandings(), FRIEND).rows))
    ).toBe(true);
  });

  it('lets racers who finished the same day share the lead', () => {
    const { rows } = makeSharedLeadStandings();
    expect(standingsLeader(rows)?.user_id).toBe(FRIEND);
    expect(isLeading(ownStanding(rows))).toBe(true);
  });

  it('gives a trophy only to the winner of a final period', () => {
    const open = makeStandings();
    expect(open.rows.some((r) => showsTrophy(open, r))).toBe(false);
    const final = makeStandings({ final: true });
    expect(final.rows.filter((r) => showsTrophy(final, r))).toEqual([
      final.rows[0],
    ]);
    // A winner flag on an open period (an older server) earns nothing.
    expect(showsTrophy(open, { ...open.rows[0], winner: true })).toBe(false);
  });
});

describe('weekLeaderNotificationDate', () => {
  const weekly = makeChallenge().rules;
  const standings = makeStandings();

  it('is 8 PM device time on the last day of the week', () => {
    const fireAt = weekLeaderNotificationDate(
      weekly,
      standings,
      new Date(2026, 10, 14, 9, 0)
    );
    expect(fireAt).toEqual(new Date(2026, 10, 15, 20, 0, 0));
  });

  it('is null once past, for a frozen week, or for another period', () => {
    expect(
      weekLeaderNotificationDate(weekly, standings, new Date(2026, 10, 15, 21))
    ).toBeNull();
    expect(
      weekLeaderNotificationDate(
        weekly,
        { ...standings, final: true },
        new Date(2026, 10, 14)
      )
    ).toBeNull();
    expect(
      weekLeaderNotificationDate(
        { period: 'month' },
        standings,
        new Date(2026, 10, 14)
      )
    ).toBeNull();
  });
});

describe('buildChallengeWeekNotices', () => {
  const now = new Date(2026, 10, 14, 9, 0);
  const today = '2026-11-14';

  it('names the leader and the user’s own place', () => {
    const challenge = makeChallenge({ emoji: '🏆' });
    const notices = buildChallengeWeekNotices(
      [challenge],
      new Map([[challenge.id, makeStandings()]]),
      KM,
      t,
      now,
      today
    );
    expect(notices).toEqual([
      {
        challengeId: 'c1',
        challengeName: '🏆 Family Cup',
        fireAt: new Date(2026, 10, 15, 20, 0, 0),
        leaderName: 'Alex',
        leaderTotal: '400 pts',
        leaderIsMe: false,
        own: { rank: 2, total: '250 pts' },
      },
    ]);
  });

  it('says when the user leads, and skips weeks nobody has scored in', () => {
    const challenge = makeChallenge();
    const [lead] = buildChallengeWeekNotices(
      [challenge],
      new Map([[challenge.id, standingsSeenBy(makeStandings(), FRIEND)]]),
      KM,
      t,
      now,
      today
    );
    expect(lead.leaderIsMe).toBe(true);
    expect(lead.own).toBeNull();

    // A shared first place reads as "You lead", never as a win.
    const [shared] = buildChallengeWeekNotices(
      [challenge],
      new Map([[challenge.id, makeSharedLeadStandings()]]),
      KM,
      t,
      now,
      today
    );
    expect(shared.leaderIsMe).toBe(true);
    expect(shared.own).toBeNull();

    const empty = makeStandings({
      rows: makeStandings().rows.map((r) => ({ ...r, total: 0 })),
    });
    expect(
      buildChallengeWeekNotices(
        [challenge],
        new Map([[challenge.id, empty]]),
        KM,
        t,
        now,
        today
      )
    ).toEqual([]);
  });

  it('skips challenges that are not running or have no standings yet', () => {
    const ended = makeChallenge({ end_date: '2026-11-10' });
    const noData = makeChallenge({ id: 'c2' });
    expect(
      buildChallengeWeekNotices(
        [ended, noData],
        new Map([['c1', makeStandings()]]),
        KM,
        t,
        now,
        today
      )
    ).toEqual([]);
  });
});
