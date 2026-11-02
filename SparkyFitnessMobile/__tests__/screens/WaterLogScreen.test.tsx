import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WaterIntakeLogEntry } from '@workspace/shared';
import WaterLogScreen from '../../src/screens/WaterLogScreen';
import {
  deleteWaterIntakeLogEntry,
  fetchWaterIntakeLog,
} from '../../src/services/api/measurementsApi';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterIntakeLog: jest.fn(),
  deleteWaterIntakeLogEntry: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      timezone: 'UTC',
      time_format: 'HH:mm',
      water_display_unit: 'ml',
    },
  }),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockFetch = fetchWaterIntakeLog as jest.MockedFunction<
  typeof fetchWaterIntakeLog
>;
const mockDelete = deleteWaterIntakeLogEntry as jest.MockedFunction<
  typeof deleteWaterIntakeLogEntry
>;

function entry(overrides: Partial<WaterIntakeLogEntry>): WaterIntakeLogEntry {
  return {
    id: 'log-1',
    user_id: 'user-1',
    entry_date: '2026-11-02',
    water_ml: 250,
    container_id: 1,
    container_name: 'Glass',
    source: 'manual',
    created_at: '2026-11-02T09:15:00.000Z',
    logged_at: '2026-11-02T09:15:00.000Z',
    food_entry_id: null,
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <WaterLogScreen
        navigation={{} as never}
        route={
          {
            key: 'WaterLog',
            name: 'WaterLog',
            params: { date: '2026-11-02' },
          } as never
        }
      />
    </QueryClientProvider>
  );
  return { ...utils, invalidate };
}

describe('WaterLogScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lists the day's drinks with time, name, amount and source", async () => {
    mockFetch.mockResolvedValue([
      entry({}),
      entry({
        id: 'log-2',
        container_name: 'Espresso',
        water_ml: 0,
        logged_at: '2026-11-02T10:05:00.000Z',
        food_entry_id: 'food-1',
      }),
      entry({
        id: 'log-3',
        container_name: null,
        water_ml: 500,
        source: 'healthkit',
        logged_at: '2026-11-02T12:30:00.000Z',
      }),
    ]);
    const { findAllByTestId, getByText, getByLabelText, queryAllByLabelText } =
      renderScreen();

    expect(await findAllByTestId('water-log-row')).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledWith('2026-11-02');
    expect(getByText('09:15')).toBeTruthy();
    expect(getByText('Glass')).toBeTruthy();
    expect(getByText('250 ml')).toBeTruthy();
    // A zero-credit drink says so instead of "0 ml", and shows its food link.
    expect(getByText('No water')).toBeTruthy();
    expect(getByLabelText('Linked to a food entry')).toBeTruthy();
    // A synced drink is labelled and has no delete.
    expect(getByText('Drink')).toBeTruthy();
    expect(getByText('Apple Health')).toBeTruthy();
    expect(queryAllByLabelText(/^Delete /)).toHaveLength(2);
  });

  it('shows an empty state when nothing was logged', async () => {
    mockFetch.mockResolvedValue([]);
    const { findByText } = renderScreen();
    expect(await findByText('No drinks logged')).toBeTruthy();
  });

  it('deletes a drink after confirming and refreshes the day', async () => {
    mockFetch.mockResolvedValue([entry({ food_entry_id: 'food-1' })]);
    mockDelete.mockResolvedValue();
    const alert = jest.spyOn(Alert, 'alert');
    const { findByLabelText, invalidate } = renderScreen();

    fireEvent.press(await findByLabelText('Delete Glass at 09:15'));
    expect(alert).toHaveBeenCalledWith(
      'Delete drink',
      'Delete this drink? Its food diary entry is deleted too.',
      expect.any(Array)
    );
    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === 'destructive')!.onPress!();

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('log-1'));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['waterIntakeLog', '2026-11-02'],
        })
      )
    );
  });
});
