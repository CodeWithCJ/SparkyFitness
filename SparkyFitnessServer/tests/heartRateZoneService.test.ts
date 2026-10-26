import { vi, beforeEach, describe, expect, it } from 'vitest';
import heartRateZoneService from '../services/heartRateZoneService.js';
import {
  getHeartRateZoneSettings,
  saveHeartRateZoneSettings,
} from '../models/heartRateZoneRepository.js';
import userRepository from '../models/userRepository.js';
import { ValidationError } from '../utils/errors.js';

vi.mock('../models/heartRateZoneRepository.js', () => ({
  getHeartRateZoneSettings: vi.fn(),
  saveHeartRateZoneSettings: vi.fn(),
}));
vi.mock('../models/userRepository.js', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('@workspace/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/shared')>()),
  todayInZone: () => '2026-10-19',
}));

const defaults = {
  maxHeartRate: null,
  restingHeartRate: null,
  method: 'percent_max' as const,
  customFloors: null,
  displayZones: 5 as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getHeartRateZoneSettings).mockResolvedValue({ ...defaults });
  vi.mocked(userRepository.getUserProfile).mockResolvedValue({
    date_of_birth: '1990-10-19',
  } as never);
  vi.mocked(saveHeartRateZoneSettings).mockImplementation(
    async (_u, _a, settings) => settings
  );
});

describe('resolveZonesForUser', () => {
  it('keeps the zones people who set nothing have always had', async () => {
    const resolved = await heartRateZoneService.resolveZonesForUser('u1');
    // Age 36 -> Nes 188 -> 50..90%.
    expect(resolved.maxHrSource).toBe('age');
    expect(resolved.floors).toEqual([94, 113, 132, 150, 169]);
  });

  it('uses the max heart rate the person set', async () => {
    vi.mocked(getHeartRateZoneSettings).mockResolvedValue({
      ...defaults,
      maxHeartRate: 200,
    });
    const resolved = await heartRateZoneService.resolveZonesForUser('u1');
    expect(resolved.maxHrSource).toBe('user');
    expect(resolved.floors).toEqual([100, 120, 140, 160, 180]);
  });

  it('falls back to the observed maximum with no date of birth', async () => {
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({} as never);
    const resolved = await heartRateZoneService.resolveZonesForUser('u1', 205);
    expect(resolved.maxHr).toBe(205);
    expect(resolved.maxHrSource).toBe('observed');
  });
});

describe('getHeartRateZones', () => {
  it('returns the stored settings with the zones they produce', async () => {
    const result = await heartRateZoneService.getHeartRateZones('u1', 'u1');
    expect(result.settings.method).toBe('percent_max');
    expect(result.resolved.max_hr).toBe(188);
    expect(result.resolved.zones).toHaveLength(5);
    expect(result.resolved.zones[4].upper_bpm).toBeNull();
  });
});

describe('updateHeartRateZones', () => {
  it('merges a partial update into the stored settings', async () => {
    vi.mocked(getHeartRateZoneSettings).mockResolvedValue({
      ...defaults,
      restingHeartRate: 55,
    });
    const result = await heartRateZoneService.updateHeartRateZones('u1', 'u1', {
      max_heart_rate: 182,
    });
    expect(saveHeartRateZoneSettings).toHaveBeenCalledWith('u1', 'u1', {
      ...defaults,
      maxHeartRate: 182,
      restingHeartRate: 55,
    });
    expect(result.resolved.max_hr_source).toBe('user');
  });

  it('clears a field sent as null', async () => {
    vi.mocked(getHeartRateZoneSettings).mockResolvedValue({
      ...defaults,
      maxHeartRate: 190,
    });
    await heartRateZoneService.updateHeartRateZones('u1', 'u1', {
      max_heart_rate: null,
    });
    expect(saveHeartRateZoneSettings).toHaveBeenCalledWith(
      'u1',
      'u1',
      expect.objectContaining({ maxHeartRate: null })
    );
  });

  it('saves the display count without touching the zones', async () => {
    await heartRateZoneService.updateHeartRateZones('u1', 'u1', {
      display_zones: 4,
    });
    expect(saveHeartRateZoneSettings).toHaveBeenCalledWith(
      'u1',
      'u1',
      expect.objectContaining({ displayZones: 4, method: 'percent_max' })
    );
  });

  it('resets everything to the defaults', async () => {
    vi.mocked(getHeartRateZoneSettings).mockResolvedValue({
      maxHeartRate: 190,
      restingHeartRate: 50,
      method: 'heart_rate_reserve',
      customFloors: null,
      displayZones: 4,
    });
    await heartRateZoneService.updateHeartRateZones('u1', 'u1', {
      reset: true,
    });
    expect(saveHeartRateZoneSettings).toHaveBeenCalledWith(
      'u1',
      'u1',
      defaults
    );
  });

  it('refuses heart rate reserve without a resting rate', async () => {
    await expect(
      heartRateZoneService.updateHeartRateZones('u1', 'u1', {
        method: 'heart_rate_reserve',
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(saveHeartRateZoneSettings).not.toHaveBeenCalled();
  });

  it('refuses a resting rate at or above the max heart rate', async () => {
    await expect(
      heartRateZoneService.updateHeartRateZones('u1', 'u1', {
        max_heart_rate: 150,
        resting_heart_rate: 150,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('judges heart rate reserve against the age-derived max when none is set', async () => {
    const result = await heartRateZoneService.updateHeartRateZones('u1', 'u1', {
      method: 'heart_rate_reserve',
      resting_heart_rate: 60,
    });
    // Age 36 -> max 188, reserve 128: 60 + 64 for zone 1.
    expect(result.resolved.effective_method).toBe('heart_rate_reserve');
    expect(result.resolved.zones[0].lower_bpm).toBe(124);
  });

  it('refuses custom zones with no floors stored or sent', async () => {
    await expect(
      heartRateZoneService.updateHeartRateZones('u1', 'u1', {
        method: 'custom',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts custom zones and returns them as the zones in use', async () => {
    const result = await heartRateZoneService.updateHeartRateZones('u1', 'u1', {
      method: 'custom',
      custom_floors: [100, 118, 136, 154, 172],
    });
    expect(result.resolved.effective_method).toBe('custom');
    expect(result.resolved.zones.map((zone) => zone.lower_bpm)).toEqual([
      100, 118, 136, 154, 172,
    ]);
  });
});
