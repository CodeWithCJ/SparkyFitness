import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import foodEntryRepository from '../models/foodEntry.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('foodEntryRepository time-of-day tests', () => {
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

  describe('createFoodEntry', () => {
    it('should include entry_time parameter in INSERT statement', async () => {
      const userId = uuidv4();
      const foodId = uuidv4();
      const entryData = {
        user_id: userId,
        food_id: foodId,
        meal_type_id: uuidv4(),
        quantity: 1,
        unit: 'g',
        entry_date: '2026-07-10',
        entry_time: '12:30',
      };

      // Mock the transaction queries
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql === 'COMMIT') return Promise.resolve();
        if (sql.includes('SELECT') && sql.includes('foods')) {
          return Promise.resolve({
            rows: [{ food_name: 'Apple', calories: 52 }],
          });
        }
        return Promise.resolve({ rows: [{ id: uuidv4() }] });
      });

      await foodEntryRepository.createFoodEntry(entryData, userId);

      // Verify that mockClient.query was called with entry_time '12:30' as the 40th parameter ($40)
      const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO food_entries')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][39]).toBe('12:30'); // Index 39 is $40
    });
  });

  describe('updateFoodEntry', () => {
    it('should include entry_time parameter in UPDATE statement', async () => {
      const entryId = uuidv4();
      const userId = uuidv4();
      const entryData = {
        quantity: 2,
        entry_time: '18:45',
      };
      const snapshotData = {
        food_name: 'Apple',
        calories: 104,
      };

      mockClient.query.mockResolvedValue({ rows: [{ id: entryId }] });

      await foodEntryRepository.updateFoodEntry(
        entryId,
        userId,
        userId,
        entryData,
        snapshotData
      );

      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE food_entries SET')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1][33]).toBe('18:45'); // Index 33 is $34
    });
  });
});
