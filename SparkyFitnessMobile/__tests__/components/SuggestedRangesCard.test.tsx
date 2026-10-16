import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SuggestedRangesCard from '../../src/components/recording/SuggestedRangesCard';

const band = (fastest: number, slowest: number) => ({ fastest, slowest });

describe('SuggestedRangesCard', () => {
  const base = {
    unit: 'km' as const,
    heartRate: null,
    onUse: jest.fn(),
  };

  it('says the ranges came from a recent race, and lists the tempo, marathon and stride paces', () => {
    render(
      <SuggestedRangesCard
        {...base}
        pace={{
          work: band(290, 310),
          easy: band(360, 405),
          warm: band(365, 810),
          sessions: 0,
          race: { distanceKm: 5, seconds: 1500 },
          efforts: {
            tempo: band(320, 335),
            marathon: band(340, 355),
            stride: band(265, 285),
          },
        }}
      />
    );
    expect(
      screen.getByText(
        'Pace: fast 4:50–5:10/km, easy 6:00–6:45/km, warm-up and cool-down 6:05–13:30/km'
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        'tempo 5:20–5:35/km, marathon pace 5:40–5:55/km, strides 4:25–4:45/km'
      )
    ).toBeTruthy();
    expect(
      screen.getByText('Based on your recent race: 5K in 25:00.')
    ).toBeTruthy();
  });

  it('keeps the session wording when the ranges come from recent runs', () => {
    render(
      <SuggestedRangesCard
        {...base}
        pace={{
          work: band(285, 320),
          easy: band(360, 420),
          warm: band(365, 840),
          sessions: 5,
        }}
      />
    );
    expect(screen.getByText('Based on your last 5 sessions.')).toBeTruthy();
    expect(screen.queryByText(/tempo/)).toBeNull();
  });
});
