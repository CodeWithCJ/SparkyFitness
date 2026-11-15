import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ChallengesScreen from '../../src/screens/ChallengesScreen';
import ChallengeDetailScreen from '../../src/screens/ChallengeDetailScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';
import {
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
  useChallengeRuleChanges: () => ({ data: undefined }),
  useChallengeMutations: () => ({
    leaveChallenge: mockLeave,
    isLeaving: false,
  }),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
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

  it('steps back to the previous week and forward again', () => {
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

    fireEvent.press(screen.getByLabelText('Next period'));
    expect(mockUseStandings).toHaveBeenLastCalledWith('c1', '2026-11-09');
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
