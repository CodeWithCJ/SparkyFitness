import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PersonalRecordsScreen from '../../src/screens/PersonalRecordsScreen';
import { usePersonalRecords } from '../../src/hooks/usePersonalRecords';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/usePersonalRecords', () => ({
  usePersonalRecords: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const refetch = jest.fn();
const state = (overrides: Record<string, unknown>) =>
  jest.mocked(usePersonalRecords).mockReturnValue({
    records: [],
    isLoading: false,
    isError: false,
    refetch,
    ...overrides,
  } as never);
const renderScreen = () => render(<PersonalRecordsScreen {...({} as never)} />);

const rec = (
  sportGroup: string,
  distanceStandard: string,
  formattedTime: string
) => ({
  id: `${sportGroup}-${distanceStandard}`,
  category: 'Cardio',
  sportGroup,
  distanceStandard,
  label: distanceStandard,
  bestTimeSeconds: 1,
  formattedTime,
  avgPaceSecondsPerKm: 300,
  formattedPace: '5:00 /km',
  activityId: 'a',
  activityName: 'Run',
  achievedAt: '2026-10-12',
});

beforeEach(() => jest.clearAllMocks());

it('lists records under their sport', () => {
  state({
    records: [rec('run', '5k', '24:10'), rec('walk', '1k', '10:05')],
  });
  renderScreen();
  expect(screen.getByText('Running')).toBeTruthy();
  expect(screen.getByText('Walking')).toBeTruthy();
  expect(screen.getByText('5 km')).toBeTruthy();
  expect(screen.getByText('24:10')).toBeTruthy();
  expect(screen.getByText('10:05')).toBeTruthy();
});

it('explains an empty list', () => {
  state({});
  renderScreen();
  expect(screen.getByText(/No records yet/)).toBeTruthy();
});

it('offers a retry when the records could not be loaded', () => {
  state({ isError: true });
  renderScreen();
  fireEvent.press(screen.getByText('Retry'));
  expect(refetch).toHaveBeenCalled();
});
