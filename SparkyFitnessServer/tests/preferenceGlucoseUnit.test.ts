import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GLUCOSE_UNITS, userPreferencesMutatorSchema } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';
import preferenceService from '../services/preferenceService.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
const query =
  vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: object[] }>>();
beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
  vi.mocked(getClient).mockResolvedValue({
    query,
    release: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof getClient>>);
});

describe('account glucose display unit', () => {
  it.each([...GLUCOSE_UNITS, undefined])(
    'binds %s for updates and upserts, preserving omitted preferences',
    async (value) => {
      await preferenceRepository.updateUserPreferences('user-1', {
        default_glucose_unit: value,
      });
      await preferenceRepository.upsertUserPreferences({
        user_id: 'user-1',
        default_glucose_unit: value,
      });
      const [[updateSql, updateParams], [upsertSql, upsertParams]] =
        query.mock.calls;
      expect(updateSql).toContain(
        'default_glucose_unit = COALESCE($62, default_glucose_unit)'
      );
      expect(upsertSql).toContain(
        'default_glucose_unit = COALESCE($62, user_preferences.default_glucose_unit)'
      );
      expect(upsertSql).toContain("COALESCE($62, 'mmol/L')");
      expect(updateParams[61]).toBe(value);
      expect(upsertParams[61]).toBe(value);
    }
  );
  it.each(GLUCOSE_UNITS)(
    'accepts %s through the service and shared contract',
    async (unit) => {
      expect(
        userPreferencesMutatorSchema.safeParse({ default_glucose_unit: unit })
          .success
      ).toBe(true);
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          default_glucose_unit: unit,
        })
      ).resolves.toEqual({ user_id: 'user-1' });
    }
  );
  it.each(['mg', 'mmol', null, 1])(
    'rejects unsupported unit %s before any database write',
    async (unit) => {
      expect(
        userPreferencesMutatorSchema.safeParse({ default_glucose_unit: unit })
          .success
      ).toBe(false);
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          default_glucose_unit: unit,
        } as never)
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        preferenceService.upsertUserPreferences('user-1', {
          user_id: 'user-1',
          default_glucose_unit: unit,
        } as never)
      ).rejects.toMatchObject({ status: 400 });
      expect(query).not.toHaveBeenCalled();
    }
  );
});
