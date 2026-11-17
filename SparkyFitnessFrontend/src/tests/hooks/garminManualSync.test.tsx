import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  handleManualSyncGarmin,
  type GarminManualSyncResponse,
} from '@/api/Settings/externalProviderService';
import { externalProviderKeys } from '@/api/keys/settings';
import { garminKeys } from '@/api/keys/integrations';
import { dailyProgressKeys } from '@/api/keys/diary';
import { useManualSyncGarminMutation } from '@/hooks/Integrations/useIntegrations';
import { useSyncAllMutation } from '@/hooks/Integrations/useSyncAll';
import type { DataProvider } from '@/types/settings';

const mockToast = jest.fn();

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

jest.mock('@/api/Settings/externalProviderService', () => ({
  ...jest.requireActual('@/api/Settings/externalProviderService'),
  handleManualSyncGarmin: jest.fn(),
}));

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mockSync = handleManualSyncGarmin as jest.MockedFunction<
  typeof handleManualSyncGarmin
>;

const syncResult = (
  overrides: Partial<GarminManualSyncResponse>
): GarminManualSyncResponse => ({
  health: { processedEntries: 1 },
  activities: { processedEntries: 1 },
  nutrition: { processedEntries: 1 },
  failedPhases: [],
  serviceUnreachable: false,
  ...overrides,
});

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, invalidate };
};

const expectGarminStatusInvalidated = (
  invalidate: ReturnType<typeof setup>['invalidate']
) => {
  // The enriched provider list ([...lists(), 'enriched']) matches by prefix.
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: externalProviderKeys.lists(),
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: garminKeys.status });
};

describe('useManualSyncGarminMutation', () => {
  beforeEach(() => jest.clearAllMocks());

  const run = async (result: GarminManualSyncResponse) => {
    mockSync.mockResolvedValueOnce(result);
    const { Wrapper, invalidate } = setup();
    const { result: hook } = renderHook(() => useManualSyncGarminMutation(), {
      wrapper: Wrapper,
    });
    await act(() =>
      hook.current.mutateAsync({
        startDate: '2026-11-01',
        endDate: '2026-11-06',
      })
    );
    return invalidate;
  };

  it('shows no toast when every phase finished', async () => {
    await run(syncResult({}));

    expect(mockToast).not.toHaveBeenCalled();
  });

  it('warns about the failed phases by their translated names', async () => {
    await run(
      syncResult({ failedPhases: ['health', 'activities', 'nutrition'] })
    );

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Garmin sync incomplete',
      description:
        'Some Garmin data could not be synced (Health, Activities, Nutrition). Try again later.',
    });
  });

  it('shows a phase it does not know by its server name', async () => {
    await run(syncResult({ failedPhases: ['sleep'] }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          'Some Garmin data could not be synced (sleep). Try again later.',
      })
    );
  });

  it('says the Garmin service is unreachable', async () => {
    await run(
      syncResult({ failedPhases: ['health'], serviceUnreachable: true })
    );

    expect(mockToast).toHaveBeenCalledWith({
      title: 'Garmin unreachable',
      description:
        'The Garmin service is not reachable. Check that the Garmin microservice is running.',
      variant: 'destructive',
    });
  });

  it('refreshes the provider list and Garmin status after a successful sync', async () => {
    const invalidate = await run(syncResult({}));

    expectGarminStatusInvalidated(invalidate);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dailyProgressKeys.all,
    });
  });

  it('refreshes them when the service was unreachable', async () => {
    const invalidate = await run(
      syncResult({ failedPhases: ['health'], serviceUnreachable: true })
    );

    expectGarminStatusInvalidated(invalidate);
  });

  it('refreshes them when the sync request fails', async () => {
    mockSync.mockRejectedValueOnce(new Error('network down'));
    const { Wrapper, invalidate } = setup();
    const { result: hook } = renderHook(() => useManualSyncGarminMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(hook.current.mutateAsync({})).rejects.toThrow(
        'network down'
      );
    });

    expectGarminStatusInvalidated(invalidate);
  });
});

describe('useSyncAllMutation with Garmin', () => {
  beforeEach(() => jest.clearAllMocks());

  const garmin = {
    id: 'garmin-1',
    provider_type: 'garmin',
    is_active: true,
  } as DataProvider;

  const syncAll = async () => {
    const { Wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSyncAllMutation(), {
      wrapper: Wrapper,
    });
    await act(() => result.current.mutateAsync([garmin]));
    return invalidate;
  };

  it('shows the Garmin warning instead of a success toast', async () => {
    mockSync.mockResolvedValueOnce(
      syncResult({ failedPhases: ['nutrition'], serviceUnreachable: true })
    );

    const invalidate = await syncAll();

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Garmin unreachable',
        variant: 'destructive',
      })
    );
    expectGarminStatusInvalidated(invalidate);
  });

  it('counts a complete Garmin sync as a success', async () => {
    mockSync.mockResolvedValueOnce(syncResult({}));

    const invalidate = await syncAll();

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Success' })
    );
    expectGarminStatusInvalidated(invalidate);
  });

  it('keeps an earlier Garmin warning when a later Garmin sync is clean', async () => {
    mockSync
      .mockResolvedValueOnce(syncResult({ failedPhases: ['nutrition'] }))
      .mockResolvedValueOnce(syncResult({}));
    const { Wrapper } = setup();
    const { result } = renderHook(() => useSyncAllMutation(), {
      wrapper: Wrapper,
    });

    await act(() =>
      result.current.mutateAsync([
        garmin,
        { ...garmin, id: 'garmin-2' } as DataProvider,
      ])
    );

    expect(mockToast).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Garmin sync incomplete' })
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Success',
        description: 'Successfully synchronized 1 provider(s).',
      })
    );
  });

  it('refreshes the Garmin status when its sync request fails', async () => {
    mockSync.mockRejectedValueOnce(new Error('network down'));

    const invalidate = await syncAll();

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error' })
    );
    expectGarminStatusInvalidated(invalidate);
  });
});
