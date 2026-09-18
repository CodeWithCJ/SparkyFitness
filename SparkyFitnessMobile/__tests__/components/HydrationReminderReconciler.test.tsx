import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import HydrationReminderReconciler from '../../src/components/HydrationReminderReconciler';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { useServerConnection } from '../../src/hooks/useServerConnection';
import { useHydrationReminderReconciler } from '../../src/hooks/useHydrationReminder';
import { fetchWaterIntakeLog } from '../../src/services/api/measurementsApi';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from '../hooks/queryTestUtils';

jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(),
}));
jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: jest.fn(),
}));
jest.mock('../../src/hooks/useHydrationReminder', () => ({
  useHydrationReminderReconciler: jest.fn(),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterIntakeLog: jest.fn(),
}));

const mockUseDailySummary = useDailySummary as jest.MockedFunction<
  typeof useDailySummary
>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;
const mockReconciler = useHydrationReminderReconciler as jest.MockedFunction<
  typeof useHydrationReminderReconciler
>;
const mockFetchLog = fetchWaterIntakeLog as jest.MockedFunction<
  typeof fetchWaterIntakeLog
>;

describe('HydrationReminderReconciler', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    queryClient = createTestQueryClient();
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    mockUseDailySummary.mockReturnValue({
      summary: { waterConsumed: 500, waterGoal: 2500 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as never);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("feeds today's water total, goal and latest log time into the reconciler", async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    mockFetchLog.mockResolvedValue([
      { logged_at: '2026-09-15T08:00:00.000Z' },
      { logged_at: '2026-09-15T10:30:00.000Z' },
    ] as never);

    const { toJSON } = render(<HydrationReminderReconciler />, {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(toJSON()).toBeNull();
    await waitFor(() =>
      expect(mockReconciler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          waterMl: 500,
          waterGoalMl: 2500,
          isLoading: false,
          lastLoggedAt: new Date('2026-09-15T10:30:00.000Z'),
        })
      )
    );
  });

  it('skips fetching while reminders are off but still runs the reconciler so it can cancel', () => {
    render(<HydrationReminderReconciler />, {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchLog).not.toHaveBeenCalled();
    expect(mockUseDailySummary).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
    expect(mockReconciler).toHaveBeenCalled();
  });

  it('skips fetching while the server is unreachable, matching the Dashboard', () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    mockUseServerConnection.mockReturnValue({
      isConnected: false,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);

    render(<HydrationReminderReconciler />, {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchLog).not.toHaveBeenCalled();
    expect(mockUseDailySummary).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
    expect(mockReconciler).toHaveBeenCalled();
  });
});
