import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';



jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    goBack: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, defaultValue?: string) => defaultValue ?? key }),
}));

// Custom (non-native) path, so the header renders as Pressables we can press.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
  useNativeIOSTabsActive: () => false,
}));

/**
 * Regression cover for #2191, header half.
 *
 * `kind: 'primary'` is the Save sugar, and 17 screens expose their only Save
 * through it. Those presses dispatch straight through the hook's handler map,
 * so a burst of taps replayed off a blocked JS thread ran the handler once per
 * tap — screen-local isPending checks do not help, because every queued press
 * sees the previous render's closure.
 */
describe('useScreenHeader duplicate-press guard', () => {
  const Harness: React.FC<{
    onPress: () => void;
    kind?: 'primary' | 'icon' | 'left-primary';
  }> = ({ onPress, kind = 'primary' }) => {
    const header = useScreenHeader({
      title: 'Test',
      ...(kind === 'left-primary'
        ? { left: { kind: 'primary' as const, label: 'Back', onPress, identifier: 'back' } }
        : {}),
      right:
        kind === 'left-primary'
          ? null
          : kind === 'primary'
            ? [{ kind: 'primary', label: 'Save', onPress, identifier: 'save' }]
            : [
                {
                  kind: 'icon',
                  sfSymbol: 'star',
                  ionicon: 'star',
                  onPress,
                  accessibilityLabel: 'Star',
                  identifier: 'star',
                },
              ],
    });
    return <>{header}</>;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('a burst of queued presses on the header Save invokes the handler once', () => {
    const onPress = jest.fn();
    render(<Harness onPress={onPress} />);

    const button = screen.getByText('Save');
    for (let i = 0; i < 5; i++) fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a press after the guard window is honoured — the button is not dead', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      const onPress = jest.fn();
      render(<Harness onPress={onPress} />);

      const button = screen.getByText('Save');
      fireEvent.press(button);
      jest.setSystemTime(new Date('2026-08-21T03:00:01Z'));
      fireEvent.press(button);

      expect(onPress).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a left-slot primary is navigation, not a write, and stays unguarded', () => {
    // CycleOnboardingScreen uses the primary sugar for a 4-step wizard Back.
    // Rapid repeated presses there are exactly what the user means — throttling
    // them would strand the user a step per guard window.
    const onPress = jest.fn();
    render(<Harness onPress={onPress} kind="left-primary" />);

    const button = screen.getByText('Back');
    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(3);
  });

  test('non-primary header actions keep their existing behaviour', () => {
    // Deliberately unguarded: only the Save sugar carries the duplicate-write
    // risk, and a 700ms window on menus, dismiss or toggles would swallow
    // presses users legitimately repeat.
    const onPress = jest.fn();
    render(<Harness onPress={onPress} kind="icon" />);

    const button = screen.getByLabelText('Star');
    fireEvent.press(button);
    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(2);
  });
});
