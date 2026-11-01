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

describe('Move ring active calories preference persistence', () => {
  it.each([true, false, undefined])(
    'binds %s without coercion and preserves omitted values on update/upsert',
    async (value) => {
      await preferenceRepository.updateUserPreferences('user-1', {
        use_move_ring_active_calories: value,
      });
      await preferenceRepository.upsertUserPreferences({
        user_id: 'user-1',
        use_move_ring_active_calories: value,
      });
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain('use_move_ring_active_calories = COALESCE($59,');
        expect(params[58]).toBe(value);
      }
    }
  );
});
