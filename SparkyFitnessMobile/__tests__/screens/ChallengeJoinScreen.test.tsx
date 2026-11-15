import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ChallengeJoinScreen from '../../src/screens/ChallengeJoinScreen';
import { ApiError } from '../../src/services/api/errors';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'ChallengeJoin'>;

const mockJoin = jest.fn();
jest.mock('../../src/hooks/useChallenges', () => ({
  useChallengeMutations: () => ({ joinChallenge: mockJoin, isJoining: false }),
}));
// The Android layout: header and Join drawn by the screen itself.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => false,
}));

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const CODE = 'Ab3_-defghijklmnopqrst';
const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 24, bottom: 48, left: 0, right: 0 };

const renderScreen = (params?: ScreenProps['route']['params']) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <ChallengeJoinScreen
        navigation={mockNavigation}
        route={{ key: 'ChallengeJoin-key', name: 'ChallengeJoin', params }}
      />
    </SafeAreaProvider>
  );

const fill = (code: string, name: string) => {
  fireEvent.changeText(screen.getByLabelText('Invite code'), code);
  fireEvent.changeText(screen.getByLabelText('Your name in it'), name);
};

const pressJoin = async () => {
  await act(async () => {
    fireEvent.press(screen.getByText('Join'));
  });
};

describe('ChallengeJoinScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('joins with the code from a pasted link and opens the challenge', async () => {
    mockJoin.mockResolvedValue({ id: 'c1', name: 'Family Cup' });
    renderScreen();
    fill(`https://fit.example.com/challenges/join?code=${CODE}`, '  Sam ');
    await pressJoin();
    expect(mockJoin).toHaveBeenCalledWith({ code: CODE, display_name: 'Sam' });
    expect(mockNavigation.goBack).toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ChallengeDetail', {
      id: 'c1',
      name: 'Family Cup',
    });
  });

  it('checks the code before asking the server', async () => {
    renderScreen();
    fill('nope', 'Sam');
    await pressJoin();
    expect(
      screen.getByText('Paste the invite code or link you were sent.')
    ).toBeTruthy();
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it('needs a display name', async () => {
    renderScreen({ code: CODE });
    fireEvent.changeText(screen.getByLabelText('Your name in it'), '   ');
    await pressJoin();
    expect(
      screen.getByText('Enter the name other members will see.')
    ).toBeTruthy();
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it.each([
    [404, '{}', 'That code is not valid or has expired.'],
    [
      409,
      JSON.stringify({ error: 'x', code: 'CHALLENGE_FULL' }),
      'This challenge is full.',
    ],
    [
      409,
      JSON.stringify({ error: 'x', code: 'CHALLENGE_ENDED' }),
      'This challenge has ended.',
    ],
    [
      409,
      JSON.stringify({ error: 'x', code: 'CHALLENGE_LATE_JOIN_CLOSED' }),
      'This challenge has started and does not take late joiners.',
    ],
    [409, '{}', 'This challenge cannot be joined right now.'],
    [429, '{}', 'Too many tries. Wait a few minutes and try again.'],
    [500, '{}', 'Could not join the challenge.'],
  ])('explains a %s answer', async (status, body, message) => {
    mockJoin.mockRejectedValueOnce(new ApiError('x', status, body));
    renderScreen({ code: CODE });
    fireEvent.changeText(screen.getByLabelText('Your name in it'), 'Sam');
    await pressJoin();
    expect(screen.getByText(message)).toBeTruthy();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });
});
