import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import waterContainerRepository from '../models/waterContainerRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('waterContainerRepository single-primary enforcement', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  const queryTexts = (): string[] =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mock.calls.map((call: any[]) => call[0] as string);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const demoteQueries = (): Array<{ text: string; values: any[] }> =>
    mockClient.query.mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((call: any[]) => ({ text: call[0] as string, values: call[1] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((call: any) => call.text.includes('SET is_primary = false'));

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{}] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createWaterContainer', () => {
    it('demotes existing primaries before inserting a primary container', async () => {
      await waterContainerRepository.createWaterContainer('user-1', {
        name: 'Bottle',
        volume: 750,
        unit: 'ml',
        is_primary: true,
        servings_per_container: 1,
      });

      const demotes = demoteQueries();
      expect(demotes).toHaveLength(1);
      expect(demotes[0].values).toEqual(['user-1']);

      const texts = queryTexts();
      const demoteIndex = texts.findIndex((text) =>
        text.includes('SET is_primary = false')
      );
      const insertIndex = texts.findIndex((text) =>
        text.includes('INSERT INTO user_water_containers')
      );
      expect(demoteIndex).toBeLessThan(insertIndex);
      expect(texts.indexOf('BEGIN')).toBeLessThan(demoteIndex);
      expect(texts.indexOf('COMMIT')).toBeGreaterThan(insertIndex);
    });

    it('does not demote anything for a non-primary container', async () => {
      await waterContainerRepository.createWaterContainer('user-1', {
        name: 'Bottle',
        volume: 750,
        unit: 'ml',
        is_primary: false,
        servings_per_container: 1,
      });

      expect(demoteQueries()).toHaveLength(0);
    });

    it('does not demote anything when is_primary is omitted', async () => {
      await waterContainerRepository.createWaterContainer('user-1', {
        name: 'Bottle',
        volume: 750,
        unit: 'ml',
      });

      expect(demoteQueries()).toHaveLength(0);
    });

    it('rolls back when the insert fails', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient.query.mockImplementation(async (text: any) => {
        if (typeof text === 'string' && text.includes('INSERT INTO')) {
          throw new Error('insert failed');
        }
        return { rows: [{}] };
      });

      await expect(
        waterContainerRepository.createWaterContainer('user-1', {
          name: 'Bottle',
          volume: 750,
          unit: 'ml',
          is_primary: true,
        })
      ).rejects.toThrow('insert failed');

      expect(queryTexts()).toContain('ROLLBACK');
      expect(queryTexts()).not.toContain('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('updateWaterContainer', () => {
    it('demotes other containers when promoting one to primary', async () => {
      await waterContainerRepository.updateWaterContainer(7, 'user-1', {
        is_primary: true,
      });

      const demotes = demoteQueries();
      expect(demotes).toHaveLength(1);
      expect(demotes[0].values).toEqual(['user-1', 7]);
      expect(demotes[0].text).toContain('id != $2');
    });

    it('does not demote anything when is_primary is not in the payload', async () => {
      await waterContainerRepository.updateWaterContainer(7, 'user-1', {
        name: 'Renamed',
      });

      expect(demoteQueries()).toHaveLength(0);
    });

    it('does not demote anything when setting is_primary to false', async () => {
      await waterContainerRepository.updateWaterContainer(7, 'user-1', {
        is_primary: false,
      });

      expect(demoteQueries()).toHaveLength(0);
    });

    it('does not demote anything when the target container is missing or foreign', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient.query.mockImplementation(async (text: any) => {
        if (typeof text === 'string' && text.includes('COALESCE')) {
          return { rows: [] };
        }
        return { rows: [{}] };
      });

      const result = await waterContainerRepository.updateWaterContainer(
        999,
        'user-1',
        { is_primary: true }
      );

      expect(result).toBeUndefined();
      expect(demoteQueries()).toHaveLength(0);
    });
  });

  describe('setPrimaryWaterContainer', () => {
    it('demotes the other containers after promoting the target', async () => {
      await waterContainerRepository.setPrimaryWaterContainer(7, 'user-1');

      const demotes = demoteQueries();
      expect(demotes).toHaveLength(1);
      expect(demotes[0].values).toEqual(['user-1', 7]);
      expect(demotes[0].text).toContain('id != $2');
    });

    it('does not demote anything when the target container is missing or foreign', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient.query.mockImplementation(async (text: any) => {
        if (typeof text === 'string' && text.includes('is_primary = true')) {
          return { rows: [] };
        }
        return { rows: [{}] };
      });

      const result = await waterContainerRepository.setPrimaryWaterContainer(
        999,
        'user-1'
      );

      expect(result).toBeUndefined();
      expect(demoteQueries()).toHaveLength(0);
    });
  });
});
