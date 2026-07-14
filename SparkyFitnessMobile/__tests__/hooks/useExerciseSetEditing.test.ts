import { renderHook, act } from '@testing-library/react-native';
import { useExerciseSetEditing } from '../../src/hooks/useExerciseSetEditing';
import type { Exercise } from '../../src/types/exercise';

const makeExercise = (overrides?: Partial<Exercise>): Exercise => ({
  id: 'ex-1',
  name: 'Bench Press',
  category: 'Strength',
  equipment: ['barbell'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  calories_per_hour: 400,
  source: 'system',
  images: [],
  tags: [],
  ...overrides,
});

function makeActions() {
  return {
    addExercise: jest.fn(() => ({ exerciseClientId: 'added-ex', setClientId: 'added-set' })),
    removeExercise: jest.fn(),
    addSet: jest.fn(() => 'new-set'),
    replaceExercise: jest.fn((clientId: string) => ({
      exerciseClientId: clientId,
      setClientId: 'replacement-set',
    })),
  };
}

describe('useExerciseSetEditing — replace routing', () => {
  it('appends and activates the new set when no replace target is pending', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useExerciseSetEditing(actions));

    act(() => result.current.handleAddExercise(makeExercise()));

    expect(actions.addExercise).toHaveBeenCalledTimes(1);
    expect(actions.replaceExercise).not.toHaveBeenCalled();
    expect(result.current.activeSetKey).toBe('added-ex:added-set');
  });

  it('routes the next selection to replaceExercise while a target is set, then reverts to add', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useExerciseSetEditing(actions));

    act(() => result.current.setReplaceTarget('target-ex'));
    act(() => result.current.handleAddExercise(makeExercise({ id: 'ex-9' })));

    expect(actions.replaceExercise).toHaveBeenCalledWith(
      'target-ex',
      expect.objectContaining({ id: 'ex-9' }),
    );
    expect(actions.addExercise).not.toHaveBeenCalled();
    expect(result.current.activeSetKey).toBe('target-ex:replacement-set');

    // The target is consumed: a second selection appends normally.
    act(() => result.current.handleAddExercise(makeExercise({ id: 'ex-2' })));
    expect(actions.addExercise).toHaveBeenCalledTimes(1);
    expect(actions.replaceExercise).toHaveBeenCalledTimes(1);
  });

  it('a cleared target (plain Add after a cancelled replace) appends instead of replacing', () => {
    const actions = makeActions();
    const { result } = renderHook(() => useExerciseSetEditing(actions));

    act(() => result.current.setReplaceTarget('target-ex'));
    act(() => result.current.setReplaceTarget(null));
    act(() => result.current.handleAddExercise(makeExercise()));

    expect(actions.replaceExercise).not.toHaveBeenCalled();
    expect(actions.addExercise).toHaveBeenCalledTimes(1);
  });

  it('falls through to add when no replaceExercise action is wired', () => {
    const { addExercise, removeExercise, addSet } = makeActions();
    const actions = { addExercise, removeExercise, addSet };
    const { result } = renderHook(() => useExerciseSetEditing(actions));

    act(() => result.current.setReplaceTarget('target-ex'));
    act(() => result.current.handleAddExercise(makeExercise()));

    expect(addExercise).toHaveBeenCalledTimes(1);
  });
});
