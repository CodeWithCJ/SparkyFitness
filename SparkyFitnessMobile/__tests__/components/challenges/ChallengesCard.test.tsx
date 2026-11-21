import React from 'react';
import { challengeRulesSchema } from '@workspace/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ChallengesCard from '../../../src/components/challenges/ChallengesCard';
import { initializeI18n } from '../../../src/localization/i18n';
import {
  FRIEND,
  makeChallenge,
  makeSharedLeadStandings,
  makeStandings,
  standingsSeenBy,
} from '../../helpers/challengeFixtures';

const mockUseChallenges = jest.fn();
const mockUseStandings = jest.fn();
jest.mock('../../../src/hooks/useChallenges', () => ({
  useChallenges: () => mockUseChallenges(),
  useChallengesStandings: (
    ids: string[],
    date: string | null,
    options?: { poll?: boolean }
  ) => mockUseStandings(ids, date, options),
}));

jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

const navigation = { navigate: jest.fn() };
// Midday UTC on Saturday 2026-11-14; the fixtures' challenges are in UTC.
const NOW = new Date('2026-11-14T12:00:00Z');

const renderCard = () =>
  render(<ChallengesCard navigation={navigation as never} />);

describe('ChallengesCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStandings.mockReturnValue({
      byId: new Map([['c1', makeStandings()]]),
      failedIds: new Set(),
      isLoading: false,
    });
  });

  it('shows totals in the units of the rules that scored the period, sent with its standings', () => {
    // The challenge counts points today; the period shown was scored by steps
    mockUseStandings.mockReturnValue({
      byId: new Map([
        [
          'c1',
          makeStandings({
            rules: challengeRulesSchema.parse({ version: 1, metric: 'steps' }),
          }),
        ],
      ]),
      failedIds: new Set(),
      isLoading: false,
    });
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(screen.getByText('#2 of 2 · 250 steps')).toBeTruthy();
    expect(screen.getByText('Alex leads with 400 steps')).toBeTruthy();
  });

  it('shows the user’s place and the leader in the current period', () => {
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    // The server's today picks the period, as on the web card.
    expect(mockUseStandings).toHaveBeenCalledWith(['c1'], null, {
      poll: true,
    });
    expect(screen.getByText('#2 of 2 · 250 pts')).toBeTruthy();
    expect(screen.getByText('Alex leads with 400 pts')).toBeTruthy();
    fireEvent.press(screen.getByTestId('challenges-card-row-c1'));
    expect(navigation.navigate).toHaveBeenCalledWith('ChallengeDetail', {
      id: 'c1',
      name: 'Family Cup',
    });
  });

  it('says so when the user leads', () => {
    mockUseStandings.mockReturnValue({
      byId: new Map([['c1', standingsSeenBy(makeStandings(), FRIEND)]]),
      isLoading: false,
    });
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(screen.getByText('#1 of 2 · 400 pts')).toBeTruthy();
    expect(screen.getByText('You lead')).toBeTruthy();
  });

  it('says "You lead" on a shared first place', () => {
    mockUseStandings.mockReturnValue({
      byId: new Map([['c1', makeSharedLeadStandings()]]),
      isLoading: false,
    });
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(screen.getByText('You lead')).toBeTruthy();
    expect(screen.queryByText(/leads with/)).toBeNull();
  });

  it('lists an upcoming challenge after the running ones, with when it starts', () => {
    mockUseChallenges.mockReturnValue({
      challenges: [
        makeChallenge({
          id: 'c2',
          name: 'Winter Cup',
          start_date: '2026-11-19',
        }),
        makeChallenge(),
      ],
    });
    renderCard();
    // Standings are read for the running challenge only.
    expect(mockUseStandings).toHaveBeenCalledWith(['c1'], null, {
      poll: true,
    });
    expect(screen.getByText('Starts in 5 days')).toBeTruthy();
    const rows = screen.getAllByTestId(/^challenges-card-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'challenges-card-row-c1',
      'challenges-card-row-c2',
    ]);
  });

  it('says "Starts tomorrow" rather than a count of 1', () => {
    mockUseChallenges.mockReturnValue({
      challenges: [makeChallenge({ start_date: '2026-11-15' })],
    });
    renderCard();
    expect(screen.getByText('Starts tomorrow')).toBeTruthy();
  });

  it('shows at most three challenges', () => {
    mockUseChallenges.mockReturnValue({
      challenges: ['a', 'b', 'c', 'd'].map((id) =>
        makeChallenge({ id, name: id })
      ),
    });
    renderCard();
    expect(screen.getAllByTestId(/^challenges-card-row-/)).toHaveLength(3);
  });

  it('says so when a challenge’s standings failed to load', () => {
    mockUseStandings.mockReturnValue({
      byId: new Map(),
      failedIds: new Set(['c1']),
      isLoading: false,
    });
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(screen.getByText('Could not load the standings.')).toBeTruthy();
  });

  it('is hidden when every challenge has ended', () => {
    mockUseChallenges.mockReturnValue({
      challenges: [makeChallenge({ end_date: '2026-11-13' })],
    });
    const { toJSON } = renderCard();
    expect(toJSON()).toBeNull();
  });
});
