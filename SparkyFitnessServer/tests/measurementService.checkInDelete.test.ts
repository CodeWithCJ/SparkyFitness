import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
// Mock the repository functions
vi.mock('../models/measurementRepository');
describe('Measurement Service - Check-In Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('deleteCheckInMeasurements', () => {
    // Regression: deletion used to call a non-existent repository helper
    // (getCheckInMeasurementOwnerId), so every request threw a 500
    // ("getCheckInMeasurementOwnerId is not a function"). This asserts the
    // happy path resolves and delegates ownership to the scoped repository
    // delete, which would fail if the broken pre-check were reintroduced.
    it('deletes via the user-scoped repository call and returns success', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'entry-123';
      vi.mocked(
        measurementRepository.deleteCheckInMeasurements
      ).mockResolvedValue(true);
      const result = await measurementService.deleteCheckInMeasurements(
        mockUserId,
        mockEntryId
      );
      expect(
        measurementRepository.deleteCheckInMeasurements
      ).toHaveBeenCalledWith(mockEntryId, mockUserId);
      expect(result).toEqual({
        message: 'Check-in measurement deleted successfully.',
      });
    });
    it('throws not-found when the row does not exist or is not owned', async () => {
      const mockUserId = 'test-user-id';
      const mockEntryId = 'non-existent-entry';
      // The scoped delete returns false for a missing or non-owned row.
      vi.mocked(
        measurementRepository.deleteCheckInMeasurements
      ).mockResolvedValue(false);
      await expect(
        measurementService.deleteCheckInMeasurements(mockUserId, mockEntryId)
      ).rejects.toThrow('Check-in measurement not found.');
    });
  });
});
