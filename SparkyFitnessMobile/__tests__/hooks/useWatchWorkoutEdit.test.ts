import { applyWatchWorkoutEdit } from '../../src/hooks/useWatchWorkoutEdit';
import { fetchExerciseById } from '../../src/services/api/exerciseApi';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: { isSupported: jest.fn(() => true), addListener: jest.fn() },
}));
jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseById: jest.fn(),
}));

const actions = {
  addSetToExercise: jest.fn(),
  deleteSet: jest.fn(),
  updateSetField: jest.fn(),
  removeExercise: jest.fn(),
  addExercise: jest.fn(),
};

let nextId = 0;
const edit = (
  fields: Partial<Parameters<typeof applyWatchWorkoutEdit>[0]> & {
    action: Parameters<typeof applyWatchWorkoutEdit>[0]['action'];
  }
) =>
  applyWatchWorkoutEdit({
    sessionId: 'sess-1',
    clientId: `c${nextId++}`,
    ...fields,
  });

describe('applyWatchWorkoutEdit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useActiveWorkoutStore.setState({ sessionId: 'sess-1', ...actions });
  });

  it('adds a set to the named exercise', async () => {
    await edit({ action: 'addSet', exerciseEntryId: 'entry-1' });
    expect(actions.addSetToExercise).toHaveBeenCalledWith('entry-1');
  });

  it('deletes a set and an exercise', async () => {
    await edit({ action: 'deleteSet', setId: '12' });
    await edit({ action: 'deleteExercise', exerciseEntryId: 'entry-2' });
    expect(actions.deleteSet).toHaveBeenCalledWith('12');
    expect(actions.removeExercise).toHaveBeenCalledWith('entry-2');
  });

  it('changes a set type', async () => {
    await edit({ action: 'setSetType', setId: '12', setType: 'warmup' });
    expect(actions.updateSetField).toHaveBeenCalledWith('12', {
      set_type: 'warmup',
    });
  });

  it('loads and adds an exercise', async () => {
    const exercise = { id: 'ex-1', name: 'Bench Press' };
    (fetchExerciseById as jest.Mock).mockResolvedValue(exercise);
    await edit({ action: 'addExercise', exerciseId: 'ex-1' });
    expect(fetchExerciseById).toHaveBeenCalledWith('ex-1');
    expect(actions.addExercise).toHaveBeenCalledWith(exercise);
  });

  it('ignores an edit for a workout that is not live', async () => {
    await applyWatchWorkoutEdit({
      sessionId: 'other',
      clientId: 'x1',
      action: 'addSet',
      exerciseEntryId: 'entry-1',
    });
    expect(actions.addSetToExercise).not.toHaveBeenCalled();
  });

  it('applies a copy delivered twice only once', async () => {
    const payload = {
      sessionId: 'sess-1',
      clientId: 'dup-1',
      action: 'addSet' as const,
      exerciseEntryId: 'entry-1',
    };
    await applyWatchWorkoutEdit(payload);
    await applyWatchWorkoutEdit(payload);
    expect(actions.addSetToExercise).toHaveBeenCalledTimes(1);
  });

  it('does not add an exercise if the workout ended while it loaded', async () => {
    (fetchExerciseById as jest.Mock).mockImplementation(async () => {
      useActiveWorkoutStore.setState({ sessionId: null });
      return { id: 'ex-1', name: 'Bench Press' };
    });
    await edit({ action: 'addExercise', exerciseId: 'ex-1' });
    expect(actions.addExercise).not.toHaveBeenCalled();
  });

  it('lets a later delivery add the exercise after a failed lookup', async () => {
    (fetchExerciseById as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ id: 'ex-1', name: 'Bench Press' });
    const payload = {
      sessionId: 'sess-1',
      clientId: 'retry-1',
      action: 'addExercise' as const,
      exerciseId: 'ex-1',
    };
    await applyWatchWorkoutEdit(payload);
    expect(actions.addExercise).not.toHaveBeenCalled();
    await applyWatchWorkoutEdit(payload);
    expect(actions.addExercise).toHaveBeenCalledTimes(1);
  });

  it('ignores a second delivery while the exercise is still loading', async () => {
    let resolve: (value: unknown) => void = () => {};
    (fetchExerciseById as jest.Mock).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const payload = {
      sessionId: 'sess-1',
      clientId: 'slow-1',
      action: 'addExercise' as const,
      exerciseId: 'ex-1',
    };
    const first = applyWatchWorkoutEdit(payload);
    await applyWatchWorkoutEdit(payload);
    resolve({ id: 'ex-1', name: 'Bench Press' });
    await first;
    expect(fetchExerciseById).toHaveBeenCalledTimes(1);
    expect(actions.addExercise).toHaveBeenCalledTimes(1);
  });
});
