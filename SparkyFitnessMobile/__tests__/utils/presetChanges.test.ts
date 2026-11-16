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

describe('describePresetChanges (structure beyond counts)', () => {
  it('lists a changed order, superset or set type, and ignores a placeholder set', () => {
    const base = (id: string, group: number | null, type = 'working') => ({
      ...(exercise(id, id, 1) as object),
      superset_group: group,
      sets: [{ id: 1, set_type: type }],
    });
    const pre = (id: string, group: number | null) => ({
      ...(presetExercise(id, id, 1) as object),
      superset_group: group,
      sets: [{ id: 1, set_type: 'working' }],
    });
    const session = {
      exercises: [base('b', 1), base('a', null, 'warmup')],
    } as unknown as PresetSessionResponse;
    const preset = {
      exercises: [pre('a', null), pre('b', null)],
    } as unknown as WorkoutPreset;
    expect(describePresetChanges(session, preset, t)).toEqual([
      'b superset changed.',
      'a set types changed.',
    ]);
    const reordered = {
      exercises: [base('b', null), base('a', null)],
    } as unknown as PresetSessionResponse;
    expect(describePresetChanges(reordered, preset, t)).toEqual([
      'Exercise order changed.',
    ]);
    const placeholder = {
      exercises: [exercise('a', 'a', 1)],
    } as unknown as PresetSessionResponse;
    const empty = {
      exercises: [presetExercise('a', 'a', 0)],
    } as unknown as WorkoutPreset;
    expect(describePresetChanges(placeholder, empty, t)).toEqual([]);
    // A placeholder whose type was changed is the lifter's own set.
    const warmup = {
      exercises: [
        {
          ...(exercise('a', 'a', 1) as object),
          sets: [{ id: 1, set_type: 'warmup' }],
        },
      ],
    } as unknown as PresetSessionResponse;
    expect(describePresetChanges(warmup, empty, t)).toEqual([
      'a 1 sets, was 0.',
    ]);
  });
});
