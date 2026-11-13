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

describe('adaptive activity preference persistence', () => {
  it.each([true, false, undefined])(
    'binds %s without coercion and preserves omitted values on update/upsert',
    async (value) => {
      await preferenceRepository.updateUserPreferences('user-1', {
        adaptive_activity_separate: value,
      });
      await preferenceRepository.upsertUserPreferences({
        user_id: 'user-1',
        adaptive_activity_separate: value,
      });
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain('adaptive_activity_separate = COALESCE($57,');
        expect(params[56]).toBe(value);
      }
    }
  );
});
