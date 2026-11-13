import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HeartRateZonesResponse } from '@workspace/shared';
import { useResolvedHeartRateZones } from '@/hooks/Settings/useHeartRateZones';
import { getHeartRateZones } from '@/api/Settings/heartRateZones';

jest.mock('@/api/Settings/heartRateZones', () => ({
  getHeartRateZones: jest.fn(),
  updateHeartRateZones: jest.fn(),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const response: HeartRateZonesResponse = {
  settings: {
    max_heart_rate: 188,
    resting_heart_rate: 77,
    method: 'custom',
    custom_floors: [30, 140, 152, 164, 176],
    display_zones: 4,
  },
  resolved: {
    max_hr: 188,
    max_hr_source: 'user',
    resting_hr: 77,
    method: 'custom',
    effective_method: 'custom',
    zones: [
      { zone: 1, lower_bpm: 30, upper_bpm: 139 },
      { zone: 2, lower_bpm: 140, upper_bpm: 151 },
      { zone: 3, lower_bpm: 152, upper_bpm: 163 },
      { zone: 4, lower_bpm: 164, upper_bpm: 175 },
      { zone: 5, lower_bpm: 176, upper_bpm: null },
    ],
  },
};

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useResolvedHeartRateZones(), { wrapper }),
  };
};

describe('useResolvedHeartRateZones', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the shared defaults until the person zones load', () => {
    jest.mocked(getHeartRateZones).mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    expect(result.current.isDefault).toBe(true);
    expect(result.current.displayZones).toBe(5);
    expect(result.current.bands).toHaveLength(5);
  });

  it('follows the saved zones and the four-tier choice', async () => {
    jest.mocked(getHeartRateZones).mockResolvedValue(response);
    const { result } = setup();
    await waitFor(() => expect(result.current.isDefault).toBe(false));
    expect(result.current.bands.map((b) => b.tier)).toEqual([
      'light',
      'moderate',
      'vigorous',
      'peak',
    ]);
    expect(result.current.bands[0]?.lowerBpm).toBe(30);
  });

  it('keeps the person zones when a background refetch fails', async () => {
    jest.mocked(getHeartRateZones).mockResolvedValueOnce(response);
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isDefault).toBe(false));

    jest.mocked(getHeartRateZones).mockRejectedValueOnce(new Error('offline'));
    await client.refetchQueries({ queryKey: ['preferences'] }).catch(() => {});
    await waitFor(() =>
      expect(
        client.getQueryState(['preferences', 'heart-rate-zones'])?.status
      ).toBe('error')
    );
    expect(result.current.isDefault).toBe(false);
    expect(result.current.resolved.maxHr).toBe(188);
  });
});
