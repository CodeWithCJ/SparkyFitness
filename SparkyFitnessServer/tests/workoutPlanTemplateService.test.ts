import { beforeEach, describe, expect, it, vi } from 'vitest';
import workoutPlanTemplateService from '../services/workoutPlanTemplateService.js';
import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import {
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateIdWithClient,
} from '../models/exerciseTemplate.js';
import {
  deleteWorkoutPlanTemplateWithClient,
  updateWorkoutPlanTemplateWithClient,
} from '../models/workoutPlanTemplateRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../models/workoutPlanTemplateRepository.js', () => ({
  updateWorkoutPlanTemplateWithClient: vi.fn(),
  deleteWorkoutPlanTemplateWithClient: vi.fn(),
  default: {
    createWorkoutPlanTemplate: vi.fn(),
    getWorkoutPlanTemplatesByUserId: vi.fn(),
    getWorkoutPlanTemplateById: vi.fn(),
    updateWorkoutPlanTemplate: vi.fn(),
    deleteWorkoutPlanTemplate: vi.fn(),
    getWorkoutPlanTemplateOwnerId: vi.fn(),
    getActiveWorkoutPlanForDate: vi.fn(),
    unlinkExerciseEntriesByTemplateId: vi.fn(),
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

vi.mock('../models/exerciseTemplate.js', () => ({
  createExerciseEntriesFromTemplate: vi.fn(),
  deleteExerciseEntriesByTemplateIdWithClient: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
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
  const mockClient = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient);
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
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue({
        id: TEMPLATE_ID,
        plan_name: 'Updated Name',
        is_active: false,
      });
      vi.mocked(deleteExerciseEntriesByTemplateIdWithClient).mockResolvedValue(
        2
      );

      const result = await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        { plan_name: 'Updated Name' }
      );

      expect(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID);
      expect(getClient).toHaveBeenCalledWith(USER_ID);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      // No stored template means the plan is treated as generating entries.
      expect(deleteExerciseEntriesByTemplateIdWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        '2026-09-10'
      );
      expect(updateWorkoutPlanTemplateWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        { plan_name: 'Updated Name' },
        false
      );
      expect(mockClient.release).toHaveBeenCalled();
      expect(result.plan_name).toBe('Updated Name');
      expect(result.regenerated_entries).toEqual({ removed: 2, created: 0 });
    });

    it('rolls back and wraps the error when the plan update fails', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockRejectedValue(
        new Error('db down')
      );

      await expect(
        workoutPlanTemplateService.updateWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID,
          {
            plan_name: 'Renamed Plan',
          }
        )
      ).rejects.toThrow('Failed to update workout plan template.');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
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

    it('deletes template and cleans up entries in one transaction when user is owner', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(deleteWorkoutPlanTemplateWithClient).mockResolvedValue({
        id: TEMPLATE_ID,
      });

      const result = await workoutPlanTemplateService.deleteWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID
      );

      expect(getClient).toHaveBeenCalledWith(USER_ID);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(deleteExerciseEntriesByTemplateIdWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        '2026-09-10'
      );
      expect(deleteWorkoutPlanTemplateWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Workout plan template deleted successfully.',
      });
    });

    it('rolls back the entry deletion when deleting the plan fails', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(deleteWorkoutPlanTemplateWithClient).mockRejectedValue(
        new Error('db down')
      );

      await expect(
        workoutPlanTemplateService.deleteWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID
        )
      ).rejects.toThrow('Failed to delete workout plan template.');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('createWorkoutPlanTemplate', () => {
    it('creates active weekly plan with entry_mode prefill and materializes entries', async () => {
      const mockCreated = {
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Weekly Plan',
        is_active: true,
        schedule_type: 'weekly' as const,
        entry_mode: 'prefill' as const,
      };
      vi.mocked(
        workoutPlanTemplateRepository.createWorkoutPlanTemplate
      ).mockResolvedValue(mockCreated);

      const result = await workoutPlanTemplateService.createWorkoutPlanTemplate(
        USER_ID,
        {
          plan_name: 'Weekly Plan',
          is_active: true,
          schedule_type: 'weekly',
          entry_mode: 'prefill',
          assignments: [{ day_of_week: 1, sort_order: 0 }],
        }
      );

      expect(result).toEqual(mockCreated);
      expect(
        exerciseRepository.createExerciseEntriesFromTemplate
      ).toHaveBeenCalledWith(TEMPLATE_ID, USER_ID, '2026-09-10');
    });

    it('creates active weekly plan with entry_mode prompt and does NOT materialize entries', async () => {
      const mockCreated = {
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Weekly Plan Prompt Only',
        is_active: true,
        schedule_type: 'weekly' as const,
        entry_mode: 'prompt' as const,
      };
      vi.mocked(
        workoutPlanTemplateRepository.createWorkoutPlanTemplate
      ).mockResolvedValue(mockCreated);

      const result = await workoutPlanTemplateService.createWorkoutPlanTemplate(
        USER_ID,
        {
          plan_name: 'Weekly Plan Prompt Only',
          is_active: true,
          schedule_type: 'weekly',
          entry_mode: 'prompt',
          assignments: [{ day_of_week: 1, sort_order: 0 }],
        }
      );

      expect(result).toEqual(mockCreated);
      expect(
        exerciseRepository.createExerciseEntriesFromTemplate
      ).not.toHaveBeenCalled();
    });

    it('creates active sequential plan and does NOT materialize entries', async () => {
      const mockCreated = {
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Sequential Plan',
        is_active: true,
        schedule_type: 'sequential' as const,
        entry_mode: 'prompt' as const,
      };
      vi.mocked(
        workoutPlanTemplateRepository.createWorkoutPlanTemplate
      ).mockResolvedValue(mockCreated);

      const result = await workoutPlanTemplateService.createWorkoutPlanTemplate(
        USER_ID,
        {
          plan_name: 'Sequential Plan',
          is_active: true,
          schedule_type: 'sequential',
          assignments: [{ day_of_week: null, sort_order: 0 }],
        }
      );

      expect(result).toEqual(mockCreated);
      expect(
        exerciseRepository.createExerciseEntriesFromTemplate
      ).not.toHaveBeenCalled();
    });

    it('defaults omitted schedule_type to sequential and entry_mode to prompt', async () => {
      const mockCreated = {
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Default Plan',
        is_active: false,
        schedule_type: 'sequential' as const,
        entry_mode: 'prompt' as const,
      };
      vi.mocked(
        workoutPlanTemplateRepository.createWorkoutPlanTemplate
      ).mockResolvedValue(mockCreated);

      const result = await workoutPlanTemplateService.createWorkoutPlanTemplate(
        USER_ID,
        {
          plan_name: 'Default Plan',
          assignments: [{ day_of_week: null, sort_order: 0 }],
        }
      );

      expect(result).toEqual(mockCreated);
      expect(
        workoutPlanTemplateRepository.createWorkoutPlanTemplate
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule_type: 'sequential',
          entry_mode: 'prompt',
        })
      );
    });

    it('throws error when weekly plan has invalid day_of_week', async () => {
      await expect(
        workoutPlanTemplateService.createWorkoutPlanTemplate(USER_ID, {
          plan_name: 'Invalid Weekly Plan',
          is_active: true,
          schedule_type: 'weekly',
          assignments: [
            { day_of_week: null as unknown as number, sort_order: 0 },
          ],
        })
      ).rejects.toThrow(
        'Weekly workout plan assignments must have a valid day_of_week (0-6).'
      );
    });
  });

  describe('updateWorkoutPlanTemplate - sequential vs weekly', () => {
    it('throws error when changing schedule_type without providing assignments', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue({
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Existing Weekly',
        is_active: true,
        schedule_type: 'weekly',
        assignments: [],
      });

      await expect(
        workoutPlanTemplateService.updateWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID,
          {
            plan_name: 'Switched to Sequential',
            schedule_type: 'sequential',
          }
        )
      ).rejects.toThrow(
        'Changing schedule_type requires providing updated assignments.'
      );
    });

    it('switching weekly to sequential with assignments deletes old entries and skips materialization', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue({
        id: TEMPLATE_ID,
        user_id: USER_ID,
        plan_name: 'Existing Weekly',
        is_active: true,
        schedule_type: 'weekly',
        assignments: [],
      });
      vi.mocked(deleteExerciseEntriesByTemplateIdWithClient).mockResolvedValue(
        2
      );
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue({
        id: TEMPLATE_ID,
        plan_name: 'Switched to Sequential',
        is_active: true,
        schedule_type: 'sequential',
      });

      const result = await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        {
          plan_name: 'Switched to Sequential',
          is_active: true,
          schedule_type: 'sequential',
          assignments: [{ session_index: 0, sort_order: 0 }],
        }
      );

      expect(deleteExerciseEntriesByTemplateIdWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        '2026-09-10'
      );
      expect(updateWorkoutPlanTemplateWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        {
          plan_name: 'Switched to Sequential',
          is_active: true,
          schedule_type: 'sequential',
          entry_mode: 'prompt',
          assignments: [{ session_index: 0, sort_order: 0, day_of_week: null }],
        },
        true
      );
      expect(createExerciseEntriesFromTemplate).not.toHaveBeenCalled();
      expect(result.schedule_type).toBe('sequential');
      expect(result.regenerated_entries).toEqual({ removed: 2, created: 0 });
    });

    it('throws error when updating weekly plan with invalid day_of_week', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);

      await expect(
        workoutPlanTemplateService.updateWorkoutPlanTemplate(
          USER_ID,
          TEMPLATE_ID,
          {
            schedule_type: 'weekly',
            assignments: [{ day_of_week: 7, sort_order: 0 }],
          }
        )
      ).rejects.toThrow(
        'Weekly workout plan assignments must have a valid day_of_week (0-6).'
      );
    });
  });

  describe('updateWorkoutPlanTemplate - logged workouts (#2677)', () => {
    const storedPlan = (
      entry_mode: 'prompt' | 'prefill',
      schedule_type: 'weekly' | 'sequential' = 'weekly'
    ) => ({
      id: TEMPLATE_ID,
      user_id: USER_ID,
      plan_name: 'Existing Plan',
      is_active: true,
      schedule_type,
      entry_mode,
      assignments: [],
    });

    beforeEach(() => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId
      ).mockResolvedValue(USER_ID);
    });

    it.each([
      ['renaming', { plan_name: 'Renamed Plan', is_active: true }],
      ['deactivating', { plan_name: 'Existing Plan', is_active: false }],
    ])(
      '%s a weekly prompt plan does not delete entries logged from it',
      async (_label, updateData) => {
        vi.mocked(
          workoutPlanTemplateRepository.getWorkoutPlanTemplateById
        ).mockResolvedValue(storedPlan('prompt'));
        vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue({
          ...storedPlan('prompt'),
          ...updateData,
        });

        const result =
          await workoutPlanTemplateService.updateWorkoutPlanTemplate(
            USER_ID,
            TEMPLATE_ID,
            updateData
          );

        expect(
          deleteExerciseEntriesByTemplateIdWithClient
        ).not.toHaveBeenCalled();
        expect(createExerciseEntriesFromTemplate).not.toHaveBeenCalled();
        expect(result.regenerated_entries).toEqual({ removed: 0, created: 0 });
      }
    );

    it('updating a sequential plan does not delete entries logged from it', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue(storedPlan('prompt', 'sequential'));
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue({
        ...storedPlan('prompt', 'sequential'),
        plan_name: 'Renamed Plan',
      });

      await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        { plan_name: 'Renamed Plan' }
      );

      expect(
        deleteExerciseEntriesByTemplateIdWithClient
      ).not.toHaveBeenCalled();
    });

    it('updating a weekly prefill plan regenerates its generated entries', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue(storedPlan('prefill'));
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue({
        ...storedPlan('prefill'),
        plan_name: 'Renamed Plan',
      });
      vi.mocked(deleteExerciseEntriesByTemplateIdWithClient).mockResolvedValue(
        3
      );
      vi.mocked(createExerciseEntriesFromTemplate).mockResolvedValue(4);

      const result = await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        { plan_name: 'Renamed Plan', is_active: true }
      );

      expect(deleteExerciseEntriesByTemplateIdWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        '2026-09-10'
      );
      expect(createExerciseEntriesFromTemplate).toHaveBeenCalledWith(
        TEMPLATE_ID,
        USER_ID,
        '2026-09-10'
      );
      expect(result.regenerated_entries).toEqual({ removed: 3, created: 4 });
    });

    it('reports regeneration_failed when the post-commit regeneration errors', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue(storedPlan('prefill'));
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue(
        storedPlan('prefill')
      );
      vi.mocked(deleteExerciseEntriesByTemplateIdWithClient).mockResolvedValue(
        1
      );
      vi.mocked(createExerciseEntriesFromTemplate).mockRejectedValue(
        new Error('regeneration down')
      );

      const result = await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        { plan_name: 'Existing Plan', is_active: true }
      );

      // The transactional part still committed; only the regeneration failed.
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
      expect(result.regeneration_failed).toBe(true);
      expect(result.regenerated_entries).toEqual({ removed: 1, created: 0 });
    });

    it('switching a prefill plan to prompt still removes the entries it generated', async () => {
      vi.mocked(
        workoutPlanTemplateRepository.getWorkoutPlanTemplateById
      ).mockResolvedValue(storedPlan('prefill'));
      vi.mocked(updateWorkoutPlanTemplateWithClient).mockResolvedValue(
        storedPlan('prompt')
      );

      await workoutPlanTemplateService.updateWorkoutPlanTemplate(
        USER_ID,
        TEMPLATE_ID,
        { plan_name: 'Existing Plan', is_active: true, entry_mode: 'prompt' }
      );

      expect(deleteExerciseEntriesByTemplateIdWithClient).toHaveBeenCalledWith(
        mockClient,
        TEMPLATE_ID,
        USER_ID,
        '2026-09-10'
      );
      expect(createExerciseEntriesFromTemplate).not.toHaveBeenCalled();
    });
  });

  describe('getActiveWorkoutPlanForDate', () => {
    it('delegates to repository getActiveWorkoutPlanForDate', async () => {
      const mockActive = [
        {
          id: TEMPLATE_ID,
          user_id: USER_ID,
          schedule_type: 'sequential' as const,
          next_assignment: { id: 1, sort_order: 0 },
          sequence_position: { current: 1, total: 3 },
        },
      ];
      vi.mocked(
        workoutPlanTemplateRepository.getActiveWorkoutPlanForDate
      ).mockResolvedValue(mockActive);

      const result =
        await workoutPlanTemplateService.getActiveWorkoutPlanForDate(
          USER_ID,
          '2026-09-21'
        );

      expect(
        workoutPlanTemplateRepository.getActiveWorkoutPlanForDate
      ).toHaveBeenCalledWith(USER_ID, '2026-09-21');
      expect(result).toEqual(mockActive);
    });
  });
});
