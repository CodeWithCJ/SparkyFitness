import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FullScreenModalBody from '../../src/components/FullScreenModalBody';

const frame = { x: 0, y: 0, width: 390, height: 844 };

/** Roughly what Android reports under edge-to-edge with 3-button navigation. */
const ANDROID_STATUS_BAR_INSET = 24;
const ANDROID_NAV_BAR_INSET = 48;

const renderBody = (top: number, bottom: number) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ insets: { top, bottom, left: 0, right: 0 }, frame }}
    >
      <FullScreenModalBody className="justify-between px-6">
        <View testID="content">
          <Text>Meditation Timer</Text>
        </View>
      </FullScreenModalBody>
    </SafeAreaProvider>
  );

/**
 * Reads the body's padding by walking up from its content to the first
 * ancestor that carries one, rather than assuming a fixed depth: uniwind wraps
 * the styled View, so the body is not the immediate parent.
 */
const bodyPadding = (
  side: 'paddingTop' | 'paddingBottom'
): number | undefined => {
  let node = screen.getByTestId('content').parent;
  while (node) {
    const style = node.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    if (typeof flat?.[side] === 'number') return flat[side];
    node = node.parent;
  }
  return undefined;
};

describe('FullScreenModalBody', () => {
  test('starts the content below the status bar', () => {
    renderBody(ANDROID_STATUS_BAR_INSET, ANDROID_NAV_BAR_INSET);

    // The reported bug: the header title was drawn over the status-bar clock
    // and the close button under its icons.
    expect(bodyPadding('paddingTop')).toBe(ANDROID_STATUS_BAR_INSET + 16);
  });

  test('clears the system navigation bar when the platform reports an inset', () => {
    renderBody(ANDROID_STATUS_BAR_INSET, ANDROID_NAV_BAR_INSET);

    // The other half of the bug: the primary button sat under the back /
    // home / recents controls, which swallowed the taps.
    expect(bodyPadding('paddingBottom')).toBe(ANDROID_NAV_BAR_INSET);
  });

  test('keeps its own spacing where there are no insets to respect', () => {
    renderBody(0, 0);

    expect(bodyPadding('paddingTop')).toBe(16);
    expect(bodyPadding('paddingBottom')).toBe(16);
  });

  test('never shrinks the bottom below its own spacing for a smaller inset', () => {
    renderBody(0, 8);

    expect(bodyPadding('paddingBottom')).toBe(16);
  });

  test('renders whatever content it is given', () => {
    renderBody(0, 0);

    expect(screen.getByText('Meditation Timer')).toBeTruthy();
  });
});
