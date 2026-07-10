import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import mealTypeRepository from '../models/mealType.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('mealTypeRepository default_time tests', () => {
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('updateMealType default_time', () => {
    it('should upsert default_time in user_meal_visibilities when provided', async () => {
      const mealTypeId = uuidv4();
      const userId = uuidv4();
      const data = { default_time: '11:30' };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve();
        return Promise.resolve({
          rows: [{ id: mealTypeId, default_time: '11:30' }],
        });
      });

      await mealTypeRepository.updateMealType(mealTypeId, data, userId);

      const visibilityUpsertCall = mockClient.query.mock.calls.find(
        (call: any[]) => call[0].includes('INSERT INTO user_meal_visibilities')
      );
      expect(visibilityUpsertCall).toBeDefined();
      expect(visibilityUpsertCall![1][4]).toBe(true); // $5 boolean flag (default_time !== undefined)
      expect(visibilityUpsertCall![1][5]).toBe('11:30'); // $6 default_time
    });

    it('should support clearing default_time by passing null', async () => {
      const mealTypeId = uuidv4();
      const userId = uuidv4();
      const data = { default_time: null };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve();
        return Promise.resolve({
          rows: [{ id: mealTypeId, default_time: null }],
        });
      });

      await mealTypeRepository.updateMealType(mealTypeId, data, userId);

      const visibilityUpsertCall = mockClient.query.mock.calls.find(
        (call: any[]) => call[0].includes('INSERT INTO user_meal_visibilities')
      );
      expect(visibilityUpsertCall).toBeDefined();
      expect(visibilityUpsertCall![1][4]).toBe(true); // $5 flag is true
      expect(visibilityUpsertCall![1][5]).toBeNull(); // $6 default_time is null
    });
  });
});
