import React from 'react';
import { Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FooterActionBar from '../../src/components/FooterActionBar';

const frame = { x: 0, y: 0, width: 390, height: 844 };

/** Roughly what Android reports under the 3-button navigation bar. */
const ANDROID_NAV_BAR_INSET = 48;

const renderBar = (bottom: number) =>
  render(
    <SafeAreaProvider
      initialMetrics={{ insets: { top: 0, bottom, left: 0, right: 0 }, frame }}
    >
      <FooterActionBar>
        <View testID="action">
          <Text>Add container</Text>
        </View>
      </FooterActionBar>
    </SafeAreaProvider>
  );

/**
 * Walks up from the action to the first ancestor carrying a numeric
 * paddingBottom, rather than assuming a fixed depth: uniwind wraps the styled
 * View, so the bar is not the immediate parent.
 */
const barPaddingBottom = (): number | undefined => {
  let node = screen.getByTestId('action').parent;
  while (node) {
    const style = node.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    if (typeof flat?.paddingBottom === 'number') return flat.paddingBottom;
    node = node.parent;
  }
  return undefined;
};

describe('FooterActionBar', () => {
  test('clears the system navigation bar when the platform reports an inset', () => {
    renderBar(ANDROID_NAV_BAR_INSET);

    // The reported bug: a flat 16 put the button under Android's navigation
    // bar, where its own controls overlapped and swallowed the taps.
    expect(barPaddingBottom()).toBe(ANDROID_NAV_BAR_INSET);
  });

  test('keeps its own spacing where there is no inset to respect', () => {
    renderBar(0);

    // Not zero: the button would otherwise sit flush against the screen edge
    // on the devices that report nothing, which is what the 16 was for.
    expect(barPaddingBottom()).toBe(16);
  });

  test('never shrinks below its own spacing for a smaller inset', () => {
    renderBar(8);

    expect(barPaddingBottom()).toBe(16);
  });

  test('renders whatever action it is given', () => {
    renderBar(0);

    expect(screen.getByText('Add container')).toBeTruthy();
  });
});
