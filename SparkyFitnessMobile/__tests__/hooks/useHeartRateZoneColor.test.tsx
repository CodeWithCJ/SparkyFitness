import { renderHook, waitFor } from '@testing-library/react-native';
import { HEART_RATE_ZONE_COLORS } from '@workspace/shared';
import { useHeartRateZoneColor } from '../../src/hooks/useHeartRateZoneColor';
import { fetchHeartRateZones } from '../../src/services/api/heartRateZonesApi';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/heartRateZonesApi', () => ({
  fetchHeartRateZones: jest.fn(),
}));
const fetchZones = jest.mocked(fetchHeartRateZones);

const zones = (lowers: number[]) =>
  ({
    resolved: {
      zones: lowers.map((lower_bpm, i) => ({ zone: i + 1, lower_bpm })),
    },
  }) as unknown as Awaited<ReturnType<typeof fetchHeartRateZones>>;

describe('useHeartRateZoneColor', () => {
  beforeEach(() => {
    fetchZones.mockReset();
  });

  it('colors a reading from the person zones once they load', async () => {
    fetchZones.mockResolvedValue(zones([95, 114, 133, 152, 171]));
    const { result } = renderHook(() => useHeartRateZoneColor(160), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(HEART_RATE_ZONE_COLORS[3]));
  });

  it('does not fetch zones without a reading', () => {
    const { result } = renderHook(() => useHeartRateZoneColor(null), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    expect(result.current).toBeNull();
    expect(fetchZones).not.toHaveBeenCalled();
  });
});
