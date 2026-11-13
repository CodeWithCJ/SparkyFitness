import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getHeartRateZoneSettings,
  saveHeartRateZoneSettings,
} from '../models/heartRateZoneRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

const query = vi.fn();
const release = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('heartRateZoneRepository', () => {
  it('returns the defaults when the person has no preferences row', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await getHeartRateZoneSettings('u1')).toEqual({
      maxHeartRate: null,
      restingHeartRate: null,
      method: 'percent_max',
      customFloors: null,
      displayZones: 5,
    });
    expect(release).toHaveBeenCalled();
  });

  it('maps a stored row', async () => {
    query.mockResolvedValue({
      rows: [
        {
          max_heart_rate: 185,
          resting_heart_rate: 52,
          hr_zone_method: 'custom',
          hr_zone_custom_floors: [100, 118, 136, 154, 172],
          hr_zone_display_count: 4,
        },
      ],
    });
    expect(await getHeartRateZoneSettings('u1', 'u1')).toEqual({
      maxHeartRate: 185,
      restingHeartRate: 52,
      method: 'custom',
      customFloors: [100, 118, 136, 154, 172],
      displayZones: 4,
    });
    expect(getClient).toHaveBeenCalledWith('u1', 'u1');
  });

  it('treats an unknown stored method as the default', async () => {
    query.mockResolvedValue({
      rows: [
        {
          max_heart_rate: null,
          resting_heart_rate: null,
          hr_zone_method: 'mystery',
          hr_zone_custom_floors: null,
        },
      ],
    });
    expect((await getHeartRateZoneSettings('u1')).method).toBe('percent_max');
  });

  it('upserts all four settings under the acting user', async () => {
    query.mockResolvedValue({
      rows: [
        {
          max_heart_rate: 185,
          resting_heart_rate: null,
          hr_zone_method: 'percent_max',
          hr_zone_custom_floors: null,
        },
      ],
    });
    await saveHeartRateZoneSettings('u1', 'u1', {
      maxHeartRate: 185,
      restingHeartRate: null,
      method: 'percent_max',
      customFloors: null,
      displayZones: 4,
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(params).toEqual(['u1', 185, null, 'percent_max', null, 4]);
    expect(release).toHaveBeenCalled();
  });
});
