import React from 'react';
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
const mockUseRuleChanges = jest.fn();
jest.mock('../../../src/hooks/useChallenges', () => ({
  useChallenges: () => mockUseChallenges(),
  useChallengesStandings: (ids: string[], date: string) =>
    mockUseStandings(ids, date),
  useChallengesRuleChanges: () => mockUseRuleChanges(),
}));

jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View /> };
});

const navigation = { navigate: jest.fn() };
const DAY = '2026-11-14';

const renderCard = () =>
  render(
    <ChallengesCard navigation={navigation as never} selectedDate={DAY} />
  );

describe('ChallengesCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStandings.mockReturnValue({
      byId: new Map([['c1', makeStandings()]]),
      isLoading: false,
    });
    mockUseRuleChanges.mockReturnValue({
      byId: new Map([['c1', []]]),
      isLoading: false,
      isError: false,
      retry: jest.fn(),
    });
  });

  it('shows no total until the challenge’s rule log is read', () => {
    mockUseRuleChanges.mockReturnValue({
      byId: new Map(),
      isLoading: true,
      isError: false,
      retry: jest.fn(),
    });
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(screen.queryByText(/250 pts|400 pts/)).toBeNull();
    expect(screen.queryByTestId('challenges-card-retry-c1')).toBeNull();
  });

  it('offers a retry when the rule log could not be read', () => {
    const retry = jest.fn();
    mockUseRuleChanges.mockReturnValue({
      byId: new Map(),
      isLoading: false,
      isError: true,
      retry,
    });
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(screen.queryByText(/250 pts|400 pts/)).toBeNull();
    fireEvent.press(
      screen.getByText('Could not load the score. Tap to retry.')
    );
    expect(retry).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows the user’s place and the leader for the selected day', () => {
    mockUseChallenges.mockReturnValue({ challenges: [makeChallenge()] });
    renderCard();
    expect(mockUseStandings).toHaveBeenCalledWith(['c1'], DAY);
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

  it('is hidden when no challenge is running that day', () => {
    mockUseChallenges.mockReturnValue({
      challenges: [makeChallenge({ start_date: '2026-12-01' })],
    });
    const { toJSON } = renderCard();
    expect(toJSON()).toBeNull();
  });
});
