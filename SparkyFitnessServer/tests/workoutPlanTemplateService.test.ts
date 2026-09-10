import { beforeEach, describe, expect, it, vi } from 'vitest';
import workoutPlanTemplateService from '../services/workoutPlanTemplateService.js';
import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';

vi.mock('../models/workoutPlanTemplateRepository.js', () => ({
  default: {
    createWorkoutPlanTemplate: vi.fn(),
    getWorkoutPlanTemplatesByUserId: vi.fn(),
    getWorkoutPlanTemplateById: vi.fn(),
    updateWorkoutPlanTemplate: vi.fn(),
    deleteWorkoutPlanTemplate: vi.fn(),
    getWorkoutPlanTemplateOwnerId: vi.fn(),
    getActiveWorkoutPlanForDate: vi.fn(),
  },
}));

vi.mock('../models/workoutPresetRepository.js', () => ({
  default: {
    getWorkoutPresetById: vi.fn(),
  },
}));

vi.mock('../models/exerciseRepository.js', () => ({
  default: {
    getExerciseById: vi.fn(),
    createExerciseEntriesFromTemplate: vi.fn(),
    deleteExerciseEntriesByTemplateId: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  resolveTemplateStartDay: vi.fn(async () => '2026-09-10'),
}));

const USER_ID = 'user-uuid-1234';
const OTHER_USER_ID = 'other-user-uuid-5678';
const TEMPLATE_ID = 'template-uuid-9999';

describe('workoutPlanTemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorkoutPlanTemplateById', () => {
    it('returns the template when found for the user', async () => {
      const mockTemplate = {
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Hypertrophy Block A',
        is_active: true,
        assignments: [],
      };
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue(mockTemplate);

      const result =
        await workoutPlanTemplateService.getWorkoutPlanTemplateById(
          USER_ID,
          TEMPLATE_ID
        );

      expect(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID);
      expect(result).toEqual(mockTemplate);
    });

    it('throws "Workout plan template not found." when repository returns null', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue(null);

      await expect(
        workoutPlanTemplateService.getWorkoutPlanTemplateById(
          USER_ID,
          TEMPLATE_ID
        )
      ).rejects.toThrow('Workout plan template not found.');
    });
  });

  describe('getWorkoutPlanTemplatesByUserId', () => {
    it('delegates to repository getWorkoutPlanTemplatesByUserId', async () => {
      const mockTemplates = [
        { id: 't1', plan_name: 'Plan 1' },
        { id: 't2', plan_name: 'Plan 2' },
      ];
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId
      ).mockResolvedValue(mockTemplates);

      const result =
        await workoutPlanTemplateService.getWorkoutPlanTemplatesByUserId(
          USER_ID
        );

      expect(
        workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId
      ).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('updateWorkoutPlanTemplate', () => {
    it('throws Forbidden when user does not own the template', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(OTHER_USER_ID);

      await expect(
        workoutPlanTemplateService.updateWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID,
          { plan_name: 'Updated Name' }
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permission to update this workout plan template.'
      );
    });

    it('updates template when user is owner', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(
        workoutPlanTemplateRepository.updateWorkoutPlanTemplate
      ).mockResolvedValue({
        id: TEMPLATE_ID,
        plan_name: 'Updated Name',
        is_active: false,
      });

      const result = await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        { plan_name: 'Updated Name' }
      );

      expect(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID);
      expect(
        workoutPlanTemplateRepository.updateWorkoutPlanTemplate
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID, {
        plan_name: 'Updated Name',
      });
      expect(result.plan_name).toBe('Updated Name');
    });
  });

  describe('deleteWorkoutPlanTemplate', () => {
    it('throws not found when owner ID is not found', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(null);

      await expect(
        workoutPlanTemplateService.deleteWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID
        )
      ).rejects.toThrow('Workout plan template not found.');
    });

    it('throws Forbidden when user does not own the template', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(OTHER_USER_ID);

      await expect(
        workoutPlanTemplateService.deleteWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID
        )
      ).rejects.toThrow(
        'Forbidden: You do not have permission to delete this workout plan template.'
      );
    });

    it('deletes template and cleans up entries when user is owner', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(
        workoutPlanTemplateRepository.deleteWorkoutPlanTemplate
      ).mockResolvedValue({ id: TEMPLATE_ID });

      const result = await workoutPlanTemplateService.deleteWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID
      );

      expect(
        exerciseRepository.deleteExerciseEntriesByTemplateId
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID, '2026-09-10');
      expect(
        workoutPlanTemplateRepository.deleteWorkoutPlanTemplate
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID);
      expect(result).toEqual({
        message: 'Workout plan template deleted successfully.',
      });
    });
  });
});
