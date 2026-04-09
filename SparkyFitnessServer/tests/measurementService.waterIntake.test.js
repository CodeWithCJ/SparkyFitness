import { beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import { UpsertWaterIntakeBodySchema } from '../schemas/measurementSchemas.js';
// Mock the repository functions
vi.mock('../models/measurementRepository');
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
          change_drinks: 250,
          // container_id is omitted
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data.container_id).toBeUndefined();
      });
      it('should accept request with null container_id', () => {
        const validData = {
          entry_date: '2023-01-01',
          change_drinks: 250,
          container_id: null,
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data.container_id).toBeNull();
      });
      it('should accept request with valid container_id', () => {
        const validData = {
          entry_date: '2023-01-01',
          change_drinks: 250,
          container_id: 5,
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data.container_id).toBe(5);
      });
      it('should reject request with missing required fields', () => {
        const invalidData = {
          // missing entry_date and change_drinks
          container_id: 5,
        };
        const result = UpsertWaterIntakeBodySchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.issues).toHaveLength(2);
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
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
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
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(null);
      await expect(
        measurementService.getWaterIntakeEntryById(mockUserId, mockEntryId)
      ).rejects.toThrow('Water intake entry not found.');
      expect(
        measurementRepository.getWaterIntakeEntryOwnerId
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
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
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
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
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
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
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
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
      measurementRepository.getWaterIntakeEntryOwnerId.mockResolvedValue(
        mockUserId
      );
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
