import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BreathworkModal } from '../../../src/components/mindfulness/BreathworkModal';
import { MeditationTimerModal } from '../../../src/components/mindfulness/MeditationTimerModal';
import { initializeI18n } from '../../../src/localization/i18n';

jest.mock('../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const frame = { x: 0, y: 0, width: 390, height: 844 };

/** Roughly what Android reports under edge-to-edge with 3-button navigation. */
const ANDROID_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

const withAndroidInsets = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets: ANDROID_INSETS, frame }}>
      {ui}
    </SafeAreaProvider>
  );

/**
 * The padding the nearest ancestor of `text` sets on `side`. Walks up rather
 * than assuming a depth, since uniwind wraps styled Views.
 */
const paddingAbove = (
  text: string,
  side: 'paddingTop' | 'paddingBottom'
): number | undefined => {
  let node = screen.getByText(text).parent;
  while (node) {
    const style = node.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    if (typeof flat?.[side] === 'number') return flat[side];
    node = node.parent;
  }
  return undefined;
};

describe('mindfulness modals under Android edge-to-edge', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('Meditation Timer keeps its header and action clear of the system bars', () => {
    withAndroidInsets(
      <MeditationTimerModal visible onClose={jest.fn()} onSave={jest.fn()} />
    );

    expect(paddingAbove('Meditation Timer', 'paddingTop')).toBe(
      ANDROID_INSETS.top + 16
    );
    expect(paddingAbove('Begin Meditation', 'paddingBottom')).toBe(
      ANDROID_INSETS.bottom
    );
  });

  test('Breathwork keeps its header and action clear of the system bars', () => {
    withAndroidInsets(
      <BreathworkModal visible onClose={jest.fn()} onSave={jest.fn()} />
    );

    expect(paddingAbove('Breathwork', 'paddingTop')).toBe(
      ANDROID_INSETS.top + 16
    );
    expect(paddingAbove('Start Breathing', 'paddingBottom')).toBe(
      ANDROID_INSETS.bottom
    );
  });
});
