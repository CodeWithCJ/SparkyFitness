import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEMPERATURE_UNITS,
  convertTemperature,
  convertTemperatureDelta,
  isTemperatureUnit,
} from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';
import preferenceService from '../services/preferenceService.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
const query =
  vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: object[] }>>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  query.mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
  vi.mocked(getClient).mockResolvedValue({
    query,
    release: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof getClient>>);
});

describe('temperature unit preference', () => {
  it.each(['fahrenheit', 'celsius', undefined] as const)(
    'binds %s and keeps the stored value when it is omitted',
    async (value) => {
      await preferenceRepository.updateUserPreferences('user-1', {
        default_temperature_unit: value,
      });
      await preferenceRepository.upsertUserPreferences({
        user_id: 'user-1',
        default_temperature_unit: value,
      });
      const [[updateSql, updateParams], [upsertSql, upsertParams]] =
        query.mock.calls;
      expect(updateSql).toContain(
        'default_temperature_unit = COALESCE($61, default_temperature_unit)'
      );
      expect(upsertSql).toContain(
        'default_temperature_unit = COALESCE($61, user_preferences.default_temperature_unit)'
      );
      expect(upsertSql).toContain("COALESCE($61, 'celsius')");
      expect(updateParams[60]).toBe(value);
      expect(upsertParams[60]).toBe(value);
    }
  );

  it.each(TEMPERATURE_UNITS)('accepts %s', async (unit) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        default_temperature_unit: unit,
      })
    ).resolves.toEqual({ user_id: 'user-1' });
  });

  it.each(['kelvin', 1, null])('rejects %s with a 400', async (unit) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        default_temperature_unit: unit,
      } as never)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      preferenceService.upsertUserPreferences('user-1', {
        user_id: 'user-1',
        default_temperature_unit: unit,
      } as never)
    ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('shared temperature helpers', () => {
  it('converts a temperature with the 32° offset', () => {
    expect(convertTemperature(0, 'fahrenheit')).toBe(32);
    expect(convertTemperature(37, 'fahrenheit')).toBeCloseTo(98.6);
    expect(convertTemperature(37, 'celsius')).toBe(37);
  });

  it('converts a difference without the offset', () => {
    expect(convertTemperatureDelta(-0.5, 'fahrenheit')).toBeCloseTo(-0.9);
    expect(convertTemperatureDelta(-0.5, 'celsius')).toBe(-0.5);
  });

  it('recognises only the supported units', () => {
    expect(isTemperatureUnit('fahrenheit')).toBe(true);
    expect(isTemperatureUnit('F')).toBe(false);
    expect(isTemperatureUnit(undefined)).toBe(false);
  });
});
