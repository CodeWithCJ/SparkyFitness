import React from 'react';
import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  StickySetInputAccessoryBar,
  useSetEditAccessoryBar,
} from '../../src/components/SetRowChrome';

// The global mock drops KeyboardStickyView's offset; this one keeps it on the
// rendered view so the tests can read where the bar rests without a keyboard.
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    KeyboardStickyView: ({
      children,
      offset,
    }: {
      children?: React.ReactNode;
      offset?: { closed?: number; opened?: number };
    }) =>
      React.createElement(
        View,
        { testID: 'keyboard-sticky-view', stickyOffset: offset },
        children
      ),
    KeyboardEvents: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
  };
});

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

describe('StickySetInputAccessoryBar', () => {
  // The app draws edge-to-edge, so a bar left at bottom: 0 while no keyboard
  // is up sits on Android's navigation buttons.
  it('rests above the navigation bar while no keyboard is up', () => {
    render(
      withBottomInset(
        48,
        <StickySetInputAccessoryBar onDone={() => {}} actions={[]} />
      )
    );

    expect(
      screen.getByTestId('keyboard-sticky-view').props.stickyOffset
    ).toEqual({ closed: -48, opened: 0 });
    expect(screen.getByText('Done')).toBeTruthy();
  });

  it('is the bar the workout and preset forms show for a focused set', () => {
    render(withBottomInset(48, <EditFormBar />));

    expect(
      screen.getByTestId('keyboard-sticky-view').props.stickyOffset
    ).toEqual({ closed: -48, opened: 0 });
    expect(screen.getByText('Next')).toBeTruthy();
  });
});
