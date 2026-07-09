import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import WorkoutFormExerciseList, {
  type WorkoutFormExerciseListHandle,
} from '../../src/components/WorkoutFormExerciseList';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import type { WorkoutDraftExercise } from '../../src/types/drafts';

// Drive the reorder overlay through pressable stubs (established pattern).
jest.mock('../../src/components/WorkoutReorderList', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onMoveItem, onDone }: any) =>
      visible ? (
        <View testID="reorder-list">
          <Pressable testID="reorder-move" onPress={() => onMoveItem(0, 1)} />
          <Pressable testID="reorder-done" onPress={onDone} />
        </View>
      ) : null,
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

// Expose the card's derived props and callback surface through simple
// pressables so the list's wiring is drivable without the real card UI.
jest.mock('../../src/components/ActiveWorkoutExerciseCard', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    METRIC_OPTIONS: ['rpe', 'volume', 'e1rm', 'tenrm'],
    METRIC_MENU_LABELS: { rpe: 'RPE', volume: 'Volume', e1rm: 'Est. 1RM', tenrm: 'Est. 10RM' },
    default: (props: any) => {
      const id = props.exercise.id;
      const firstSetId = String(props.exercise.sets[0]?.id);
      return (
        <View testID={`card-${id}`}>
          <Text testID={`card-${id}-info`}>
            {JSON.stringify({
              mode: props.mode,
              expanded: props.expanded,
              activeSetId: props.activeSetId,
              metricColumn: props.metricColumn,
              rpeEditable: props.rpeEditable,
              eligibleForPrefill: props.eligibleForPrefill,
              editWeight0: props.exercise.sets[0]?.editWeightText ?? null,
              weightKg0: props.exercise.sets[0]?.weight ?? null,
              completed: props.completedSetIds,
            })}
          </Text>
          <Pressable
            testID={`card-${id}-toggle`}
            onPress={() => props.onToggleExpanded(id)}
          />
          <Pressable
            testID={`card-${id}-overflow`}
            onPress={() => props.onPressOverflow?.(id, { x: 0, y: 0, width: 0, height: 0 })}
          />
          <Pressable
            testID={`card-${id}-thumb`}
            onPress={() => props.onPressThumb?.(id)}
          />
          <Pressable
            testID={`card-${id}-rest`}
            onPress={() => props.onPressRestChip?.(id, props.exercise.sets[0]?.rest_time ?? null)}
          />
          <Pressable
            testID={`card-${id}-metric-header`}
            onPress={() => props.onPressMetricHeader?.({ x: 0, y: 0, width: 0, height: 0 })}
          />
          <Pressable
            testID={`card-${id}-set-type`}
            onPress={() =>
              props.onPressSetType?.(firstSetId, { x: 0, y: 0, width: 0, height: 0 })
            }
          />
          <Pressable
            testID={`card-${id}-commit-prefill`}
            onPress={() => props.onCommitField?.(firstSetId, { weight: 100, reps: 5 })}
          />
          <Pressable
            testID={`card-${id}-commit-rpe`}
            onPress={() => props.onCommitField?.(firstSetId, { rpe: 8.5 })}
          />
          <Pressable
            testID={`card-${id}-activate`}
            onPress={() => props.onActivateSet?.(firstSetId, 'reps')}
          />
          <Pressable
            testID={`card-${id}-editchange`}
            onPress={() => props.onEditFieldChange?.(firstSetId, 'weight', '105.5')}
          />
          <Pressable testID={`card-${id}-delete-set`} onPress={() => props.onDeleteSet?.(firstSetId)} />
          <Pressable
            testID={`card-${id}-toggle-complete`}
            onPress={() => props.onToggleComplete?.(firstSetId)}
          />
        </View>
      );
    },
  };
});

// The real menu closes (onClose) before running the pressed item — mirror
// that order so the main→pick overflow transition lands like production.
jest.mock('../../src/components/AnchoredMenu', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    measureAnchoredMenuTrigger: (_node: any, cb: any) =>
      cb({ x: 0, y: 0, width: 0, height: 0 }),
    default: ({ visible, items, onClose }: any) =>
      visible ? (
        <View>
          {items.map((item: any) => (
            <Pressable
              key={item.key}
              testID={`menu-item-${item.key}`}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <Text>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null,
  };
});

const mockRestSheet: {
  present: jest.Mock;
  onChange: ((seconds: number) => void) | null;
} = { present: jest.fn(), onChange: null };

jest.mock('../../src/components/RestPeriodSheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(({ onChange }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        present: mockRestSheet.present,
        dismiss: jest.fn(),
      }));
      React.useEffect(() => {
        mockRestSheet.onChange = onChange;
      });
      return null;
    }),
  };
});

function makeExercise(
  clientId: string,
  overrides?: Partial<WorkoutDraftExercise>,
): WorkoutDraftExercise {
  return {
    clientId,
    exerciseId: `x-${clientId}`,
    exerciseName: clientId.toUpperCase(),
    exerciseCategory: 'Strength',
    images: [],
    sets: [{ clientId: `${clientId}-s1`, weight: '100', reps: '5', restTime: 90 }],
    ...overrides,
  };
}

function renderList(
  exercises: WorkoutDraftExercise[],
  props?: Partial<React.ComponentProps<typeof WorkoutFormExerciseList>>,
  ref?: React.Ref<WorkoutFormExerciseListHandle>,
) {
  const callbacks = {
    onActivateSet: jest.fn(),
    onDeactivateSet: jest.fn(),
    updateSetField: jest.fn(),
    updateSetMeta: jest.fn(),
    removeSet: jest.fn(),
    onAddSet: jest.fn(),
    onRemoveExercise: jest.fn(),
    setExerciseRest: jest.fn(),
    supersetWith: jest.fn(),
    ungroupExercise: jest.fn(),
    onReorderExercises: jest.fn(),
    onAddExercisePress: jest.fn(),
  };
  const utils = render(
    <WorkoutFormExerciseList
      ref={ref}
      exercises={exercises}
      weightUnit="kg"
      getImageSource={() => null}
      activeSetKey={null}
      activeSetField="weight"
      {...callbacks}
      {...props}
    />,
  );
  return { ...utils, callbacks };
}

function cardInfo(utils: ReturnType<typeof render>, id: string) {
  return JSON.parse(utils.getByTestId(`card-${id}-info`).props.children as string);
}

describe('WorkoutFormExerciseList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  it('renders edit-mode cards, default expanded, with raw draft strings mapped through', () => {
    const utils = renderList([makeExercise('a')]);
    const info = cardInfo(utils, 'a');
    expect(info.mode).toBe('edit');
    expect(info.expanded).toBe(true);
    expect(info.editWeight0).toBe('100');
    expect(info.weightKg0).toBe(100);
  });

  it('allows collapsing a card', () => {
    const utils = renderList([makeExercise('a')]);
    fireEvent.press(utils.getByTestId('card-a-toggle'));
    expect(cardInfo(utils, 'a').expanded).toBe(false);
  });

  it('splits activeSetKey per card and forwards activation with composed keys', () => {
    const utils = renderList([makeExercise('a'), makeExercise('b')], {
      activeSetKey: 'a:a-s1',
      activeSetField: 'reps',
    });
    expect(cardInfo(utils, 'a').activeSetId).toBe('a-s1');
    expect(cardInfo(utils, 'b').activeSetId).toBeNull();

    fireEvent.press(utils.getByTestId('card-b-activate'));
    expect(utils.callbacks.onActivateSet).toHaveBeenCalledWith('b:b-s1', 'reps');
  });

  it('routes per-keystroke edits to updateSetField with the owning exercise', () => {
    const utils = renderList([makeExercise('a')]);
    fireEvent.press(utils.getByTestId('card-a-editchange'));
    expect(utils.callbacks.updateSetField).toHaveBeenCalledWith('a', 'a-s1', 'weight', '105.5');
  });

  it('derives completedSetIds from draft completedAt', () => {
    const completedAt = '2026-07-06T10:00:00.000Z';
    const utils = renderList([
      makeExercise('a', {
        sets: [{ clientId: 'a-s1', weight: '100', reps: '5', completedAt }],
      }),
    ]);
    expect(cardInfo(utils, 'a').completed).toEqual({ 'a-s1': Date.parse(completedAt) });
  });

  describe('superset rails', () => {
    it('draws rails for adjacent draft groups only', () => {
      const utils = renderList([
        makeExercise('a', { supersetGroup: 1 }),
        makeExercise('b', { supersetGroup: 1 }),
        makeExercise('c'),
      ]);
      expect(utils.getByTestId('superset-rail-a')).toBeTruthy();
      expect(utils.getByTestId('superset-rail-b')).toBeTruthy();
      expect(utils.queryByTestId('superset-rail-c')).toBeNull();
    });

    it('ignores singleton groups', () => {
      const utils = renderList([makeExercise('a', { supersetGroup: 4 }), makeExercise('b')]);
      expect(utils.queryByTestId('superset-rail-a')).toBeNull();
    });
  });

  describe('overflow menu', () => {
    it('offers Superset with…, Remove from superset, and Remove exercise as applicable', () => {
      const utils = renderList([
        makeExercise('a', { supersetGroup: 1 }),
        makeExercise('b', { supersetGroup: 1 }),
        makeExercise('c'),
      ]);
      fireEvent.press(utils.getByTestId('card-a-overflow'));
      expect(utils.getByText('Superset with…')).toBeTruthy();
      expect(utils.getByText('Remove from superset')).toBeTruthy();
      expect(utils.getByText('Remove exercise')).toBeTruthy();
    });

    it('hides Superset with… when there are no ungrouped candidates', () => {
      const utils = renderList([
        makeExercise('a', { supersetGroup: 1 }),
        makeExercise('b', { supersetGroup: 1 }),
      ]);
      fireEvent.press(utils.getByTestId('card-a-overflow'));
      expect(utils.queryByText('Superset with…')).toBeNull();
      expect(utils.getByText('Remove from superset')).toBeTruthy();
    });

    it('drives the pick flow: Superset with… lists candidates and dispatches supersetWith', () => {
      const utils = renderList([makeExercise('a'), makeExercise('b'), makeExercise('c')]);
      fireEvent.press(utils.getByTestId('card-a-overflow'));
      fireEvent.press(utils.getByTestId('menu-item-superset-with'));
      // Pick mode lists the other ungrouped exercises by name.
      expect(utils.getByText('B')).toBeTruthy();
      fireEvent.press(utils.getByTestId('menu-item-c'));
      expect(utils.callbacks.supersetWith).toHaveBeenCalledWith('a', 'c');
    });

    it('dispatches ungroupExercise', () => {
      const utils = renderList([
        makeExercise('a', { supersetGroup: 1 }),
        makeExercise('b', { supersetGroup: 1 }),
      ]);
      fireEvent.press(utils.getByTestId('card-b-overflow'));
      fireEvent.press(utils.getByTestId('menu-item-ungroup'));
      expect(utils.callbacks.ungroupExercise).toHaveBeenCalledWith('b');
    });

    it('routes Remove exercise through onRemoveExercise with the draft exercise', () => {
      const exercises = [makeExercise('a'), makeExercise('b')];
      const utils = renderList(exercises);
      fireEvent.press(utils.getByTestId('card-b-overflow'));
      fireEvent.press(utils.getByTestId('menu-item-remove'));
      expect(utils.callbacks.onRemoveExercise).toHaveBeenCalledWith(exercises[1]);
    });

    it('no longer offers Reorder exercises in the card menu (moved to the screen header)', () => {
      const utils = renderList([makeExercise('a'), makeExercise('b')]);
      fireEvent.press(utils.getByTestId('card-a-overflow'));
      expect(utils.queryByText('Reorder exercises')).toBeNull();
    });
  });

  describe('view exercise', () => {
    it('omits the View exercise menu item when onViewExercise is absent', () => {
      const utils = renderList([makeExercise('a')]);
      fireEvent.press(utils.getByTestId('card-a-overflow'));
      expect(utils.queryByText('View exercise')).toBeNull();
      expect(utils.queryByTestId('menu-item-view')).toBeNull();
    });

    it('routes the View exercise menu item through onViewExercise with the draft mapped to an Exercise', () => {
      const onViewExercise = jest.fn();
      const utils = renderList([makeExercise('a'), makeExercise('b')], { onViewExercise });
      fireEvent.press(utils.getByTestId('card-a-overflow'));
      fireEvent.press(utils.getByTestId('menu-item-view'));
      expect(onViewExercise).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'x-a', name: 'A', category: 'Strength' }),
      );
    });

    it('routes a thumbnail tap through onViewExercise', () => {
      const onViewExercise = jest.fn();
      const utils = renderList([makeExercise('a')], { onViewExercise });
      fireEvent.press(utils.getByTestId('card-a-thumb'));
      expect(onViewExercise).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'x-a', name: 'A' }),
      );
    });
  });

  describe('reorder overlay', () => {
    it('opens via the imperative handle (dismissing the active set + keyboard) and commits a move', () => {
      const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
      const ref = React.createRef<WorkoutFormExerciseListHandle>();
      const utils = renderList([makeExercise('a'), makeExercise('b')], undefined, ref);
      expect(utils.queryByTestId('reorder-list')).toBeNull();

      act(() => ref.current?.openReorder());

      expect(utils.callbacks.onDeactivateSet).toHaveBeenCalled();
      expect(dismissSpy).toHaveBeenCalled();
      expect(utils.getByTestId('reorder-list')).toBeTruthy();

      fireEvent.press(utils.getByTestId('reorder-move'));
      expect(utils.callbacks.onReorderExercises).toHaveBeenCalledWith(0, 1);

      fireEvent.press(utils.getByTestId('reorder-done'));
      expect(utils.queryByTestId('reorder-list')).toBeNull();
      dismissSpy.mockRestore();
    });
  });

  it('opens the set-type menu and dispatches updateSetMeta / removeSet', () => {
    const utils = renderList([
      makeExercise('a', {
        sets: [{ clientId: 'a-s1', weight: '100', reps: '5', setType: 'normal' }],
      }),
    ]);
    fireEvent.press(utils.getByTestId('card-a-set-type'));

    // Every set type (current one check-marked) plus a Delete item.
    expect(utils.getByTestId('menu-item-warmup')).toBeTruthy();
    expect(utils.getByText('✓ Normal')).toBeTruthy();
    expect(utils.getByTestId('menu-item-drop')).toBeTruthy();
    expect(utils.getByTestId('menu-item-failure')).toBeTruthy();
    expect(utils.getByTestId('menu-item-delete')).toBeTruthy();

    fireEvent.press(utils.getByTestId('menu-item-warmup'));
    expect(utils.callbacks.updateSetMeta).toHaveBeenCalledWith('a', 'a-s1', {
      setType: 'warmup',
    });

    // The menu closes on select, so re-open it to exercise the delete item
    // (active rows have no swipe-to-delete).
    fireEvent.press(utils.getByTestId('card-a-set-type'));
    fireEvent.press(utils.getByTestId('menu-item-delete'));
    expect(utils.callbacks.removeSet).toHaveBeenCalledWith('a', 'a-s1');
  });

  describe('completion toggle', () => {
    it('stamps completedAt when toggling an incomplete set (showCompletion)', () => {
      const utils = renderList(
        [makeExercise('a', { sets: [{ clientId: 'a-s1', weight: '100', reps: '5' }] })],
        { showCompletion: true },
      );
      fireEvent.press(utils.getByTestId('card-a-toggle-complete'));
      expect(utils.callbacks.updateSetMeta).toHaveBeenCalledWith('a', 'a-s1', {
        completedAt: expect.any(String),
      });
    });

    it('clears completedAt when toggling an already-complete set', () => {
      const utils = renderList(
        [
          makeExercise('a', {
            sets: [
              { clientId: 'a-s1', weight: '100', reps: '5', completedAt: '2026-07-06T10:00:00.000Z' },
            ],
          }),
        ],
        { showCompletion: true },
      );
      fireEvent.press(utils.getByTestId('card-a-toggle-complete'));
      expect(utils.callbacks.updateSetMeta).toHaveBeenCalledWith('a', 'a-s1', {
        completedAt: null,
      });
    });

    it('does not wire the toggle without showCompletion (preset form)', () => {
      const utils = renderList([
        makeExercise('a', { sets: [{ clientId: 'a-s1', weight: '100', reps: '5' }] }),
      ]);
      fireEvent.press(utils.getByTestId('card-a-toggle-complete'));
      expect(utils.callbacks.updateSetMeta).not.toHaveBeenCalled();
    });
  });

  it('targets the rest sheet at the pressed exercise', () => {
    const utils = renderList([makeExercise('a'), makeExercise('b')]);
    fireEvent.press(utils.getByTestId('card-b-rest'));
    expect(mockRestSheet.present).toHaveBeenCalledWith(90);

    mockRestSheet.onChange?.(120);
    expect(utils.callbacks.setExerciseRest).toHaveBeenCalledWith('b', 120);
  });

  describe('commit-field conversion', () => {
    it('converts kg commits to display strings for the reducer (lbs)', () => {
      const utils = renderList([makeExercise('a')], { weightUnit: 'lbs' });
      fireEvent.press(utils.getByTestId('card-a-commit-prefill'));
      expect(utils.callbacks.updateSetField).toHaveBeenCalledWith('a', 'a-s1', 'weight', '220.5');
      expect(utils.callbacks.updateSetField).toHaveBeenCalledWith('a', 'a-s1', 'reps', '5');
    });

    it('routes rpe commits to updateSetMeta', () => {
      const utils = renderList([makeExercise('a')]);
      fireEvent.press(utils.getByTestId('card-a-commit-rpe'));
      expect(utils.callbacks.updateSetMeta).toHaveBeenCalledWith('a', 'a-s1', { rpe: 8.5 });
      expect(utils.callbacks.updateSetField).not.toHaveBeenCalled();
    });
  });

  it('routes set deletion to removeSet with the owning exercise', () => {
    const utils = renderList([makeExercise('a')]);
    fireEvent.press(utils.getByTestId('card-a-delete-set'));
    expect(utils.callbacks.removeSet).toHaveBeenCalledWith('a', 'a-s1');
  });

  describe('removeExerciseOnLastSetDelete (workout forms)', () => {
    it('routes deleting the only set through onRemoveExercise instead of removeSet', () => {
      const exercises = [makeExercise('a')];
      const utils = renderList(exercises, { removeExerciseOnLastSetDelete: true });
      fireEvent.press(utils.getByTestId('card-a-delete-set'));
      expect(utils.callbacks.onRemoveExercise).toHaveBeenCalledWith(exercises[0]);
      expect(utils.callbacks.removeSet).not.toHaveBeenCalled();
    });

    it('still removes a set normally when the exercise has more sets', () => {
      const utils = renderList(
        [
          makeExercise('a', {
            sets: [
              { clientId: 'a-s1', weight: '100', reps: '5', restTime: 90 },
              { clientId: 'a-s2', weight: '100', reps: '5', restTime: 90 },
            ],
          }),
        ],
        { removeExerciseOnLastSetDelete: true },
      );
      fireEvent.press(utils.getByTestId('card-a-delete-set'));
      expect(utils.callbacks.removeSet).toHaveBeenCalledWith('a', 'a-s1');
      expect(utils.callbacks.onRemoveExercise).not.toHaveBeenCalled();
    });

    it('applies the guard to the set-type menu Delete item too', () => {
      const exercises = [makeExercise('a')];
      const utils = renderList(exercises, { removeExerciseOnLastSetDelete: true });
      fireEvent.press(utils.getByTestId('card-a-set-type'));
      fireEvent.press(utils.getByTestId('menu-item-delete'));
      expect(utils.callbacks.onRemoveExercise).toHaveBeenCalledWith(exercises[0]);
      expect(utils.callbacks.removeSet).not.toHaveBeenCalled();
    });
  });

  it('renders the Add Exercise footer', () => {
    const utils = renderList([makeExercise('a')]);
    fireEvent.press(utils.getByText('Add Exercise'));
    expect(utils.callbacks.onAddExercisePress).toHaveBeenCalledTimes(1);
  });

  describe('preset RPE handling (rpeEditable=false)', () => {
    it('omits RPE from the metric column picker', () => {
      const utils = renderList([makeExercise('a')], { rpeEditable: false });
      fireEvent.press(utils.getByTestId('card-a-metric-header'));
      expect(utils.queryByTestId('menu-item-rpe')).toBeNull();
      expect(utils.getByTestId('menu-item-volume')).toBeTruthy();
    });

    it('coerces a global RPE column to volume for display', () => {
      // Default preference column is 'rpe'; presets fall back to volume.
      const utils = renderList([makeExercise('a')], { rpeEditable: false });
      expect(cardInfo(utils, 'a').metricColumn).toBe('volume');
    });

    it('keeps RPE for the workout form (rpeEditable=true)', () => {
      const utils = renderList([makeExercise('a')]);
      fireEvent.press(utils.getByTestId('card-a-metric-header'));
      expect(utils.getByTestId('menu-item-rpe')).toBeTruthy();
      expect(cardInfo(utils, 'a').metricColumn).toBe('rpe');
    });
  });
});
