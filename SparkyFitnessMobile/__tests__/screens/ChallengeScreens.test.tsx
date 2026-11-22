import React from 'react';
import { challengeRulesSchema } from '@workspace/shared';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ChallengesScreen from '../../src/screens/ChallengesScreen';
import ChallengeDetailScreen from '../../src/screens/ChallengeDetailScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';
import {
  ME,
  makeChallenge,
  makeSharedLeadStandings,
  makeStandings,
} from '../helpers/challengeFixtures';

const mockUseChallenges = jest.fn();
const mockUseChallenge = jest.fn();
const mockUseStandings = jest.fn();
const mockLeave = jest.fn();
jest.mock('../../src/hooks/useChallenges', () => ({
  useChallenges: () => mockUseChallenges(),
  useChallenge: () => mockUseChallenge(),
  useChallengeStandings: (id: string, date: string | null) =>
    mockUseStandings(id, date),
  useChallengeMutations: () => ({
    leaveChallenge: mockLeave,
  }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: (refetch: () => void) => mockUseRefetchOnFocus(refetch),
}));
const mockUseRefetchOnFocus = jest.fn();
jest.mock('../../src/components/ServerGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => '2026-11-14',
}));
// The Android layout: the screen draws its own header.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
  dispatch: jest.fn(),
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 24, bottom: 48, left: 0, right: 0 };
const wrap = (node: React.ReactNode) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      {node}
    </SafeAreaProvider>
  );

const listState = (overrides = {}) => ({
  challenges: [],
  isEnabled: true,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
  ...overrides,
});

beforeAll(async () => {
  await initializeI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ChallengesScreen', () => {
  const renderList = () =>
    wrap(
      <ChallengesScreen
        navigation={
          mockNavigation as unknown as RootStackScreenProps<'Challenges'>['navigation']
        }
        route={{ key: 'Challenges-key', name: 'Challenges', params: undefined }}
      />
    );

  it('lists running challenges first and opens one', () => {
    mockUseChallenges.mockReturnValue(
      listState({
        challenges: [
          makeChallenge({
            id: 'old',
            name: 'October',
            start_date: '2026-10-01',
            end_date: '2026-10-31',
          }),
          makeChallenge({ id: 'c1', emoji: '🏆', is_host: true }),
        ],
      })
    );
    renderList();
    const names = screen
      .getAllByText(/October|Family Cup/)
      .map((node) => node.props.children);
    expect(names).toEqual(['🏆 Family Cup', 'October']);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText('Ended')).toBeTruthy();
    expect(screen.getByText('You host')).toBeTruthy();
    expect(screen.getAllByText('Points · Weekly · Leaderboard')).toHaveLength(
      2
    );

    fireEvent.press(screen.getByText('🏆 Family Cup'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ChallengeDetail', {
      id: 'c1',
      name: 'Family Cup',
    });
  });

  it('counts each challenge’s state in its own time zone', () => {
    // Nov 16 in UTC, still Nov 15 in Los Angeles.
    jest.useFakeTimers({ now: new Date('2026-11-16T00:30:00Z') });
    try {
      mockUseChallenges.mockReturnValue(
        listState({
          challenges: [
            makeChallenge({
              id: 'utc',
              name: 'UTC Cup',
              start_date: '2026-11-01',
              end_date: '2026-11-15',
            }),
            makeChallenge({
              id: 'la',
              name: 'LA Cup',
              start_date: '2026-10-01',
              end_date: '2026-11-15',
              time_zone: 'America/Los_Angeles',
            }),
          ],
        })
      );
      renderList();
      const names = screen
        .getAllByText(/UTC Cup|LA Cup/)
        .map((node) => node.props.children);
      expect(names).toEqual(['LA Cup', 'UTC Cup']);
      expect(screen.getByText('Running')).toBeTruthy();
      expect(screen.getByText('Ended')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the loaded list with a retry when a refresh fails', () => {
    const refetch = jest.fn();
    mockUseChallenges.mockReturnValue(
      listState({ challenges: [makeChallenge()], isError: true, refetch })
    );
    renderList();
    expect(screen.getByText('Family Cup')).toBeTruthy();
    expect(screen.getByTestId('challenges-refresh-failed')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('says the list could not load when nothing was loaded', () => {
    mockUseChallenges.mockReturnValue(listState({ isError: true }));
    renderList();
    expect(screen.getByText('Could not load your challenges.')).toBeTruthy();
    expect(screen.queryByTestId('challenges-refresh-failed')).toBeNull();
  });

  it('offers join by code when the user is in none', () => {
    mockUseChallenges.mockReturnValue(listState());
    renderList();
    expect(screen.getByText('No challenges yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Join with a code'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ChallengeJoin');
  });

  it('explains a server without Challenges', () => {
    mockUseChallenges.mockReturnValue(listState({ isEnabled: false }));
    renderList();
    expect(screen.getByText('Challenges are not available')).toBeTruthy();
    expect(screen.queryByText('Join with a code')).toBeNull();
  });
});

describe('ChallengeDetailScreen', () => {
  const renderDetail = () =>
    wrap(
      <ChallengeDetailScreen
        navigation={
          mockNavigation as unknown as RootStackScreenProps<'ChallengeDetail'>['navigation']
        }
        route={{
          key: 'ChallengeDetail-key',
          name: 'ChallengeDetail',
          params: { id: 'c1', name: 'Family Cup' },
        }}
      />
    );

  beforeEach(() => {
    mockUseChallenge.mockReturnValue({
      data: makeChallenge(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseStandings.mockReturnValue({
      data: makeStandings(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('reads the challenge and its standings again on focus', () => {
    const refetches = [mockUseChallenge, mockUseStandings].map((hook) => {
      const refetch = jest.fn();
      hook.mockReturnValue({ ...hook(), refetch });
      return refetch;
    });
    renderDetail();
    const onFocus = mockUseRefetchOnFocus.mock.calls.at(-1)![0] as () => void;
    onFocus();
    for (const refetch of refetches) expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a period in the units of the rules its standings carry', () => {
    // The challenge counts points today; the period shown was scored by steps
    const standings = mockUseStandings();
    mockUseStandings.mockReturnValue({
      ...standings,
      data: makeStandings({
        rules: challengeRulesSchema.parse({ version: 1, metric: 'steps' }),
      }),
    });
    renderDetail();
    expect(screen.getByText('400 steps')).toBeTruthy();
    expect(screen.queryByText('400 pts')).toBeNull();
  });

  it('shows the open week’s standings with the user marked and no trophy', () => {
    renderDetail();
    expect(screen.getByText('Nov 9 to Nov 15')).toBeTruthy();
    expect(
      screen.getByText('So far; late watch syncs still count')
    ).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText('400 pts')).toBeTruthy();
    expect(screen.getByText('Sam (you)')).toBeTruthy();
    expect(screen.getByText('250 pts')).toBeTruthy();
    expect(screen.getByText('180 active min')).toBeTruthy();
    // Nobody has won a week that is still open.
    expect(screen.queryByTestId('icon-trophy')).toBeNull();
  });

  it('puts the places with points on a podium hidden from screen readers, with a bar per row', () => {
    renderDetail();
    const podium = screen.getByTestId('challenge-podium', {
      includeHiddenElements: true,
    });
    expect(podium.props.accessibilityElementsHidden).toBe(true);
    // Sam has 250 of the leader's 400.
    const bar = screen.getByTestId(`challenge-progress-${ME}`);
    expect(bar).toHaveStyle({ width: '63%' });
  });

  it('reads the shown name, detail and winner in each row label', () => {
    mockUseStandings.mockReturnValue({
      ...mockUseStandings(),
      data: makeStandings({ final: true }),
    });
    renderDetail();
    expect(
      screen.getByLabelText('2. Sam (you), 250 pts, 120 active min')
    ).toBeTruthy();
    expect(
      screen.getByLabelText('1. Alex, 400 pts, 180 active min, Winner')
    ).toBeTruthy();
  });

  it('has no podium or row bars for a group goal', () => {
    mockUseStandings.mockReturnValue({
      data: makeStandings({
        rules: challengeRulesSchema.parse({
          version: 1,
          metric: 'steps',
          format: 'group_goal',
          target: 1000,
        }),
      }),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderDetail();
    expect(
      screen.queryByTestId('challenge-podium', { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.queryByTestId(`challenge-progress-${ME}`)).toBeNull();
  });

  it('shows a shared first place for racers who finished the same day', () => {
    mockUseStandings.mockReturnValue({
      data: makeSharedLeadStandings(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    renderDetail();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('Sam (you)')).toBeTruthy();
    expect(screen.queryByTestId('icon-trophy')).toBeNull();
  });

  it('shows no rules line for an earlier period until its own rules are in', () => {
    mockUseStandings.mockImplementation((_id: string, date: string | null) => ({
      data: date === null ? makeStandings() : undefined,
      isLoading: date !== null,
      isError: false,
      refetch: jest.fn(),
    }));
    renderDetail();
    expect(
      screen.getAllByText('Points · Weekly · Leaderboard').length
    ).toBeGreaterThan(0);
    fireEvent.press(screen.getByLabelText('Previous period'));
    // Today's rules may not be the ones that scored last week
    expect(screen.queryByText('Points · Weekly · Leaderboard')).toBeNull();
  });

  it('steps back to the previous week and forward again', () => {
    // Saturday Nov 14, inside the current week (Nov 9 to 15).
    jest.useFakeTimers({
      now: new Date('2026-11-14T12:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    const lastWeek = makeStandings({
      period_start: '2026-11-02',
      period_end: '2026-11-08',
      final: true,
    });
    mockUseStandings.mockImplementation((_id: string, date: string | null) => ({
      data: date === '2026-11-08' ? lastWeek : makeStandings(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }));
    renderDetail();
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', null);
    expect(screen.getByLabelText('Next period')).toBeDisabled();

    fireEvent.press(screen.getByLabelText('Previous period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', '2026-11-08');
    expect(screen.getByText('Nov 2 to Nov 8')).toBeTruthy();
    expect(screen.getByText('Final results')).toBeTruthy();
    expect(screen.getAllByTestId('icon-trophy')).toHaveLength(1);
    // The challenge started on Nov 2, so there is no earlier week.
    expect(screen.getByLabelText('Previous period')).toBeDisabled();

    // Next reaches the current week, so the screen follows today again
    // instead of keeping Nov 9 once that week is over.
    fireEvent.press(screen.getByLabelText('Next period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', null);
    jest.useRealTimers();
  });

  it('steps to the next week, not past it, when the current week it holds is from before today', () => {
    // Monday Nov 16: the cached current week (Nov 9 to 15) has ended.
    jest.useFakeTimers({
      now: new Date('2026-11-16T12:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    const twoWeeksBack = makeStandings({
      period_start: '2026-11-02',
      period_end: '2026-11-08',
      final: true,
    });
    mockUseStandings.mockImplementation((_id: string, date: string | null) => ({
      data: date === '2026-11-08' ? twoWeeksBack : makeStandings(),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }));
    renderDetail();
    fireEvent.press(screen.getByLabelText('Previous period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', '2026-11-08');
    fireEvent.press(screen.getByLabelText('Next period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', '2026-11-09');
    jest.useRealTimers();
  });

  it('stops at the final week of a challenge that has ended', () => {
    mockUseChallenge.mockReturnValue({
      data: makeChallenge({ start_date: '2026-10-26', end_date: '2026-11-08' }),
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    const finalWeek = makeStandings({
      period_start: '2026-11-02',
      period_end: '2026-11-08',
      final: true,
    });
    const weekBefore = makeStandings({
      period_start: '2026-10-26',
      period_end: '2026-11-01',
      final: true,
    });
    mockUseStandings.mockImplementation((_id: string, date: string | null) => ({
      data: date === '2026-11-01' ? weekBefore : finalWeek,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    }));
    renderDetail();
    fireEvent.press(screen.getByLabelText('Previous period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', '2026-11-01');
    fireEvent.press(screen.getByLabelText('Next period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', '2026-11-02');
    // The server would answer any later day with this week again.
    expect(screen.getByLabelText('Next period')).toBeDisabled();
  });

  describe('state chip', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([
      // [now (UTC), start, end, chip]
      ['2026-11-14T12:00:00Z', '2026-11-02', '2026-11-23', '10 days left'],
      ['2026-11-14T12:00:00Z', '2026-11-02', '2026-11-14', 'Last day'],
      ['2026-11-14T12:00:00Z', '2026-11-02', null, 'Active'],
      ['2026-11-14T12:00:00Z', '2026-11-19', null, 'Starts in 5 days'],
      ['2026-11-14T12:00:00Z', '2026-11-15', null, 'Starts tomorrow'],
      ['2026-11-14T12:00:00Z', '2026-11-02', '2026-11-13', 'Ended'],
    ])('on %s for %s to %s says "%s"', (now, start_date, end_date, chip) => {
      jest.useFakeTimers({
        now: new Date(now),
        doNotFake: ['nextTick', 'setImmediate'],
      });
      mockUseChallenge.mockReturnValue({
        ...mockUseChallenge(),
        data: makeChallenge({ start_date, end_date }),
      });
      renderDetail();
      expect(screen.getByTestId('challenge-state')).toHaveTextContent(chip);
    });
  });

  it('keeps the last standings with a retry when a refresh fails', () => {
    const refetch = jest.fn();
    mockUseStandings.mockReturnValue({
      data: makeStandings(),
      isLoading: false,
      isError: true,
      refetch,
    });
    renderDetail();
    expect(
      screen.getByText(
        'Could not refresh the standings; showing the last ones loaded.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded challenge with a retry when its refresh fails', () => {
    const refetch = jest.fn();
    mockUseChallenge.mockReturnValue({
      data: makeChallenge(),
      isLoading: false,
      isError: true,
      refetch,
    });
    renderDetail();
    expect(screen.getByTestId('challenge-refresh-failed')).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.queryByText('Could not load this challenge.')).toBeNull();
  });

  it('says so with a retry when the standings never loaded', () => {
    mockUseStandings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    renderDetail();
    expect(screen.getByText('Could not load the standings.')).toBeTruthy();
    expect(
      screen.queryByTestId('challenge-standings-refresh-failed')
    ).toBeNull();
  });

  describe('find box', () => {
    const names = ['Alex', 'Sam', 'José', 'Priya', 'Noah', 'Mia'];
    const sixRows = () => {
      const base = makeStandings();
      return makeStandings({
        rows: names.map((display_name, i) => ({
          ...base.rows[i === 1 ? 1 : 0],
          user_id: `0000000${i}-0000-4000-8000-000000000000`,
          display_name,
          rank: i + 1,
          total: 600 - i * 50,
          me: i === 1 ? true : undefined,
        })),
      });
    };

    it('is not shown for a short list', () => {
      renderDetail();
      expect(screen.queryByTestId('challenge-standings-find')).toBeNull();
    });

    it('finds a member without minding accents or case, and says when none match', () => {
      mockUseStandings.mockReturnValue({
        ...mockUseStandings(),
        data: sixRows(),
      });
      renderDetail();
      const box = screen.getByTestId('challenge-standings-find');
      fireEvent.changeText(box, 'jose');
      expect(screen.getByText('José')).toBeTruthy();
      expect(screen.queryByText('Priya')).toBeNull();
      fireEvent.changeText(box, 'zed');
      expect(screen.getByText('No member matches “zed”.')).toBeTruthy();
    });

    it('stays while a search is on after a refresh shortens the list', () => {
      mockUseStandings.mockReturnValue({
        ...mockUseStandings(),
        data: sixRows(),
      });
      const view = renderDetail();
      fireEvent.changeText(screen.getByTestId('challenge-standings-find'), 'a');
      mockUseStandings.mockReturnValue({
        ...mockUseStandings(),
        data: makeStandings(),
      });
      view.rerender(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <ChallengeDetailScreen
            navigation={
              mockNavigation as unknown as RootStackScreenProps<'ChallengeDetail'>['navigation']
            }
            route={{
              key: 'ChallengeDetail-key',
              name: 'ChallengeDetail',
              params: { id: 'c1', name: 'Family Cup' },
            }}
          />
        </SafeAreaProvider>
      );
      expect(screen.getByTestId('challenge-standings-find').props.value).toBe(
        'a'
      );
    });

    it('starts empty on another period', () => {
      const lastWeek = {
        ...sixRows(),
        period_start: '2026-11-02',
        period_end: '2026-11-08',
      };
      mockUseStandings.mockImplementation(
        (_id: string, date: string | null) => ({
          data: date === '2026-11-08' ? lastWeek : sixRows(),
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        })
      );
      renderDetail();
      fireEvent.changeText(
        screen.getByTestId('challenge-standings-find'),
        'zed'
      );
      fireEvent.press(screen.getByLabelText('Previous period'));
      expect(screen.getByTestId('challenge-standings-find').props.value).toBe(
        ''
      );
      expect(screen.getByText('Priya')).toBeTruthy();
    });
  });

  it('leaves after confirming and goes back', async () => {
    mockLeave.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert');
    renderDetail();
    fireEvent.press(screen.getByLabelText('More actions'));
    fireEvent.press(screen.getByText('Leave challenge'));
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')!.onPress!();
    });
    expect(mockLeave).toHaveBeenCalledWith('c1');
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});
