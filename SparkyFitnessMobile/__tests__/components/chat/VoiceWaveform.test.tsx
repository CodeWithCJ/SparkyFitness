import { render, renderHook } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import VoiceWaveform from '../../../src/components/chat/VoiceWaveform';

function renderWaveform(volume: number) {
  const { result } = renderHook(() => Reanimated.useSharedValue(volume));
  return render(
    <VoiceWaveform level={result.current} raised="#202020" accent="#5baaff" />
  );
}

describe('VoiceWaveform', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a compact listening state instead of tall simulated speech in silence', () => {
    const { getByLabelText, getAllByTestId } = renderWaveform(0);

    expect(getByLabelText('Listening')).toBeTruthy();
    const bars = getAllByTestId('voice-wave-bar');
    expect(bars).toHaveLength(17);
    for (const bar of bars) {
      const style = StyleSheet.flatten<ViewStyle>(bar.props.style);
      expect(style.height).toBeGreaterThanOrEqual(3);
      expect(style.height).toBeLessThanOrEqual(4.5);
      expect(style.backgroundColor).toBe('#5baaff');
    }
  });

  it('tapers toward the edges and stays inside the composer at full volume', () => {
    const { getAllByTestId } = renderWaveform(1);
    const heights = getAllByTestId('voice-wave-bar').map(
      (bar) => StyleSheet.flatten<ViewStyle>(bar.props.style).height
    );

    expect(heights[8]).toBeGreaterThan(heights[0] as number);
    expect(heights[8]).toBeGreaterThan(heights[16] as number);
    for (const height of heights) {
      expect(height).toBeGreaterThanOrEqual(3);
      expect(height).toBeLessThanOrEqual(28);
    }
  });

  it('does not run the idle animation when Reduce Motion is enabled', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const { getAllByTestId } = renderWaveform(0);

    expect(repeat).not.toHaveBeenCalled();
    for (const bar of getAllByTestId('voice-wave-bar')) {
      expect(StyleSheet.flatten<ViewStyle>(bar.props.style).height).toBe(3);
    }
  });

  it('stops the looping animation when recording leaves the screen', () => {
    const repeat = jest.spyOn(Reanimated, 'withRepeat');
    const { unmount } = renderWaveform(0.5);

    expect(repeat).toHaveBeenCalledTimes(1);
    unmount();
    expect(Reanimated.cancelAnimation).toHaveBeenCalledTimes(1);
  });
});
