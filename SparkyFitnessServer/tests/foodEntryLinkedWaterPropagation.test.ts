import { vi, beforeEach, describe, expect, it } from 'vitest';
import foodEntryService from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../models/foodRepository');
vi.mock('../models/measurementRepository');
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

describe('Food Entry Linked Water Propagation (#2115)', () => {
  const mockUserId = 'user-uuid-1';
  const mockEntryId = 'food-entry-uuid-1';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS mock
    getClient.mockResolvedValue(mockClient);
  });

  describe('updateFoodEntry - linked water row update', () => {
    it('updates linked water_intake_entries row and recomputes aggregates', async () => {
      // @ts-expect-error TS mock
      foodRepository.getFoodEntryOwnerId.mockResolvedValue(mockUserId);
      // @ts-expect-error TS mock
      foodRepository.getFoodEntryById.mockResolvedValue({
        id: mockEntryId,
        user_id: mockUserId,
        food_id: 'food-1',
        variant_id: 'var-1',
        entry_date: '2026-09-05',
        quantity: 1,
        unit: 'cup',
        water_ml: 200,
        serving_size: 1,
      });

      // @ts-expect-error TS mock
      foodRepository.getFoodById.mockResolvedValue({
        id: 'food-1',
        name: 'Coffee',
        food_variants: [
          {
            id: 'var-1',
            calories: 5,
            protein: 0,
            carbs: 1,
            fat: 0,
            serving_size: 1,
            serving_unit: 'cup',
            water_ml: 200,
          },
        ],
      });

      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue({
        id: 'var-1',
        calories: 5,
        protein: 0,
        carbs: 1,
        fat: 0,
        serving_size: 1,
        serving_unit: 'cup',
        water_ml: 200,
      });

      // @ts-expect-error TS mock
      foodRepository.updateFoodEntry.mockResolvedValue({
        id: mockEntryId,
        user_id: mockUserId,
        food_id: 'food-1',
        variant_id: 'var-1',
        entry_date: '2026-09-05',
        quantity: 2,
        unit: 'cup',
        water_ml: 200,
        serving_size: 1,
      });

      // Dispatch on the SQL rather than on call order: the ledger write and the
      // aggregate recompute now share one transaction, so BEGIN/COMMIT are in
      // this sequence too.
      mockClient.query.mockImplementation((sql: string) => {
        if (
          typeof sql === 'string' &&
          sql.includes('FROM water_intake_entries')
        ) {
          return Promise.resolve({
            rows: [
              {
                id: 'water-log-1',
                entry_date: '2026-09-05',
                hydration_factor: 0.8,
                source: 'manual',
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await foodEntryService.updateFoodEntry(
        mockUserId,
        mockUserId,
        mockEntryId,
        {
          quantity: 2,
        }
      );

      // Verify that water_intake_entries was updated with quantity * water_ml * factor (2 * 200 * 0.8 = 320)
      const updateCall = mockClient.query.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE water_intake_entries')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe(320); // newWaterMl
      expect(updateCall[1][1]).toBe('2026-09-05'); // newDate
      expect(updateCall[1][2]).toBe('water-log-1'); // logId

      // The ledger write and the recompute run on the same client inside one
      // transaction, so this takes the client-accepting form.
      expect(
        measurementRepository.recomputeWaterAggregate
      ).toHaveBeenCalledWith(
        mockClient,
        mockUserId,
        mockUserId,
        '2026-09-05',
        'manual'
      );
      const sqlSeen = mockClient.query.mock.calls.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]
      );
      expect(sqlSeen).toContain('BEGIN');
      expect(sqlSeen).toContain('COMMIT');
    });
  });

  describe('deleteFoodEntry - linked water row cleanup', () => {
    it('deletes linked water_intake_entries row and recomputes aggregates', async () => {
      // @ts-expect-error TS mock
      foodRepository.getFoodEntryOwnerId.mockResolvedValue(mockUserId);
      // @ts-expect-error TS mock
      foodRepository.getFoodEntryById.mockResolvedValue({
        id: mockEntryId,
        user_id: mockUserId,
        entry_date: '2026-09-05',
      });

      // @ts-expect-error TS mock
      foodRepository.deleteFoodEntry.mockResolvedValue(true);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'water-log-1',
            entry_date: '2026-09-05',
            source: 'manual',
          },
        ],
      }); // SELECT from water_intake_entries

      await foodEntryService.deleteFoodEntry(mockUserId, mockEntryId);

      // The ledger row is NOT deleted here: water_intake_entries.food_entry_id
      // is ON DELETE CASCADE, so removing the food entry removes it. Deleting
      // it first meant a failure below left the water credit gone and the diary
      // entry still standing.
      expect(measurementRepository.deleteWaterIntakeLog).not.toHaveBeenCalled();
      expect(foodRepository.deleteFoodEntry).toHaveBeenCalledWith(
        mockEntryId,
        mockUserId
      );

      // ...and the aggregate is rebuilt only once the cascade has fired.
      expect(
        measurementRepository.recomputeWaterAggregateForUser
      ).toHaveBeenCalledWith(mockUserId, mockUserId, '2026-09-05', 'manual');
      const deleteOrder = (
        foodRepository.deleteFoodEntry as unknown as {
          mock: { invocationCallOrder: number[] };
        }
      ).mock.invocationCallOrder[0]!;
      const recomputeOrder = (
        measurementRepository.recomputeWaterAggregateForUser as unknown as {
          mock: { invocationCallOrder: number[] };
        }
      ).mock.invocationCallOrder[0]!;
      expect(recomputeOrder).toBeGreaterThan(deleteOrder);
    });

    it('leaves the linked water row alone when the food entry delete fails', async () => {
      // @ts-expect-error TS mock
      foodRepository.getFoodEntryOwnerId.mockResolvedValue(mockUserId);
      // @ts-expect-error TS mock
      foodRepository.getFoodEntryById.mockResolvedValue({
        id: mockEntryId,
        user_id: mockUserId,
        entry_date: '2026-09-05',
      });
      // @ts-expect-error TS mock
      foodRepository.deleteFoodEntry.mockResolvedValue(false);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'water-log-1',
            entry_date: '2026-09-05',
            source: 'manual',
          },
        ],
      });

      await expect(
        foodEntryService.deleteFoodEntry(mockUserId, mockEntryId)
      ).rejects.toThrow('Food entry not found or not authorized to delete.');

      expect(measurementRepository.deleteWaterIntakeLog).not.toHaveBeenCalled();
      expect(
        measurementRepository.recomputeWaterAggregateForUser
      ).not.toHaveBeenCalled();
    });
  });
});
