import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MoodHistoryCard from '../../../src/components/mood/MoodHistoryCard';
import { initializeI18n } from '../../../src/localization/i18n';
import type { MoodEntry } from '../../../src/services/api/moodApi';

let mockEntries: MoodEntry[] = [];
jest.mock('../../../src/hooks/useMood', () => ({
  useMoodEntries: () => ({
    entries: mockEntries,
    points: [],
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('../../../src/components/mood/MoodLineChart', () => ({
  __esModule: true,
  default: () => null,
}));

const entry = (overrides: Partial<MoodEntry>): MoodEntry => ({
  id: 'e',
  mood_value: 70,
  mood_tags: [],
  notes: null,
  entry_date: '2026-10-14',
  entry_timestamp: '2026-10-14T12:00:00Z',
  source: 'manual',
  ...overrides,
});

beforeAll(async () => {
  await initializeI18n('en');
});

describe('MoodHistoryCard most common moods', () => {
  it('counts tags on manual check-ins only', () => {
    mockEntries = [
      entry({ id: 'a', mood_tags: ['happy', 'calm'] }),
      entry({ id: 'b', mood_tags: ['happy'] }),
      entry({ id: 'g', mood_tags: ['calm', 'tired'], source: 'garmin' }),
    ];
    render(<MoodHistoryCard customMoods={[]} />);

    expect(screen.getByText('Most common moods')).toBeTruthy();
    expect(screen.getByText(/Happy/)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText(/Calm/)).toBeTruthy();
    // Calm appears once (manual); the imported row's second Calm and its Tired are not counted.
    expect(screen.getAllByText('1')).toHaveLength(1);
    expect(screen.queryByText(/Tired/)).toBeNull();
  });

  it('shows no list when only imported rows carry tags', () => {
    mockEntries = [entry({ mood_tags: ['calm'], source: 'garmin' })];
    render(<MoodHistoryCard customMoods={[]} />);
    expect(screen.queryByText('Most common moods')).toBeNull();
  });
});
