import { buildPresetEditPayload } from '../../src/screens/WorkoutPresetFormScreen';
import type { PresetDraft } from '../../src/hooks/useWorkoutPresetForm';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

const basePreset: WorkoutPreset = {
  id: 'pre-1',
  user_id: 'user-1',
  name: 'Push Day',
  description: 'Chest and triceps',
  is_public: false,
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
  exercises: [
    {
      id: 'pe-1',
      exercise_id: 'ex-1',
      image_url: null,
      exercise_name: 'Bench Press',
      sets: [
        {
          id: 'ps-1',
          set_number: 1,
          set_type: 'normal',
          reps: 10,
          weight: 100,
          duration: null,
          rest_time: 90,
          notes: null,
        },
      ],
    },
  ],
};

const baseDraft: PresetDraft = {
  name: 'Push Day',
  description: 'Chest and triceps',
  exercises: [
    {
      clientId: 'c1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      exerciseCategory: null,
      images: [],
      sets: [
        {
          clientId: 's1',
          weight: '100',
          reps: '10',
          restTime: 90,
          setType: 'normal',
          duration: null,
          notes: null,
        },
      ],
    },
  ],
};

describe('WorkoutPresetFormScreen — buildPresetEditPayload', () => {
  it('returns empty object when nothing changed', () => {
    expect(
      buildPresetEditPayload({
        state: baseDraft,
        initialPreset: basePreset,
        initialDescription: basePreset.description ?? '',
        exercisesModified: false,
        weightUnit: 'kg',
      }),
    ).toEqual({});
  });

  it('includes only name when name changed', () => {
    const state = { ...baseDraft, name: 'Push Day Reload' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload).toEqual({ name: 'Push Day Reload' });
  });

  it('omits description when unchanged', () => {
    const state = { ...baseDraft, name: 'New Name' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload).not.toHaveProperty('description');
  });

  it('sends description: "" when description is cleared', () => {
    const state = { ...baseDraft, description: '' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload.description).toBe('');
  });

  it('sends new description when description is changed', () => {
    const state = { ...baseDraft, description: 'Updated notes' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload.description).toBe('Updated notes');
  });

  it('preserves description when only the name was edited', () => {
    const state = { ...baseDraft, name: 'New Name' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload).toEqual({ name: 'New Name' });
  });

  it('omits exercises when exercisesModified is false', () => {
    const state = { ...baseDraft, name: 'Renamed' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload).not.toHaveProperty('exercises');
  });

  it('includes exercises when exercisesModified is true', () => {
    const payload = buildPresetEditPayload({
      state: baseDraft,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: true,
      weightUnit: 'kg',
    });
    expect(payload.exercises).toHaveLength(1);
    expect(payload.exercises?.[0].exercise_id).toBe('ex-1');
    expect(payload.exercises?.[0].sets[0].weight).toBe(100);
    expect(payload.exercises?.[0].sets[0].reps).toBe(10);
  });

  it('round-trips set_type, duration, and notes via exercises payload', () => {
    const state: PresetDraft = {
      ...baseDraft,
      exercises: [
        {
          ...baseDraft.exercises[0],
          sets: [
            {
              ...baseDraft.exercises[0].sets[0],
              setType: 'warmup',
              duration: 30,
              notes: 'easy set',
            },
          ],
        },
      ],
    };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: true,
      weightUnit: 'kg',
    });
    expect(payload.exercises?.[0].sets[0].set_type).toBe('warmup');
    expect(payload.exercises?.[0].sets[0].duration).toBe(30);
    expect(payload.exercises?.[0].sets[0].notes).toBe('easy set');
  });

  it('never includes is_public', () => {
    const state = { ...baseDraft, name: 'Renamed', description: 'Different' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: true,
      weightUnit: 'kg',
    });
    expect(payload).not.toHaveProperty('is_public');
  });

  it('treats whitespace-only changes as unchanged for description', () => {
    const state = { ...baseDraft, description: '   Chest and triceps   ' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: basePreset,
      initialDescription: basePreset.description ?? '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload).not.toHaveProperty('description');
  });

  it('handles a preset with null initial description', () => {
    const presetWithoutDesc: WorkoutPreset = { ...basePreset, description: null };
    const state = { ...baseDraft, description: '' };
    const payload = buildPresetEditPayload({
      state,
      initialPreset: presetWithoutDesc,
      initialDescription: '',
      exercisesModified: false,
      weightUnit: 'kg',
    });
    expect(payload).not.toHaveProperty('description');
  });
});
