const {
  createGoalPreset,
  updateGoalPreset,
} = require('../services/goalPresetService');
const goalPresetRepository = require('../models/goalPresetRepository');

// Mock the repository
jest.mock('../models/goalPresetRepository');

describe('goalPresetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createGoalPreset', () => {
    it('should create a goal preset successfully', async () => {
      const mockPreset = {
        id: 'test-id',
        preset_name: 'Test Preset',
        user_id: 'testUser',
      };
      goalPresetRepository.createGoalPreset.mockResolvedValue(mockPreset);

      const result = await createGoalPreset('testUser', {
        preset_name: 'Test Preset',
        calories: 2000,
      });

      expect(result).toEqual(mockPreset);
      expect(goalPresetRepository.createGoalPreset).toHaveBeenCalled();
    });

    it('should handle duplicate preset name error', async () => {
      const error = new Error('Duplicate name');
      error.code = '23505';
      goalPresetRepository.createGoalPreset.mockRejectedValue(error);

      await expect(
        createGoalPreset('testUser', {
          preset_name: 'Duplicate Preset',
          calories: 2000,
        })
      ).rejects.toThrow('A goal preset with this name already exists.');
    });

    it('should calculate grams from percentages when all fields are provided', async () => {
      const mockPreset = {
        id: 'test-id',
        preset_name: 'Test Preset',
        user_id: 'testUser',
        calories: 2000,
        protein: 150, // 2000 * 30% / 4
        carbs: 150, // 2000 * 30% / 4
        fat: 66.67, // 2000 * 30% / 9
      };
      goalPresetRepository.createGoalPreset.mockResolvedValue(mockPreset);

      const result = await createGoalPreset('testUser', {
        preset_name: 'Test Preset',
        calories: 2000,
        protein_percentage: 30,
        carbs_percentage: 30,
        fat_percentage: 30,
      });

      expect(result).toEqual(mockPreset);
      expect(goalPresetRepository.createGoalPreset).toHaveBeenCalledWith(
        expect.objectContaining({
          preset_name: 'Test Preset',
          calories: 2000,
          protein: 150,
          carbs: 150,
          fat: expect.closeTo(66.67, 0.01),
        })
      );
    });
  });

  describe('updateGoalPreset', () => {
    it('should update a goal preset successfully', async () => {
      const mockPreset = {
        id: 'test-id',
        preset_name: 'Updated Preset',
        user_id: 'testUser',
      };
      goalPresetRepository.updateGoalPreset.mockResolvedValue(mockPreset);

      const result = await updateGoalPreset('test-id', 'testUser', {
        preset_name: 'Updated Preset',
        calories: 2500,
      });

      expect(result).toEqual(mockPreset);
      expect(goalPresetRepository.updateGoalPreset).toHaveBeenCalledWith(
        'test-id',
        expect.anything()
      );
    });

    it('should handle duplicate preset name error during update', async () => {
      const error = new Error('Duplicate name');
      error.code = '23505';
      goalPresetRepository.updateGoalPreset.mockRejectedValue(error);

      await expect(
        updateGoalPreset('test-id', 'testUser', {
          preset_name: 'Duplicate Preset',
          calories: 2000,
        })
      ).rejects.toThrow('A goal preset with this name already exists.');
    });

    it('should calculate grams from percentages during update when all fields are provided', async () => {
      const mockPreset = {
        id: 'test-id',
        preset_name: 'Updated Preset',
        user_id: 'testUser',
        calories: 2500,
        protein: 187.5, // 2500 * 30% / 4
        carbs: 187.5, // 2500 * 30% / 4
        fat: 83.33, // 2500 * 30% / 9
      };
      goalPresetRepository.updateGoalPreset.mockResolvedValue(mockPreset);

      const result = await updateGoalPreset('test-id', 'testUser', {
        preset_name: 'Updated Preset',
        calories: 2500,
        protein_percentage: 30,
        carbs_percentage: 30,
        fat_percentage: 30,
      });

      expect(result).toEqual(mockPreset);
      expect(goalPresetRepository.updateGoalPreset).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          preset_name: 'Updated Preset',
          calories: 2500,
          protein: 187.5,
          carbs: 187.5,
          fat: expect.closeTo(83.33, 0.01),
        })
      );
    });

    it('should not calculate grams when percentages are missing', async () => {
      const mockPreset = {
        id: 'test-id',
        preset_name: 'Updated Preset',
        user_id: 'testUser',
        calories: 2500,
        protein: 200, // Should keep original value
        carbs: 300, // Should keep original value
        fat: 100, // Should keep original value
      };
      goalPresetRepository.updateGoalPreset.mockResolvedValue(mockPreset);

      const result = await updateGoalPreset('test-id', 'testUser', {
        preset_name: 'Updated Preset',
        calories: 2500,
        protein: 200,
        carbs: 300,
        fat: 100,
        // No percentages provided
      });

      expect(result).toEqual(mockPreset);
      expect(goalPresetRepository.updateGoalPreset).toHaveBeenCalledWith(
        'test-id',
        expect.objectContaining({
          preset_name: 'Updated Preset',
          calories: 2500,
          protein: 200,
          carbs: 300,
          fat: 100,
        })
      );
    });
  });
});
