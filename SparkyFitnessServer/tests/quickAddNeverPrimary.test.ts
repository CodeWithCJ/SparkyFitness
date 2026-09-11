import { describe, expect, it, vi, beforeEach } from 'vitest';
import waterContainerRepository from '../models/waterContainerRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('Quick-Add Presets Never Primary (#1958, #1925, #2115)', () => {
  const userId = 'user-test-uuid';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects createWaterContainer with is_quick_add = true and is_primary = true', async () => {
    await expect(
      waterContainerRepository.createWaterContainer(userId, {
        name: 'Espresso',
        volume: 30,
        unit: 'ml',
        is_primary: true,
        is_quick_add: true,
      })
    ).rejects.toThrow(/Quick-add drink presets cannot be set as the primary/i);
  });

  it('rejects setPrimaryWaterContainer on a quick-add container in repository', async () => {
    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql === 'BEGIN') return {};
        if (sql === 'ROLLBACK') return {};
        if (sql.includes('SELECT is_quick_add FROM user_water_containers')) {
          return { rows: [{ is_quick_add: true }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.mocked(getClient).mockResolvedValue(mockClient as any);

    await expect(
      waterContainerRepository.setPrimaryWaterContainer(10, userId)
    ).rejects.toThrow(/Quick-add drink presets cannot be set as the primary/i);

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  const updateMockClient = (current: {
    is_primary: boolean;
    is_quick_add: boolean;
  }) => ({
    query: vi.fn().mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN') return {};
      if (sql === 'ROLLBACK') return {};
      // Match the row lookup by its target, not by its column list: the
      // guard's SELECT grows as more fields are judged on the resulting row.
      if (sql.includes('FROM user_water_containers WHERE id = $1')) {
        return { rows: [current] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  });

  it('rejects updateWaterContainer making a quick-add container primary', async () => {
    const mockClient = updateMockClient({
      is_primary: false,
      is_quick_add: true,
    });

    vi.mocked(getClient).mockResolvedValue(mockClient as any);

    await expect(
      waterContainerRepository.updateWaterContainer(10, userId, {
        is_primary: true,
      })
    ).rejects.toThrow(/Quick-add drink presets cannot be set as the primary/i);

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rejects updateWaterContainer setting both flags in one request', async () => {
    // The container is neither flag today, so checking only its stored
    // is_quick_add let this request through and produced a container that was
    // primary and quick-add at once.
    const mockClient = updateMockClient({
      is_primary: false,
      is_quick_add: false,
    });

    vi.mocked(getClient).mockResolvedValue(mockClient as any);

    await expect(
      waterContainerRepository.updateWaterContainer(10, userId, {
        is_primary: true,
        is_quick_add: true,
      })
    ).rejects.toThrow(/Quick-add drink presets cannot be set as the primary/i);

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects making an already-primary container quick-add', async () => {
    // is_primary is absent from this update, so the old guard never ran.
    const mockClient = updateMockClient({
      is_primary: true,
      is_quick_add: false,
    });

    vi.mocked(getClient).mockResolvedValue(mockClient as any);

    await expect(
      waterContainerRepository.updateWaterContainer(10, userId, {
        is_quick_add: true,
      })
    ).rejects.toThrow(/Quick-add drink presets cannot be set as the primary/i);

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('getPrimaryWaterContainerByUserId query filters out quick-add containers', async () => {
    let executedSql = '';
    const mockClient = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        executedSql = sql;
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    vi.mocked(getClient).mockResolvedValue(mockClient as any);

    const result =
      await waterContainerRepository.getPrimaryWaterContainerByUserId(userId);

    expect(result).toBeNull();
    expect(executedSql).toContain('c.is_primary = TRUE');
    expect(executedSql).toContain('c.is_quick_add IS FALSE');
  });
});
