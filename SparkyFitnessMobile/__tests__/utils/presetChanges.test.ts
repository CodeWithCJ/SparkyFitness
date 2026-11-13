import type { PresetSessionResponse } from '@workspace/shared';
import { describePresetChanges } from '../../src/utils/focusView';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

const t = ((key: string, opts: Record<string, unknown>) =>
  String(opts.defaultValue).replace(/{{(\w+)}}/g, (_m, k) =>
    String(opts[k])
  )) as never;

const exercise = (id: string, name: string, sets: number) =>
  ({
    id: `entry-${id}`,
    exercise_id: id,
    exercise_snapshot: { name },
    sets: Array.from({ length: sets }, (_, i) => ({ id: i })),
  }) as never;

const presetExercise = (id: string, name: string, sets: number) =>
  ({
    exercise_id: id,
    exercise_name: name,
    sets: Array.from({ length: sets }, (_, i) => ({ id: i })),
  }) as never;

describe('describePresetChanges', () => {
  it('lists added and removed exercises and changed set counts', () => {
    const session = {
      exercises: [
        exercise('bench', 'Bench Press', 4),
        exercise('plank', 'Plank', 3),
      ],
    } as unknown as PresetSessionResponse;
    const preset = {
      exercises: [
        presetExercise('bench', 'Bench Press', 3),
        presetExercise('dips', 'Dips', 3),
      ],
    } as unknown as WorkoutPreset;
    expect(describePresetChanges(session, preset, t)).toEqual([
      'Bench Press 4 sets, was 3.',
      'Plank added.',
      'Dips removed.',
    ]);
  });

  it('is empty when the structure matches', () => {
    const session = {
      exercises: [exercise('bench', 'Bench Press', 3)],
    } as unknown as PresetSessionResponse;
    const preset = {
      exercises: [presetExercise('bench', 'Bench Press', 3)],
    } as unknown as WorkoutPreset;
    expect(describePresetChanges(session, preset, t)).toEqual([]);
  });
});
