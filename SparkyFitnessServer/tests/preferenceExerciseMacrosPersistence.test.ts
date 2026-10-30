import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';

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

describe('exercise macro preference persistence', () => {
  it.each([true, false, undefined])(
    'preserves %s on update/upsert',
    async (value) => {
      await preferenceRepository.updateUserPreferences('user-1', {
        adjust_macros_with_exercise: value,
      });
      await preferenceRepository.upsertUserPreferences({
        user_id: 'user-1',
        adjust_macros_with_exercise: value,
      });
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain('adjust_macros_with_exercise = COALESCE($59,');
        expect(params[58]).toBe(value);
      }
    }
  );
});
