import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FocusWorkoutSummary from '../../src/components/FocusWorkoutSummary';
import { effortBand } from '../../src/components/FocusEffortSlider';

jest.mock('../../src/hooks/useHeartRateZoneColor', () => ({
  useHeartRateZoneColor: () => '#3b82f6',
}));

const base = {
  sessionName: 'Push day',
  completedSetCount: 16,
  totalSetCount: 16,
  durationMinutes: 48,
  volumeKg: 6400,
  weightUnit: 'kg' as const,
  caloriesKcal: 342,
  heartRate: { avgBpm: 128, maxBpm: 160 },
  effort: 7,
  onRateEffort: jest.fn(),
  presetOffer: null,
};

describe('FocusWorkoutSummary', () => {
  it('shows the heading, the stat tiles and the zone legend', () => {
    const { getByText, getByTestId } = render(
      <FocusWorkoutSummary {...base} />
    );
    expect(getByText('Push day')).toBeTruthy();
    expect(getByText('Nice work')).toBeTruthy();
    expect(getByText('16 of 16 sets done')).toBeTruthy();
    expect(getByText('6.4 t')).toBeTruthy();
    expect(getByText('342')).toBeTruthy();
    expect(getByText('128')).toBeTruthy();
    expect(getByTestId('focus-summary-zone-legend')).toBeTruthy();
  });

  it('colours the average heart rate by its zone', () => {
    const { getByText } = render(<FocusWorkoutSummary {...base} />);
    expect(getByText('128').props.style).toEqual(
      expect.objectContaining({ color: '#3b82f6' })
    );
  });

  it('hides the legend without a heart rate', () => {
    const { queryByTestId, getByText } = render(
      <FocusWorkoutSummary {...base} heartRate={null} />
    );
    expect(queryByTestId('focus-summary-zone-legend')).toBeNull();
    expect(getByText('Avg bpm')).toBeTruthy();
  });

  it('shows the rated effort with its band and the shared slider', () => {
    const { getByTestId, getByText } = render(
      <FocusWorkoutSummary {...base} />
    );
    expect(getByTestId('focus-summary-effort').props.children).toBe(7);
    expect(getByText('· Hard')).toBeTruthy();
    expect(getByTestId('focus-summary-effort-slider')).toBeTruthy();
    expect(effortBand(3)).toBe('easy');
    expect(effortBand(4)).toBe('moderate');
    expect(effortBand(8)).toBe('hard');
    expect(effortBand(10)).toBe('max');
  });

  it('rates only on release, not on every drag move', () => {
    const onRateEffort = jest.fn();
    const { getByTestId } = render(
      <FocusWorkoutSummary {...base} onRateEffort={onRateEffort} />
    );
    const slider = getByTestId('focus-summary-effort-slider');
    fireEvent(slider, 'layout', {
      nativeEvent: { layout: { width: 100, height: 44, x: 0, y: 0 } },
    });
    fireEvent(slider, 'responderGrant', { nativeEvent: { locationX: 85 } });
    fireEvent(slider, 'responderMove', { nativeEvent: { locationX: 95 } });
    expect(onRateEffort).not.toHaveBeenCalled();
    expect(getByTestId('focus-summary-effort').props.children).toBe(10);
    fireEvent(slider, 'responderRelease', { nativeEvent: {} });
    expect(onRateEffort).toHaveBeenCalledTimes(1);
    expect(onRateEffort).toHaveBeenCalledWith(10);
  });

  it('refuses to give up the drag and commits if the responder is terminated', () => {
    const onRateEffort = jest.fn();
    const { getByTestId } = render(
      <FocusWorkoutSummary {...base} onRateEffort={onRateEffort} />
    );
    const slider = getByTestId('focus-summary-effort-slider');
    expect(slider.props.onResponderTerminationRequest()).toBe(false);
    fireEvent(slider, 'layout', {
      nativeEvent: { layout: { width: 100, height: 44, x: 0, y: 0 } },
    });
    fireEvent(slider, 'responderGrant', { nativeEvent: { locationX: 45 } });
    fireEvent(slider, 'responderTerminate', { nativeEvent: {} });
    expect(onRateEffort).toHaveBeenCalledTimes(1);
  });

  it('shows an empty track and a hint until it is rated', () => {
    const { queryByTestId, getByText } = render(
      <FocusWorkoutSummary {...base} effort={null} />
    );
    expect(queryByTestId('focus-summary-effort')).toBeNull();
    expect(getByText('Drag to rate')).toBeTruthy();
  });

  it('offers Update and Keep original when the workout changed', () => {
    const onUpdate = jest.fn();
    const onKeep = jest.fn();
    const { getByText, getByTestId } = render(
      <FocusWorkoutSummary
        {...base}
        presetOffer={{
          changes: ['Plank added.'],
          onUpdate,
          onKeep,
          updating: false,
        }}
      />
    );
    expect(getByText('You changed this workout')).toBeTruthy();
    expect(getByText('Plank added.')).toBeTruthy();
    fireEvent.press(getByTestId('focus-summary-update-preset'));
    expect(onUpdate).toHaveBeenCalled();
    fireEvent.press(getByTestId('focus-summary-keep-preset'));
    expect(onKeep).toHaveBeenCalled();
  });
});
