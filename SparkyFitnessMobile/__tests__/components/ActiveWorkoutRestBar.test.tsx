import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import ActiveWorkoutRestBar from '../../src/components/ActiveWorkoutRestBar';
import { useNativeIOSTabsActive } from '../../src/services/nativeTabBarPreference';

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
}));

const mockUseNativeIOSTabsActive = useNativeIOSTabsActive as jest.MockedFunction<
  typeof useNativeIOSTabsActive
>;

// Distinct values per CSS variable so paused-vs-resting color assertions mean
// something (the global uniwind mock returns the same color for everything).
const COLORS: Record<string, string> = {
  '--color-accent-primary': '#e11d48',
  '--color-text-muted': '#9ca3af',
  '--color-progress-track': '#1f2937',
};

const ACCENT = COLORS['--color-accent-primary'];
const MUTED = COLORS['--color-text-muted'];

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function renderBar(
  overrides?: Partial<React.ComponentProps<typeof ActiveWorkoutRestBar>>,
) {
  const props = {
    remainingMs: 45_000,
    progress: 0.5,
    state: 'resting' as const,
    label: 'Incline DB Press · Set 3',
    onAdjust: jest.fn(),
    onSkip: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onCompleteSet: jest.fn(),
    onPressBar: jest.fn(),
    ...overrides,
  };
  const utils = render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <ActiveWorkoutRestBar {...props} />
    </SafeAreaProvider>,
  );
  return { ...utils, props };
}

function fillStyle(getByTestId: (id: string) => any) {
  return StyleSheet.flatten(getByTestId('rest-progress-fill').props.style);
}

describe('ActiveWorkoutRestBar', () => {
  beforeEach(() => {
    mockUseNativeIOSTabsActive.mockReturnValue(false);
    (useCSSVariable as jest.Mock).mockImplementation((vars: string | string[]) =>
      Array.isArray(vars)
        ? vars.map((v) => COLORS[v] ?? '#888888')
        : (COLORS[vars] ?? '#888888'),
    );
  });

  it('renders the countdown and the on-deck label', () => {
    const { getByText } = renderBar();
    expect(getByText('0:45')).toBeTruthy();
    expect(getByText('Incline DB Press · Set 3')).toBeTruthy();
  });

  it('renders the target line when a next-set target is provided', () => {
    const { getByText } = renderBar({ nextSetText: '135 lbs × 8' });
    expect(getByText('Target 135 lbs × 8')).toBeTruthy();
  });

  it('sets the progress fill width from the progress fraction', () => {
    const { getByTestId } = renderBar({ progress: 0.5 });
    expect(fillStyle(getByTestId).width).toBe('50%');
  });

  it('uses the accent color while resting', () => {
    const { getByTestId, getByText } = renderBar({ state: 'resting' });
    expect(fillStyle(getByTestId).backgroundColor).toBe(ACCENT);
    expect(StyleSheet.flatten(getByText('0:45').props.style).color).toBe(ACCENT);
  });

  it('renders muted colors while paused', () => {
    const { getByTestId, getByText } = renderBar({ state: 'paused' });
    expect(fillStyle(getByTestId).backgroundColor).toBe(MUTED);
    expect(StyleSheet.flatten(getByText('0:45').props.style).color).toBe(MUTED);
  });

  it('fires onAdjust with −15 and +15', () => {
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(props.onAdjust).toHaveBeenCalledWith(-15);
    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    expect(props.onAdjust).toHaveBeenCalledWith(15);
    expect(props.onAdjust).toHaveBeenCalledTimes(2);
  });

  it('fires onSkip from the skip button', () => {
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Skip rest'));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
  });

  it('fires onPause from the pause control while resting', () => {
    const { getByLabelText, props } = renderBar({ state: 'resting' });
    fireEvent.press(getByLabelText('Pause rest'));
    expect(props.onPause).toHaveBeenCalledTimes(1);
    expect(props.onResume).not.toHaveBeenCalled();
  });

  it('fires onResume from the pause control while paused', () => {
    const { getByLabelText, props } = renderBar({ state: 'paused' });
    fireEvent.press(getByLabelText('Resume rest'));
    expect(props.onResume).toHaveBeenCalledTimes(1);
    expect(props.onPause).not.toHaveBeenCalled();
  });

  it('fires onPressBar when tapping the bar outside the controls', () => {
    const { getByTestId, props } = renderBar();
    fireEvent.press(getByTestId('rest-bar-body'));
    expect(props.onPressBar).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPressBar when a control is pressed', () => {
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Skip rest'));
    fireEvent.press(getByLabelText('Pause rest'));
    fireEvent.press(getByLabelText('Extend rest by 15 seconds'));
    expect(props.onPressBar).not.toHaveBeenCalled();
  });

  it('fires onPressBar from the ready-state on-deck row', () => {
    const { getByTestId, getByLabelText, props } = renderBar({ state: 'ready' });
    fireEvent.press(getByTestId('rest-bar-body'));
    expect(props.onPressBar).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('Complete set'));
    expect(props.onPressBar).toHaveBeenCalledTimes(1);
  });

  it('renders the docked chrome when Liquid Glass tabs are off', () => {
    const { queryByTestId } = renderBar();
    expect(queryByTestId('rest-bar-glass')).toBeNull();
  });

  it('renders the floating glass pill when Liquid Glass tabs are active', () => {
    mockUseNativeIOSTabsActive.mockReturnValue(true);
    const { getByTestId, getByText } = renderBar();
    expect(getByTestId('rest-bar-glass')).toBeTruthy();
    expect(getByText('0:45')).toBeTruthy();
    expect(getByText('Incline DB Press · Set 3')).toBeTruthy();
  });

  it('keeps the controls wired in glass mode', () => {
    mockUseNativeIOSTabsActive.mockReturnValue(true);
    const { getByLabelText, props } = renderBar();
    fireEvent.press(getByLabelText('Skip rest'));
    fireEvent.press(getByLabelText('Shorten rest by 15 seconds'));
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onAdjust).toHaveBeenCalledWith(-15);
  });

  describe('ready state', () => {
    it('collapses to the on-deck row: label, target, and a Complete Set button', () => {
      const { getByText, getByLabelText, queryByText, queryByTestId, queryByLabelText } =
        renderBar({ state: 'ready', nextSetText: '135 lbs × 8' });
      expect(getByText('Incline DB Press · Set 3')).toBeTruthy();
      expect(getByText('Target 135 lbs × 8')).toBeTruthy();
      expect(getByLabelText('Complete set')).toBeTruthy();
      // Timer chrome is gone: no countdown, track, or rest controls.
      expect(queryByText('0:45')).toBeNull();
      expect(queryByTestId('rest-progress-fill')).toBeNull();
      expect(queryByLabelText('Skip rest')).toBeNull();
      expect(queryByLabelText('Pause rest')).toBeNull();
      expect(queryByLabelText('Shorten rest by 15 seconds')).toBeNull();
    });

    it('fires onCompleteSet from the Complete Set button', () => {
      const { getByLabelText, props } = renderBar({ state: 'ready' });
      fireEvent.press(getByLabelText('Complete set'));
      expect(props.onCompleteSet).toHaveBeenCalledTimes(1);
    });

    it('renders the on-deck row inside the glass pill when Liquid Glass tabs are active', () => {
      mockUseNativeIOSTabsActive.mockReturnValue(true);
      const { getByTestId, getByLabelText, props } = renderBar({ state: 'ready' });
      expect(getByTestId('rest-bar-glass')).toBeTruthy();
      fireEvent.press(getByLabelText('Complete set'));
      expect(props.onCompleteSet).toHaveBeenCalledTimes(1);
    });
  });
});
