import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FooterSaveBar } from '../../src/components/FormScreenChrome';

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderBar = (props: React.ComponentProps<typeof FooterSaveBar>) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <FooterSaveBar {...props} />
    </SafeAreaProvider>,
  );

/**
 * Regression cover for #2191: when the JS thread has been blocked, the touch
 * events queued behind it are delivered back to back. `disabled`/`busy` are
 * React state and have not committed yet at that point, so without a
 * synchronous guard every queued press fires the save again — which is how one
 * Save press produced half a dozen identical food entries.
 */
describe('FooterSaveBar duplicate-press guard', () => {
  const pressSaveTimes = (n: number) => {
    const button = screen.getByText('Add Food');
    for (let i = 0; i < n; i++) fireEvent.press(button);
  };

  test('a burst of queued presses invokes the handler once', () => {
    const onPress = jest.fn();
    renderBar({ label: 'Add Food', onPress });

    pressSaveTimes(5);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a press after the guard window is honoured — the button is not dead', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      const onPress = jest.fn();
      renderBar({ label: 'Add Food', onPress });

      pressSaveTimes(3);
      expect(onPress).toHaveBeenCalledTimes(1);

      // The handler never reported a pending state, so a latch keyed on `busy`
      // would have left the button permanently dead here.
      jest.setSystemTime(new Date('2026-08-21T03:00:02Z'));
      pressSaveTimes(1);

      expect(onPress).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('still respects the disabled prop', () => {
    const onPress = jest.fn();
    renderBar({ label: 'Add Food', onPress, disabled: true });

    pressSaveTimes(3);

    expect(onPress).not.toHaveBeenCalled();
  });
});
