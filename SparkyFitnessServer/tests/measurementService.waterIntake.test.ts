import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import { UpsertWaterIntakeBodySchema } from '../schemas/measurementSchemas.js';
// Mock the repository functions
vi.mock('../models/measurementRepository');
vi.mock('../models/waterContainerRepository');
// upsertWaterIntake now returns totals through hydrationTotalsService, the
// same owner the GET uses, so the preference read and the food-water read
// have to be mocked here too.
vi.mock('../models/preferenceRepository');
vi.mock('../models/foodMisc');
describe('Measurement Service - Water Intake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  // ---------------------------------------------------------------------------
  // Schema Validation Tests
  // ---------------------------------------------------------------------------
  describe('Schema Validation', () => {
    describe('UpsertWaterIntakeBodySchema', () => {
      it('should accept request with omitted container_id', () => {
        const validData = {
          entry_date: '2023-01-01',
          change_drinks: 2,
          // container_id is omitted
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(validData);
        expect(result.success).toBe(true);
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        expect(result.data.container_id).toBeUndefined();
      });
      it('should accept request with null container_id', () => {
        const validData = {
          entry_date: '2023-01-01',
          change_drinks: 2,
          container_id: null,
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(validData);
        expect(result.success).toBe(true);
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        expect(result.data.container_id).toBeNull();
      });
      it('should accept request with valid container_id', () => {
        const validData = {
          entry_date: '2023-01-01',
          change_drinks: 2,
          container_id: 5,
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(validData);
        expect(result.success).toBe(true);
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        expect(result.data.container_id).toBe(5);
      });
      it('should reject request with missing required fields', () => {
        const invalidData = {
          // missing entry_date and change_drinks
          container_id: 5,
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        // @ts-expect-error TS(2532): Object is possibly 'undefined'.
        expect(result.error.issues).toHaveLength(2);
      });

      // upsertWaterIntake loops once per drink, and since #2115 a single
      // iteration can also insert a food_entries row, so an unbounded or
      // fractional count is an unbounded serial write loop.
      it('rejects a drink count beyond what the UI can issue', () => {
        const result = UpsertWaterIntakeBodySchema.safeParse({
          entry_date: '2023-01-01',
          change_drinks: 5000,
        });
        expect(result.success).toBe(false);
      });

      it('rejects a fractional drink count', () => {
        const result = UpsertWaterIntakeBodySchema.safeParse({
          entry_date: '2023-01-01',
          change_drinks: 2.5,
        });
        expect(result.success).toBe(false);
      });

      it('still accepts a negative count, which is how "-" is expressed', () => {
        const result = UpsertWaterIntakeBodySchema.safeParse({
          entry_date: '2023-01-01',
          change_drinks: -3,
        });
        expect(result.success).toBe(true);
      });
    });
  });
  // ---------------------------------------------------------------------------
  // Service Layer Tests
  // ---------------------------------------------------------------------------
  describe('getWaterIntakeEntryById', () => {
    it('should pass userId to repository functions', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockEntry = { id: mockEntryId, water_ml: 250, user_id: mockUserId };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryById.mockResolvedValue(
        mockEntry
      );
      const result = await measurementService.getWaterIntakeEntryById(
        mockUserId,
        mockEntryId
      );
      expect(
        measurementRepository.getWaterIntakeEntryOwnerId
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
      expect(
        measurementRepository.getWaterIntakeEntryById
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
      expect(result).toEqual(mockEntry);
    });
    it('should throw 404 when entry is not found', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'non-existent-entry';
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(null);
      await expect(
        measurementService.getWaterIntakeEntryById(mockUserId, mockEntryId)
      ).rejects.toThrow('Water intake entry not found.');
      expect(
        measurementRepository.getWaterIntakeEntryOwnerId
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
    });
  });
  describe('upsertWaterIntake', () => {
    const mockUserId = 'test-user-id';
    const entryDate = '2026-08-05';

    beforeEach(() => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.incrementWaterData.mockResolvedValue({});
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.insertWaterIntakeLog.mockResolvedValue({});
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeByDate.mockResolvedValue({});
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeLogByDate.mockResolvedValue([]);
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.deleteWaterIntakeLog.mockResolvedValue(true);
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.recomputeWaterAggregateForUser.mockResolvedValue(0);
    });

    // Phase 2 (#1557/#1629 prep): the decrement branch used to fall back to
    // `remainingDrinks * amountPerDrink` when fewer ledger rows existed than
    // drinks requested, subtracting water no row ever contained. It now
    // recomputes from whatever is left in water_intake_entries instead.
    describe('decrements', () => {
      it('deletes each of the N most recent ledger rows and recomputes, with no incrementWaterData call', async () => {
        // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
        measurementRepository.getWaterIntakeLogByDate.mockResolvedValue([
          { id: 'log-1', water_ml: 250 },
          { id: 'log-2', water_ml: 250 },
        ]);

        await measurementService.upsertWaterIntake(
          mockUserId,
          mockUserId,
          entryDate,
          -2,
          null
        );

        expect(
          measurementRepository.deleteWaterIntakeLog
        ).toHaveBeenCalledTimes(2);
        expect(measurementRepository.deleteWaterIntakeLog).toHaveBeenCalledWith(
          'log-1',
          mockUserId
        );
        expect(measurementRepository.deleteWaterIntakeLog).toHaveBeenCalledWith(
          'log-2',
          mockUserId
        );
        expect(
          measurementRepository.recomputeWaterAggregateForUser
        ).toHaveBeenCalledWith(mockUserId, mockUserId, entryDate, 'manual');
        // The old incremental-delta path must be gone from this branch.
        expect(measurementRepository.incrementWaterData).not.toHaveBeenCalled();
      });

      it('removes only what exists and still recomputes when fewer ledger rows exist than requested — no phantom subtraction', async () => {
        // Only 1 row exists, but the caller asks to remove 3 "drinks".
        // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
        measurementRepository.getWaterIntakeLogByDate.mockResolvedValue([
          { id: 'log-1', water_ml: 250 },
        ]);
        // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
        waterContainerRepository.getWaterContainerById.mockResolvedValue(
          undefined
        );

        await measurementService.upsertWaterIntake(
          mockUserId,
          mockUserId,
          entryDate,
          -3,
          null
        );

        // Exactly the one row that exists is deleted — no phantom volume for
        // the two "drinks" that had no backing row.
        expect(
          measurementRepository.deleteWaterIntakeLog
        ).toHaveBeenCalledTimes(1);
        expect(
          measurementRepository.recomputeWaterAggregateForUser
        ).toHaveBeenCalledWith(mockUserId, mockUserId, entryDate, 'manual');
        expect(measurementRepository.incrementWaterData).not.toHaveBeenCalled();
      });

      it('recomputes (a no-op total) even when there are no ledger rows at all', async () => {
        // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
        measurementRepository.getWaterIntakeLogByDate.mockResolvedValue([]);

        await measurementService.upsertWaterIntake(
          mockUserId,
          mockUserId,
          entryDate,
          -1,
          null
        );

        expect(
          measurementRepository.deleteWaterIntakeLog
        ).not.toHaveBeenCalled();
        expect(
          measurementRepository.recomputeWaterAggregateForUser
        ).toHaveBeenCalledWith(mockUserId, mockUserId, entryDate, 'manual');
      });
    });

    it('divides container volume by servings_per_container per drink', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      waterContainerRepository.getWaterContainerById.mockResolvedValue({
        id: 3,
        name: 'Jug',
        volume: '2000.000',
        servings_per_container: 8,
      });
      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        3
      );
      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        250,
        3,
        'Jug',
        'manual',
        null,
        null,
        1.0
      );
      expect(
        measurementRepository.recomputeWaterAggregateForUser
      ).toHaveBeenCalledWith(mockUserId, mockUserId, entryDate, 'manual');
    });

    it('falls back to the full container volume when servings_per_container is 0', async () => {
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      waterContainerRepository.getWaterContainerById.mockResolvedValue({
        id: 3,
        name: 'Broken Row',
        volume: '750.000',
        servings_per_container: 0,
      });
      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        3
      );
      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        750,
        3,
        'Broken Row',
        'manual',
        null,
        null,
        1.0
      );
      expect(
        measurementRepository.recomputeWaterAggregateForUser
      ).toHaveBeenCalledWith(mockUserId, mockUserId, entryDate, 'manual');
    });
  });
  describe('updateWaterIntake', () => {
    it('should pass userId to repository functions', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockUpdateData = { water_ml: 300 };
      const mockUpdatedEntry = {
        id: mockEntryId,
        water_ml: 300,
        user_id: mockUserId,
      };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.updateWaterIntake.mockResolvedValue(
        mockUpdatedEntry
      );
      const result = await measurementService.updateWaterIntake(
        mockUserId,
        mockUserId,
        mockEntryId,
        mockUpdateData
      );
      expect(
        measurementRepository.getWaterIntakeEntryOwnerId
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
      expect(measurementRepository.updateWaterIntake).toHaveBeenCalledWith(
        mockEntryId,
        mockUserId,
        mockUserId,
        mockUpdateData
      );
      expect(result).toEqual(mockUpdatedEntry);
    });
    it('should throw 404 when entry is not found', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'non-existent-entry';
      const mockUpdateData = { water_ml: 300 };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(null);
      await expect(
        measurementService.updateWaterIntake(
          mockUserId,
          mockUserId,
          mockEntryId,
          mockUpdateData
        )
      ).rejects.toThrow('Water intake entry not found.');
    });
    it('should throw 403 when user does not own the entry', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockUpdateData = { water_ml: 300 };
      const differentOwnerId = 'different-owner-id';
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        differentOwnerId
      );
      await expect(
        measurementService.updateWaterIntake(
          mockUserId,
          mockUserId,
          mockEntryId,
          mockUpdateData
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permission to update this water intake entry.'
      );
      expect(measurementRepository.updateWaterIntake).not.toHaveBeenCalled();
    });
    it('should throw 404 when repository update returns null', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockUpdateData = { water_ml: 300 };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.updateWaterIntake.mockResolvedValue(null);
      await expect(
        measurementService.updateWaterIntake(
          mockUserId,
          mockUserId,
          mockEntryId,
          mockUpdateData
        )
      ).rejects.toThrow(
        'Water intake entry not found or not authorized to update.'
      );
    });
  });
  describe('deleteWaterIntake', () => {
    it('should pass userId to repository functions', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockSuccessResult = {
        message: 'Water intake entry deleted successfully.',
      };
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.deleteWaterIntake.mockResolvedValue(true); // Repository returns true for success
      const result = await measurementService.deleteWaterIntake(
        mockUserId,
        mockUserId,
        mockEntryId
      );
      expect(
        measurementRepository.getWaterIntakeEntryOwnerId
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
      expect(measurementRepository.deleteWaterIntake).toHaveBeenCalledWith(
        mockEntryId,
        mockUserId
      );
      expect(result).toEqual(mockSuccessResult);
    });
    it('should throw 404 when entry is not found', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'non-existent-entry';
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(null);
      await expect(
        measurementService.deleteWaterIntake(
          mockUserId,
          mockUserId,
          mockEntryId
        )
      ).rejects.toThrow('Water intake entry not found.');
    });
    it('should throw 403 when user does not own the entry', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const differentOwnerId = 'different-owner-id';
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        differentOwnerId
      );
      await expect(
        measurementService.deleteWaterIntake(
          mockUserId,
          mockUserId,
          mockEntryId
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permission to delete this water intake entry.'
      );
      expect(measurementRepository.deleteWaterIntake).not.toHaveBeenCalled();
    });
  });
  describe('getWaterIntakeByDateRange', () => {
    const mockUserId = 'test-user-id';
    const targetUserId = 'target-user-id';
    const startDate = '2026-08-01';
    const endDate = '2026-08-30';

    it('maps repository rows to the wire shape with a numeric total', async () => {
      vi.mocked(
        measurementRepository.getWaterTotalsByDateRange
      ).mockResolvedValue([{ entry_date: '2026-08-30', total_ml: '750' }]);

      const result = await measurementService.getWaterIntakeByDateRange(
        mockUserId,
        targetUserId,
        startDate,
        endDate
      );

      expect(result).toEqual([{ entry_date: '2026-08-30', water_ml: 750 }]);
    });

    it('passes the target user and window straight through to the repository', async () => {
      vi.mocked(
        measurementRepository.getWaterTotalsByDateRange
      ).mockResolvedValue([]);

      await measurementService.getWaterIntakeByDateRange(
        mockUserId,
        targetUserId,
        startDate,
        endDate
      );

      expect(
        measurementRepository.getWaterTotalsByDateRange
      ).toHaveBeenCalledWith(targetUserId, startDate, endDate);
    });

    it('coerces an unparseable total to 0', async () => {
      vi.mocked(
        measurementRepository.getWaterTotalsByDateRange
      ).mockResolvedValue([{ entry_date: '2026-08-30', total_ml: null }]);

      const result = await measurementService.getWaterIntakeByDateRange(
        mockUserId,
        targetUserId,
        startDate,
        endDate
      );

      expect(result).toEqual([{ entry_date: '2026-08-30', water_ml: 0 }]);
    });

    it('rethrows a repository failure', async () => {
      const repositoryError = new Error('Database error');
      vi.mocked(
        measurementRepository.getWaterTotalsByDateRange
      ).mockRejectedValue(repositoryError);

      await expect(
        measurementService.getWaterIntakeByDateRange(
          mockUserId,
          targetUserId,
          startDate,
          endDate
        )
      ).rejects.toThrow(repositoryError);
    });
  });
  // ---------------------------------------------------------------------------
  // Integration Tests
  // ---------------------------------------------------------------------------
  describe('Integration Tests', () => {
    it('should handle the full update flow correctly', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockUpdateData = { water_ml: 300 };
      const mockUpdatedEntry = {
        id: mockEntryId,
        water_ml: 300,
        user_id: mockUserId,
      };
      // Mock the repository to simulate the full flow
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.updateWaterIntake.mockResolvedValue(
        mockUpdatedEntry
      );
      const result = await measurementService.updateWaterIntake(
        mockUserId,
        mockUserId,
        mockEntryId,
        mockUpdateData
      );
      // Verify the complete flow
      expect(
        measurementRepository.getWaterIntakeEntryOwnerId
      ).toHaveBeenCalledTimes(1);
      expect(measurementRepository.updateWaterIntake).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockUpdatedEntry);
      expect(result.water_ml).toBe(300);
    });
    it('should handle permission check before repository call', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      const mockUpdateData = { water_ml: 300 };
      const differentOwnerId = 'different-owner-id';
      // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        differentOwnerId
      );
      await expect(
        measurementService.updateWaterIntake(
          mockUserId,
          mockUserId,
          mockEntryId,
          mockUpdateData
        )
      ).rejects.toThrow('Forbidden');
      // Verify that the update was never called due to permission check
      expect(measurementRepository.updateWaterIntake).not.toHaveBeenCalled();
    });
  });
});
