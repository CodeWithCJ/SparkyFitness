import React from 'react';
import { render, screen } from '@testing-library/react-native';
import PaceZonesCard from '../../src/components/exerciseStats/PaceZonesCard';
import type { PaceZonesResult } from '../../src/utils/paceZones';

const result = (source: 'effort' | 'typical'): PaceZonesResult => ({
  thresholdSecondsPerKm: 300,
  source,
  sessions: 3,
  zones: [
    { id: 'easy', minSecondsPerKm: 345, maxSecondsPerKm: 405 },
    { id: 'steady', minSecondsPerKm: 315, maxSecondsPerKm: 345 },
    { id: 'threshold', minSecondsPerKm: 290, maxSecondsPerKm: 315 },
    { id: 'interval', minSecondsPerKm: 265, maxSecondsPerKm: 290 },
    { id: 'repetition', minSecondsPerKm: 240, maxSecondsPerKm: 265 },
  ],
});

describe('PaceZonesCard', () => {
  it('lists the five zones, easy first, in the distance unit', () => {
    render(<PaceZonesCard result={result('effort')} distanceUnit="km" />);
    expect(screen.getByText('Pace zones')).toBeTruthy();
    expect(screen.getByText('5:45 – 6:45 /km')).toBeTruthy();
    expect(screen.getByText('4:00 – 4:25 /km')).toBeTruthy();
    expect(screen.getByTestId('pace-zone-easy')).toBeTruthy();
    expect(screen.getByTestId('pace-zone-repetition')).toBeTruthy();
  });

  it('converts to miles', () => {
    render(<PaceZonesCard result={result('effort')} distanceUnit="miles" />);
    // 345 s/km is 555 s/mi (9:15).
    expect(screen.getByText(/^9:15 – 10:52 \/mi$/)).toBeTruthy();
  });

  it('says when the zones are only an estimate', () => {
    render(<PaceZonesCard result={result('typical')} distanceUnit="km" />);
    expect(screen.getByText(/less precise/)).toBeTruthy();
    expect(screen.queryByText(/best recent run/)).toBeNull();
  });
});
