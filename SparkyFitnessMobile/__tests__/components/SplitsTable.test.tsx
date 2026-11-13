import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SplitsTable from '../../src/components/recording/SplitsTable';
import type { RecordedSplit } from '../../src/utils/gpsRecording';

const split = (
  index: number,
  seconds: number,
  extra: Partial<RecordedSplit> = {}
): RecordedSplit => ({
  index,
  distanceMeters: 1000,
  durationSeconds: seconds,
  startT: 0,
  endT: seconds * 1000,
  partial: false,
  ...extra,
});

describe('SplitsTable', () => {
  it('lists each split with its pace, elevation change and heart rate', () => {
    render(
      <SplitsTable
        unit="km"
        unitMeters={1000}
        splits={[
          split(1, 388, { elevationChangeMeters: -0.2, avgHeartRate: 177 }),
          split(2, 364, { elevationChangeMeters: -4.1, avgHeartRate: 194 }),
        ]}
      />
    );
    expect(screen.getByText('Km')).toBeTruthy();
    expect(screen.getByText('Elev')).toBeTruthy();
    expect(screen.getByText('HR')).toBeTruthy();
    expect(screen.getByText('6:28')).toBeTruthy();
    expect(screen.getByText('6:04')).toBeTruthy();
    expect(screen.getByText('177')).toBeTruthy();
    expect(screen.getByText('-4')).toBeTruthy();
    // A drop of 0.2 m reads 0, not -0.
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('leaves out the elevation and heart-rate columns when no split has them', () => {
    render(
      <SplitsTable unit="km" unitMeters={1000} splits={[split(1, 360)]} />
    );
    expect(screen.queryByText('Elev')).toBeNull();
    expect(screen.queryByText('HR')).toBeNull();
  });

  it('shows feet and miles for the miles setting', () => {
    render(
      <SplitsTable
        unit="miles"
        unitMeters={1609.344}
        splits={[
          {
            ...split(1, 600),
            distanceMeters: 1609.344,
            elevationChangeMeters: 10,
          },
        ]}
      />
    );
    expect(screen.getByText('Mi')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('labels a trailing partial split by its distance', () => {
    render(
      <SplitsTable
        unit="km"
        unitMeters={1000}
        splits={[
          split(1, 360),
          { ...split(2, 150), distanceMeters: 420, partial: true },
        ]}
      />
    );
    expect(screen.getByText('0.42')).toBeTruthy();
  });
});
