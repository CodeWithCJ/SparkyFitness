import React from 'react';
import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  SET_ACCESSORY_BAR_HEIGHT,
  StickySetInputAccessoryBar,
  useSetEditAccessoryBar,
} from '../../src/components/SetRowChrome';

const frame = { x: 0, y: 0, width: 390, height: 844 };

function withBottomInset(bottom: number, children: React.ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{ insets: { top: 0, right: 0, bottom, left: 0 }, frame }}
    >
      {children}
    </SafeAreaProvider>
  );
}

function EditFormBar() {
  const { accessoryBar } = useSetEditAccessoryBar({
    activeSetKey: 'exercise-1:set-1',
    activeSetField: 'weight',
    onDeactivateSet: () => {},
  });
  return <View>{accessoryBar}</View>;
}

// Parked below the screen edge by its own height, whatever the bottom inset.
const PARKED = { closed: SET_ACCESSORY_BAR_HEIGHT, opened: 0 };
const INCLUDE_HIDDEN = { includeHiddenElements: true };

describe('StickySetInputAccessoryBar', () => {
  // The app draws edge-to-edge, so a bar left at bottom: 0 while no keyboard
  // is up sits on Android's navigation buttons. The bar only comes up with
  // the keyboard instead.
  it('never rests on the navigation bar while no keyboard is up', () => {
    render(
      withBottomInset(
        48,
        <StickySetInputAccessoryBar visible onDone={() => {}} actions={[]} />
      )
    );

    expect(
      screen.getByTestId('set-accessory-sticky', INCLUDE_HIDDEN).props.offset
    ).toEqual(PARKED);
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('is the bar the workout and preset forms show for a focused set', () => {
    render(withBottomInset(48, <EditFormBar />));

    expect(
      screen.getByTestId('set-accessory-sticky', INCLUDE_HIDDEN).props.offset
    ).toEqual(PARKED);
    expect(screen.getByText('Next')).toBeTruthy();
  });
});
