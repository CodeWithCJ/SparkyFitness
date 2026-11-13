import { beforeEach, expect, it, vi } from 'vitest';
import medicationRepository from '../models/medicationRepository.js';
import { getWorkoutPresetById } from '../models/workoutPresetRepository.js';
import foodRepository from '../models/foodRepository.js';
import { getExerciseEntryById } from '../models/exerciseEntry.js';
import { getEntryById } from '../models/medicationEntryRepository.js';
import { getMealPlanTemplatesByUserId } from '../models/mealPlanTemplateRepository.js';
import { getChatApprovalSummary } from '../ai/chatApprovalSummary.js';
import { listPreferences } from '../models/foodAssistantRepository.js';
import { actorUserIdFor } from '../db/poolManager.js';
vi.mock('../models/foodAssistantRepository.js', () => ({
  listPreferences: vi.fn(),
}));
vi.mock('../models/foodRepository.js', () => ({
  default: {
    getFoodEntryById: vi.fn(),
    getFoodById: vi.fn(),
    getFoodsWithPagination: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  getExerciseEntryById: vi.fn(),
}));
vi.mock('../models/medicationEntryRepository.js', () => ({
  getEntryById: vi.fn(),
}));
vi.mock('../models/mealPlanTemplateRepository.js', () => ({
  getMealPlanTemplatesByUserId: vi.fn(),
}));
vi.mock('../models/medicationRepository.js', () => ({
  default: { getMedicationById: vi.fn(), listMedications: vi.fn() },
}));
vi.mock('../models/workoutPresetRepository.js', () => ({
  getWorkoutPresetById: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
it('describes a food entry from its saved snapshot, never model text', async () => {
  vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue({
    food_name: 'Eggs',
    quantity: 2,
    unit: 'eggs',
    meal_type: 'breakfast',
    entry_date: '2026-11-13',
  });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_food',
      { action: 'delete_entry', entry_id: 'entry', food_name: 'untrusted' },
      'owner'
    )
  ).toEqual({ text: 'Eggs, 2 eggs, breakfast, Nov 13', kind: 'delete' });
  expect(foodRepository.getFoodEntryById).toHaveBeenCalledWith(
    'entry',
    'owner'
  );
});
it('describes medication entries under the same user context', async () => {
  vi.mocked(getEntryById).mockResolvedValue({
    med_name_snapshot: 'Vitamin D',
    dose_amount_snapshot: 1,
    dose_unit_snapshot: 'tablet',
    entry_date: '2026-11-13',
  });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_medications',
      { action: 'delete_entry', entry_id: 'med' },
      'owner'
    )
  ).toEqual({ text: 'Vitamin D, 1 tablet, Nov 13', kind: 'delete' });
  expect(getEntryById).toHaveBeenCalledWith('owner', 'med');
});
it('describes exercise entries from their saved names', async () => {
  vi.mocked(getExerciseEntryById).mockResolvedValue({
    exercise_name: 'Morning run',
    entry_date: '2026-11-13',
  });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_exercise',
      { action: 'delete_exercise_entry', entry_id: 'run' },
      'owner'
    )
  ).toEqual({ text: 'Morning run, Nov 13', kind: 'delete' });
  expect(getExerciseEntryById).toHaveBeenCalledWith('run', 'owner');
});
it('falls back for unknown IDs and failed lookups', async () => {
  vi.mocked(getEntryById).mockResolvedValue(null);
  expect(
    await getChatApprovalSummary(
      'sparky_manage_medications',
      { action: 'delete_entry', entry_id: 'unknown', name: 'untrusted' },
      'owner'
    )
  ).toBeUndefined();
  vi.mocked(getEntryById).mockRejectedValue(new Error('offline'));
  expect(
    await getChatApprovalSummary(
      'sparky_manage_medications',
      { action: 'delete_entry', entry_id: 'unknown' },
      'owner'
    )
  ).toBeUndefined();
});
it('describes clearing notes as a change and bounds plain text', async () => {
  vi.mocked(foodRepository.getFoodById).mockResolvedValue({
    name: 'x'.repeat(150),
  });
  const summary = await getChatApprovalSummary(
    'sparky_manage_food',
    { action: 'set_food_notes', food_id: 'food', notes: '' },
    'owner'
  );
  expect(summary?.kind).toBe('change');
  expect(summary?.text).toHaveLength(80);
  expect(summary?.text).toMatch(/^Clear notes on /);
});
it('normalizes nested destructive calls without confusing nested data for an action', async () => {
  vi.mocked(getEntryById).mockResolvedValue({ med_name_snapshot: 'Vitamin D' });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_medications',
      {
        action: 'update_entry',
        entry_id: 'med',
        notes: null,
        custom_fields: { note: 'untrusted' },
      },
      'owner'
    )
  ).toEqual({ text: 'Clear notes on Vitamin D', kind: 'change' });
  vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue({
    food_name: 'Eggs',
  });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_food',
      { delete_entry: { entry_id: 'entry' } },
      'owner'
    )
  ).toEqual({ text: 'Eggs', kind: 'delete' });
});

it('describes a meal plan by its saved plan name', async () => {
  vi.mocked(getMealPlanTemplatesByUserId).mockResolvedValue([
    { id: 'other', plan_name: 'Bulk' },
    { id: 'plan', plan_name: 'Cutting week' },
  ]);
  expect(
    await getChatApprovalSummary(
      'sparky_manage_meal_plans',
      { action: 'delete_meal_plan', plan_id: 'plan' },
      'owner'
    )
  ).toEqual({ text: 'Cutting week', kind: 'delete' });
});

it.each(['delete', 'delete_with_history'])(
  'describes the library food for delete_food with mixed IDs and mode %s',
  async (mode) => {
    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      name: 'Library eggs',
    });
    expect(
      await getChatApprovalSummary(
        'sparky_manage_food',
        {
          action: 'delete_food',
          food_id: 'food',
          entry_id: 'entry',
          mode,
        },
        'owner'
      )
    ).toEqual({ text: 'Library eggs', kind: 'delete' });
    expect(foodRepository.getFoodById).toHaveBeenCalledWith('food', 'owner');
    expect(foodRepository.getFoodEntryById).not.toHaveBeenCalled();
  }
);
it('describes the diary entry for delete_entry with mixed IDs', async () => {
  vi.mocked(foodRepository.getFoodEntryById).mockResolvedValue({
    food_name: 'Diary eggs',
  });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_food',
      {
        action: 'delete_entry',
        food_id: 'food',
        entry_id: 'entry',
      },
      'owner'
    )
  ).toEqual({ text: 'Diary eggs', kind: 'delete' });
  expect(foodRepository.getFoodEntryById).toHaveBeenCalledWith(
    'entry',
    'owner'
  );
  expect(foodRepository.getFoodById).not.toHaveBeenCalled();
});
it.each([
  ['sparky_manage_food', { food_id: 'food', entry_id: 'entry' }],
  ['sparky_manage_exercise', { entry_id: 'entry', preset_id: 'preset' }],
  [
    'sparky_manage_medications',
    { entry_id: 'entry', medication_id: 'med', schedule_id: 'schedule' },
  ],
  ['sparky_manage_water_containers', { id: 1 }],
])('does not guess an actionless %s target', async (name, args) => {
  expect(await getChatApprovalSummary(name, args, 'owner')).toBeUndefined();
});
it('does not describe a meal diary row as a food diary row', async () => {
  expect(
    await getChatApprovalSummary(
      'sparky_manage_food',
      {
        action: 'delete_entry',
        entry_id: 'meal',
        entry_type: 'food_entry_meal',
      },
      'owner'
    )
  ).toBeUndefined();
  expect(foodRepository.getFoodEntryById).not.toHaveBeenCalled();
});

it.each(['delete_food', 'set_food_notes'])(
  'resolves %s by the executor exact-name lookup',
  async (action) => {
    vi.mocked(foodRepository.getFoodsWithPagination).mockResolvedValue([
      { id: 'other', name: 'Eggs and toast' },
      { id: 'food', name: 'Eggs' },
    ]);
    const summary = await getChatApprovalSummary(
      'sparky_manage_food',
      {
        action,
        food_name: 'eggs',
        entry_id: 'incidental',
        notes: '',
      },
      'owner'
    );
    expect(summary).toEqual(
      action === 'set_food_notes'
        ? { text: 'Clear notes on Eggs', kind: 'change' }
        : { text: 'Eggs', kind: 'delete' }
    );
    expect(foodRepository.getFoodEntryById).not.toHaveBeenCalled();
  }
);
it.each(['delete_medication', 'update_medication'])(
  'targets the medication for %s despite incidental entry and schedule IDs',
  async (action) => {
    vi.mocked(medicationRepository.getMedicationById).mockResolvedValue({
      name: 'Vitamin D',
    });
    expect(
      await getChatApprovalSummary(
        'sparky_manage_medications',
        {
          action,
          medication_id: 'med',
          entry_id: 'entry',
          schedule_id: 'schedule',
          notes: '',
        },
        'owner'
      )
    ).toEqual(
      action === 'update_medication'
        ? { text: 'Clear notes on Vitamin D', kind: 'change' }
        : { text: 'Vitamin D', kind: 'delete' }
    );
    expect(medicationRepository.getMedicationById).toHaveBeenCalledWith(
      'owner',
      'med'
    );
    expect(getEntryById).not.toHaveBeenCalled();
    expect(medicationRepository.listMedications).not.toHaveBeenCalled();
  }
);
it('targets the schedule despite incidental medication and entry IDs', async () => {
  vi.mocked(medicationRepository.listMedications).mockResolvedValue([
    {
      id: 'med',
      name: 'Vitamin D',
      schedules: [{ id: 'schedule', time_of_day: '08:00' }],
    },
  ]);
  expect(
    await getChatApprovalSummary(
      'sparky_manage_medications',
      {
        action: 'delete_schedule',
        medication_id: 'other',
        entry_id: 'entry',
        schedule_id: 'schedule',
      },
      'owner'
    )
  ).toEqual({ text: 'Vitamin D, schedule, 08:00', kind: 'delete' });
  expect(getEntryById).not.toHaveBeenCalled();
  expect(medicationRepository.getMedicationById).not.toHaveBeenCalled();
});
it('targets the preset despite an incidental exercise entry ID', async () => {
  vi.mocked(getWorkoutPresetById).mockResolvedValue({ name: 'Leg day' });
  expect(
    await getChatApprovalSummary(
      'sparky_manage_exercise',
      {
        action: 'delete_workout_preset',
        entry_id: 'entry',
        preset_id: 'preset',
      },
      'owner'
    )
  ).toEqual({ text: 'Leg day', kind: 'delete' });
  expect(getWorkoutPresetById).toHaveBeenCalledWith('preset', 'owner');
  expect(getExerciseEntryById).not.toHaveBeenCalled();
});
it('reads nothing for an own-account-only tool in a family member profile', async () => {
  vi.mocked(listPreferences).mockResolvedValue([]);
  expect(
    await getChatApprovalSummary(
      'sparky_food_assistant_state',
      { action: 'forget_preference', key: 'bread' },
      'family-member',
      'signed-in'
    )
  ).toBeUndefined();
  expect(listPreferences).not.toHaveBeenCalled();
});
it('looks targets up as the signed-in person', async () => {
  let actor: string | undefined;
  vi.mocked(foodRepository.getFoodEntryById).mockImplementation(async () => {
    actor = actorUserIdFor('family-member');
    return { food_name: 'Eggs', entry_date: '2026-11-13' };
  });
  await getChatApprovalSummary(
    'sparky_manage_food',
    { action: 'delete_entry', entry_id: 'entry' },
    'family-member',
    'signed-in'
  );
  expect(actor).toBe('signed-in');
});
