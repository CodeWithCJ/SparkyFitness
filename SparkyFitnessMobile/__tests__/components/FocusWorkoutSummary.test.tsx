import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FocusWorkoutSummary, {
  effortBand,
} from '../../src/components/FocusWorkoutSummary';

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

  it('names the effort band and rates on tap', () => {
    const onRateEffort = jest.fn();
    const { getByTestId, getByText } = render(
      <FocusWorkoutSummary {...base} onRateEffort={onRateEffort} />
    );
    expect(getByText('7 · Hard')).toBeTruthy();
    fireEvent.press(getByTestId('focus-summary-effort-9'));
    expect(onRateEffort).toHaveBeenCalledWith(9);
    expect(effortBand(3)).toBe('easy');
    expect(effortBand(4)).toBe('moderate');
    expect(effortBand(8)).toBe('hard');
    expect(effortBand(10)).toBe('max');
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
