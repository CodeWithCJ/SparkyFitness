import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MoodCard from '../../src/components/mood/MoodCard';
import { useMoodEntriesBetween } from '../../src/hooks/useMood';

jest.mock('../../src/hooks/useMood', () => ({
  useMoodEntriesBetween: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const mockUseMoodEntries = useMoodEntriesBetween as jest.MockedFunction<
  typeof useMoodEntriesBetween
>;
const mockNavigate = jest.fn();
const navigation = {
  navigate: mockNavigate,
} as unknown as React.ComponentProps<typeof MoodCard>['navigation'];

describe('MoodCard on Dashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers a log button when nothing is logged for the day', () => {
    mockUseMoodEntries.mockReturnValue([]);
    const { getByText, getByLabelText } = render(
      <MoodCard navigation={navigation} date="2026-10-05" />
    );

    expect(getByText('No mood logged for this day')).toBeTruthy();
    expect(getByLabelText('Mood on 2026-10-05: none logged')).toBeTruthy();
    fireEvent.press(getByText('+ Log'));
    expect(mockNavigate).toHaveBeenCalledWith('MoodLog', {
      date: '2026-10-05',
    });
  });

  it("shows the day's mood face and label when logged", () => {
    mockUseMoodEntries.mockReturnValue([
      {
        id: '1',
        mood_value: 80,
        mood_tags: [],
        notes: null,
        entry_date: '2026-10-05',
      },
    ]);
    const { getByText, getByLabelText, queryByText } = render(
      <MoodCard navigation={navigation} date="2026-10-05" />
    );

    expect(getByText(/Happy/)).toBeTruthy();
    expect(getByLabelText('Mood on 2026-10-05: Happy')).toBeTruthy();
    expect(queryByText('+ Log')).toBeNull();
  });
});
