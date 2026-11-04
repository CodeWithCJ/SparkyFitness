import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';
import ActiveWorkoutFocusSets from '../../src/components/ActiveWorkoutFocusSets';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import type {
  AssumedSetValues,
  WorkoutCardExercise,
  WorkoutCardSet,
} from '../../src/utils/workoutSession';

jest.mock('../../src/hooks/useBodyWeightKg', () => ({
  useBodyWeightKg: () => 80,
}));
jest.mock('../../src/components/AnchoredMenu', () => ({
  ...jest.requireActual('../../src/components/AnchoredMenu'),
  measureAnchoredMenuTrigger: (_node: unknown, cb: (a: object) => void) =>
    cb({ x: 1, y: 2, width: 3, height: 4 }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

function makeSet(overrides?: Partial<WorkoutCardSet>): WorkoutCardSet {
  return {
    id: 101,
    set_number: 1,
    set_type: 'normal',
    weight: 60,
    reps: 10,
    rpe: null,
    rir: null,
    ...overrides,
  };
}

function makeExercise(
  sets: WorkoutCardSet[],
  modality = 'weight_reps',
  equipment?: string[]
): WorkoutCardExercise {
  return {
    id: 'entry-1',
    exercise_id: 'ex-1',
    exercise_snapshot: {
      name: 'Bench Press',
      modality,
      equipment,
    } as never,
    sets,
  } as WorkoutCardExercise;
}

interface RenderOptions {
  sets?: WorkoutCardSet[];
  modality?: string;
  equipment?: string[];
  completedSetIds?: Record<string, number>;
  activeSetId?: string | null;
  weightUnit?: 'kg' | 'lbs';
  metricColumn?: 'rpe' | 'rir' | 'volume';
  assumed?: (AssumedSetValues | null)[];
  withDelete?: boolean;
  focusedSetKey?: string | null;
  focusedField?: 'weight' | 'reps' | 'distance' | 'rpe';
  expandedSetKey?: string | null;
  withDetail?: boolean;
}

function renderSets(options: RenderOptions = {}) {
  const callbacks = {
    onCompleteSet: jest.fn(),
    onUncomplete: jest.fn(),
    onCommitField: jest.fn(),
    onAddSet: jest.fn(),
    onActivateRpe: jest.fn(),
    onActivateSet: jest.fn(),
    onRegisterAccessoryHandle: jest.fn(),
    onDeleteSet: jest.fn(),
    onPressMetricHeader: jest.fn(),
    onPressSetType: jest.fn(),
    onToggleSetDetail: jest.fn(),
  };
  const { onDeleteSet, onToggleSetDetail, ...rest } = callbacks;
  const buildElement = (options: RenderOptions) => (
    <ActiveWorkoutFocusSets
      exercise={makeExercise(
        options.sets ?? [makeSet()],
        options.modality,
        options.equipment
      )}
      completedSetIds={options.completedSetIds ?? {}}
      activeSetId={options.activeSetId ?? null}
      setRenderKeys={{ '101': 'key-101' }}
      metricColumn={options.metricColumn ?? 'rpe'}
      weightUnit={options.weightUnit ?? 'kg'}
      distanceUnit="km"
      assumedSetValues={options.assumed}
      focusedSetKey={options.focusedSetKey ?? null}
      focusedField={options.focusedField ?? 'weight'}
      {...rest}
      onDeleteSet={options.withDelete ? onDeleteSet : undefined}
      onToggleSetDetail={options.withDetail ? onToggleSetDetail : undefined}
      expandedSetKey={options.expandedSetKey ?? null}
    />
  );
  const utils = render(buildElement(options));
  /** Re-render the same sets (same callbacks) with updated options. */
  const rerenderSets = (next: RenderOptions) =>
    utils.rerender(buildElement(next));
  return { ...utils, callbacks, rerenderSets };
}

describe('ActiveWorkoutFocusSets', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('renders a row per set with weight, reps and the headers', () => {
    const { getByLabelText, getByText } = renderSets({
      sets: [
        makeSet(),
        makeSet({ id: 102, set_number: 2, weight: 62.5, reps: 8 }),
      ],
    });
    expect(getByLabelText('Weight for set 1').props.value).toBe('60');
    expect(getByLabelText('Reps for set 1').props.value).toBe('10');
    expect(getByLabelText('Weight for set 2').props.value).toBe('62.5');
    expect(getByLabelText('Reps for set 2').props.value).toBe('8');
    expect(getByText('Weight (kg)')).toBeTruthy();
    expect(getByText('Reps')).toBeTruthy();
    expect(getByText('RPE')).toBeTruthy();
  });

  it('shows assumed values as placeholders on empty fields', () => {
    const { getByLabelText } = renderSets({
      sets: [makeSet({ weight: null, reps: null })],
      assumed: [{ weight: 55, reps: 12 }],
    });
    expect(getByLabelText('Weight for set 1').props.value).toBe('');
    expect(getByLabelText('Weight for set 1').props.placeholder).toBe('55');
    expect(getByLabelText('Reps for set 1').props.placeholder).toBe('12');
  });

  it('steps weight by 2.5 kg and reps by 1', () => {
    const { getByLabelText, callbacks } = renderSets();
    fireEvent.press(getByLabelText('Increase weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 62.5,
    });
    fireEvent.press(getByLabelText('Decrease weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 57.5,
    });
    fireEvent.press(getByLabelText('Increase reps for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      reps: 11,
    });
    fireEvent.press(getByLabelText('Decrease reps for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      reps: 9,
    });
  });

  it('steps weight by 5 lb and stores kg', () => {
    // 90.72 kg reads back as 200 lb; one step up is 205 lb.
    const { getByLabelText, callbacks } = renderSets({
      weightUnit: 'lbs',
      sets: [makeSet({ weight: 90.72 })],
    });
    expect(getByLabelText('Weight for set 1').props.value).toBe('200');
    fireEvent.press(getByLabelText('Increase weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
      weight: 92.99,
    });
  });

  it('steps from the assumed value when the field is empty', () => {
    const { getByLabelText, callbacks } = renderSets({
      sets: [makeSet({ weight: null, reps: null })],
      assumed: [{ weight: 50, reps: 8 }],
    });
    fireEvent.press(getByLabelText('Increase weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 52.5,
    });
    fireEvent.press(getByLabelText('Decrease reps for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      reps: 7,
    });
  });

  it('never steps below zero', () => {
    const { getByLabelText, callbacks } = renderSets({
      sets: [makeSet({ weight: 1, reps: 0 })],
    });
    fireEvent.press(getByLabelText('Decrease weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 0,
    });
    fireEvent.press(getByLabelText('Decrease reps for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      reps: 0,
    });
  });

  it('commits typed values on blur, not per keystroke', () => {
    const { getByLabelText, callbacks } = renderSets();
    const weight = getByLabelText('Weight for set 1');
    fireEvent.changeText(weight, '72.5');
    expect(callbacks.onCommitField).not.toHaveBeenCalled();
    fireEvent(weight, 'blur');
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
      weight: 72.5,
    });

    const reps = getByLabelText('Reps for set 1');
    fireEvent.changeText(reps, '12');
    fireEvent(reps, 'blur');
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      reps: 12,
    });
  });

  it('does not commit an unchanged typed value', () => {
    const { getByLabelText, callbacks } = renderSets();
    const weight = getByLabelText('Weight for set 1');
    fireEvent.changeText(weight, '60');
    fireEvent(weight, 'blur');
    expect(callbacks.onCommitField).not.toHaveBeenCalled();
  });

  it('commits a typed draft when the row unmounts without a blur', () => {
    const { getByLabelText, unmount, callbacks } = renderSets();
    fireEvent.changeText(getByLabelText('Weight for set 1'), '72.5');
    expect(callbacks.onCommitField).not.toHaveBeenCalled();
    unmount();
    expect(callbacks.onCommitField).toHaveBeenCalledTimes(1);
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
      weight: 72.5,
    });
  });

  it('does not commit on unmount when nothing was typed or the draft is unchanged', () => {
    const untouched = renderSets();
    untouched.unmount();
    expect(untouched.callbacks.onCommitField).not.toHaveBeenCalled();

    const unchanged = renderSets();
    fireEvent.changeText(unchanged.getByLabelText('Weight for set 1'), '60');
    unchanged.unmount();
    expect(unchanged.callbacks.onCommitField).not.toHaveBeenCalled();
  });

  it('clears the field when the typed text is emptied', () => {
    const { getByLabelText, callbacks } = renderSets();
    const reps = getByLabelText('Reps for set 1');
    fireEvent.changeText(reps, '');
    fireEvent(reps, 'blur');
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
      reps: null,
    });
  });

  it('flushes pending typing before completing the set', () => {
    const { getByLabelText, callbacks } = renderSets({ activeSetId: '101' });
    fireEvent.changeText(getByLabelText('Reps for set 1'), '9');
    fireEvent.press(getByLabelText('Mark set 1 complete'));
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 9 });
    expect(callbacks.onCompleteSet).toHaveBeenCalledWith('101');
  });

  it('completes and un-completes through the check', () => {
    const upcoming = renderSets();
    fireEvent.press(upcoming.getByLabelText('Mark set 1 complete'));
    expect(upcoming.callbacks.onCompleteSet).toHaveBeenCalledWith('101');
    upcoming.unmount();

    const done = renderSets({ completedSetIds: { '101': 1 } });
    fireEvent.press(done.getByLabelText('Un-complete set 1'));
    expect(done.callbacks.onUncomplete).toHaveBeenCalledWith('101');
    expect(done.callbacks.onCompleteSet).not.toHaveBeenCalled();
  });

  it('marks completion in accessibilityState and dims done values', () => {
    const done = renderSets({ completedSetIds: { '101': 1 } });
    expect(
      done.getByLabelText('Un-complete set 1').props.accessibilityState
    ).toEqual({ checked: true });
    expect(
      StyleSheet.flatten(done.getByTestId('focus-set-values').props.style)
        .opacity
    ).toBe(0.62);
    done.unmount();

    const open = renderSets();
    expect(
      open.getByLabelText('Mark set 1 complete').props.accessibilityState
    ).toEqual({ checked: false });
    expect(
      StyleSheet.flatten(open.getByTestId('focus-set-values').props.style)
    ).toBeUndefined();
  });

  it('labels warm-ups W and numbers working sets without them', () => {
    const { getByText, queryByText } = renderSets({
      sets: [
        makeSet({ set_type: 'warmup' }),
        makeSet({ id: 102, set_number: 2 }),
      ],
    });
    expect(getByText('W')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(queryByText('2')).toBeNull();
  });

  it('shows the RIR effort column and activates it with the render key', () => {
    const { getByLabelText, getByText, callbacks } = renderSets({
      metricColumn: 'rir',
      sets: [makeSet({ rir: 2 })],
    });
    expect(getByText('RIR')).toBeTruthy();
    expect(getByLabelText('RIR for set 1').props.value).toBe('2');
    fireEvent(getByLabelText('RIR for set 1'), 'focus');
    expect(callbacks.onActivateRpe).toHaveBeenCalledWith('key-101');
  });

  it('commits a typed RPE on blur and a typed RIR to the rir field', () => {
    const rpe = renderSets();
    const rpeInput = rpe.getByLabelText('RPE for set 1');
    fireEvent.changeText(rpeInput, '8.5');
    expect(rpe.callbacks.onCommitField).not.toHaveBeenCalled();
    fireEvent(rpeInput, 'blur');
    expect(rpe.callbacks.onCommitField).toHaveBeenCalledWith('101', {
      rpe: 8.5,
    });
    rpe.unmount();

    const rir = renderSets({ metricColumn: 'rir' });
    const rirInput = rir.getByLabelText('RIR for set 1');
    fireEvent.changeText(rirInput, '2');
    fireEvent(rirInput, 'blur');
    expect(rir.callbacks.onCommitField).toHaveBeenCalledWith('101', {
      rir: 2,
    });
  });

  it('reports focus with the render key and registers an accessory handle', () => {
    const { getByLabelText, callbacks } = renderSets();
    fireEvent(getByLabelText('Weight for set 1'), 'focus');
    expect(callbacks.onActivateSet).toHaveBeenCalledWith('key-101', 'weight');
    fireEvent(getByLabelText('Reps for set 1'), 'focus');
    expect(callbacks.onActivateSet).toHaveBeenCalledWith('key-101', 'reps');

    const [key, handle] = callbacks.onRegisterAccessoryHandle.mock.calls[0];
    expect(key).toBe('key-101');
    fireEvent.changeText(getByLabelText('RPE for set 1'), '9');
    act(() => handle.log());
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { rpe: 9 });
    expect(callbacks.onCompleteSet).toHaveBeenCalledWith('101');
  });

  it('advances to the next set, or adds one after the last', () => {
    const { callbacks } = renderSets({
      sets: [makeSet(), makeSet({ id: 102, set_number: 2 })],
    });
    const handles = Object.fromEntries(
      callbacks.onRegisterAccessoryHandle.mock.calls
    );
    act(() => handles['key-101'].advance());
    expect(callbacks.onActivateSet).toHaveBeenCalledWith('102', 'weight');
    act(() => handles['102'].advance());
    expect(callbacks.onAddSet).toHaveBeenCalledWith('entry-1');
  });

  it('keeps a decimal point while typing in a focused fallback row', () => {
    const { getByLabelText, callbacks } = renderSets({
      modality: 'weight_distance',
      sets: [makeSet({ distance: null } as Partial<WorkoutCardSet>)],
      focusedSetKey: 'key-101',
      focusedField: 'distance',
    });
    const distance = getByLabelText('Distance');
    fireEvent.changeText(distance, '5.');
    expect(getByLabelText('Distance').props.value).toBe('5.');
    fireEvent(distance, 'focus');
    expect(callbacks.onActivateSet).toHaveBeenCalledWith('key-101', 'distance');
  });

  it('shows the volume column read-only, as the list does', () => {
    const { getByText, queryByLabelText } = renderSets({
      metricColumn: 'volume',
      sets: [makeSet({ weight: 60, reps: 10 })],
    });
    expect(getByText('Vol')).toBeTruthy();
    expect(getByText('600')).toBeTruthy();
    expect(queryByLabelText('RPE for set 1')).toBeNull();
  });

  it('shows estimated maxes read-only for 1RM and 10RM', () => {
    const e1rm = renderSets({
      metricColumn: 'e1rm',
      sets: [makeSet({ weight: 60, reps: 10 })],
    });
    expect(e1rm.getByText('1RM')).toBeTruthy();
    expect(e1rm.getByText('80')).toBeTruthy();
    e1rm.unmount();
    const tenrm = renderSets({
      metricColumn: 'tenrm',
      sets: [makeSet({ weight: 60, reps: 10 })],
    });
    expect(tenrm.getByText('10RM')).toBeTruthy();
    expect(tenrm.getByText('60')).toBeTruthy();
  });

  it('clamps the weight-derived columns to RPE for reps-only tables', () => {
    const { getByLabelText, getByText } = renderSets({
      metricColumn: 'volume',
      modality: 'reps_only',
      sets: [makeSet({ weight: null, rpe: 8 })],
    });
    expect(getByText('RPE')).toBeTruthy();
    expect(getByLabelText('RPE for set 1')).toBeTruthy();
  });

  it('opens the metric menu from the effort header, flagging a clamped table', () => {
    const normal = renderSets();
    fireEvent.press(normal.getByLabelText('Change metric column'));
    expect(normal.callbacks.onPressMetricHeader).toHaveBeenCalledWith(
      { x: 1, y: 2, width: 3, height: 4 },
      false
    );
    normal.unmount();

    const clamped = renderSets({ modality: 'reps_only' });
    fireEvent.press(clamped.getByLabelText('Change metric column'));
    expect(clamped.callbacks.onPressMetricHeader).toHaveBeenCalledWith(
      expect.any(Object),
      true
    );
  });

  it.each([
    ['duration', { weight: null, reps: null, duration: 30 }],
    ['weight_duration', { weight: 20, reps: null, duration: 30 }],
    ['weight_distance', { weight: 20, reps: null, distance: 0.1 }],
  ])(
    'heads %s fallback rows and lets the metric be changed',
    (modality, set) => {
      const { getByLabelText, callbacks } = renderSets({
        modality,
        sets: [makeSet(set as Partial<WorkoutCardSet>)],
      });
      fireEvent.press(getByLabelText('Change metric column'));
      expect(callbacks.onPressMetricHeader).toHaveBeenCalledWith(
        { x: 1, y: 2, width: 3, height: 4 },
        true
      );
    }
  );

  it("steps weight by the lifter's plate rounding for non-dumbbell exercises", () => {
    useAppPreferencesStore.setState({
      warmupPlateRounding: { kg: 5, lbs: 10 },
    });
    const { getByLabelText, callbacks } = renderSets({
      equipment: ['barbell'],
    });
    fireEvent.press(getByLabelText('Increase weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 65,
    });
  });

  it('steps weight by the dumbbell rounding for dumbbell exercises, in lbs too', () => {
    const kg = renderSets({ equipment: ['dumbbell'] });
    fireEvent.press(kg.getByLabelText('Increase weight for set 1'));
    expect(kg.callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 61,
    });
    kg.unmount();

    useAppPreferencesStore.setState({
      warmupDumbbellRounding: { kg: 1, lbs: 5 },
    });
    const lbs = renderSets({
      equipment: ['dumbbell'],
      weightUnit: 'lbs',
      sets: [makeSet({ weight: 45.359237 })],
    });
    fireEvent.press(lbs.getByLabelText('Increase weight for set 1'));
    // 100 lb + one 5 lb step, stored as kg.
    expect(lbs.callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: expect.closeTo(47.63, 1),
    });
  });

  it('shows a 1.25 kg step exactly and unchanged by the unchanged-value check', () => {
    useAppPreferencesStore.setState({
      warmupPlateRounding: { kg: 1.25, lbs: 5 },
    });
    const { getByLabelText, callbacks, rerenderSets } = renderSets({
      equipment: ['barbell'],
    });
    fireEvent.press(getByLabelText('Increase weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 61.25,
    });
    rerenderSets({
      sets: [makeSet({ weight: 61.25 })],
      equipment: ['barbell'],
    });
    const weight = getByLabelText('Weight for set 1');
    expect(weight.props.value).toBe('61.25');

    // Typing the value already stored is not an edit...
    callbacks.onCommitField.mockClear();
    fireEvent.changeText(weight, '61.25');
    fireEvent(weight, 'blur');
    expect(callbacks.onCommitField).not.toHaveBeenCalled();
    // ...but a nearby value is.
    fireEvent.changeText(weight, '61.3');
    fireEvent(weight, 'blur');
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
      weight: 61.3,
    });
  });

  it('steps lbs by 2.5 without noise: 102.5, 105, 107.5', () => {
    useAppPreferencesStore.setState({
      warmupPlateRounding: { kg: 2.5, lbs: 2.5 },
    });
    const kgOf = (lbs: number) => Math.round(lbs * 0.45359237 * 100) / 100;
    let weightKg = kgOf(100);
    const { getByLabelText, callbacks, rerenderSets } = renderSets({
      weightUnit: 'lbs',
      equipment: ['barbell'],
      sets: [makeSet({ weight: weightKg })],
    });
    const shown: string[] = [];
    for (let i = 0; i < 3; i++) {
      fireEvent.press(getByLabelText('Increase weight for set 1'));
      weightKg = (
        callbacks.onCommitField.mock.calls.at(-1) as [
          string,
          { weight: number },
        ]
      )[1].weight;
      rerenderSets({
        weightUnit: 'lbs',
        equipment: ['barbell'],
        sets: [makeSet({ weight: weightKg })],
      });
      shown.push(getByLabelText('Weight for set 1').props.value);
    }
    expect(shown).toEqual(['102.5', '105', '107.5']);
  });

  it('keeps the default plate step without equipment', () => {
    const { getByLabelText, callbacks } = renderSets();
    fireEvent.press(getByLabelText('Increase weight for set 1'));
    expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', {
      weight: 62.5,
    });
  });

  it('commits an effort draft to the metric it was typed for after a switch', () => {
    const { getByLabelText, callbacks, rerenderSets } = renderSets({
      metricColumn: 'rpe',
    });
    fireEvent.changeText(getByLabelText('RPE for set 1'), '8');
    expect(callbacks.onCommitField).not.toHaveBeenCalled();

    rerenderSets({ metricColumn: 'rir' });
    expect(callbacks.onCommitField).toHaveBeenCalledTimes(1);
    expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { rpe: 8 });
    expect(callbacks.onCommitField).not.toHaveBeenCalledWith(
      '101',
      expect.objectContaining({ rir: expect.anything() })
    );
    expect(getByLabelText('RIR for set 1').props.value).toBe('');
  });

  it('disables swipe-to-delete on fallback rows but leaves the detail Delete', () => {
    const { queryByTestId } = renderSets({
      modality: 'duration',
      sets: [makeSet({ weight: null, reps: null, duration: 30 })],
      withDelete: true,
    });
    expect(queryByTestId('set-row')).toBeTruthy();
    expect(queryByTestId('reanimated-swipeable')).toBeNull();
  });

  it('unregisters its accessory handle when a row unmounts', () => {
    const { callbacks, unmount } = renderSets();
    expect(callbacks.onRegisterAccessoryHandle).toHaveBeenCalledWith(
      'key-101',
      expect.any(Object)
    );
    unmount();
    expect(callbacks.onRegisterAccessoryHandle).toHaveBeenLastCalledWith(
      'key-101',
      null
    );
  });

  it('opens the set-type menu from the set number', () => {
    const { getByLabelText, callbacks } = renderSets();
    fireEvent.press(getByLabelText('Change type for set 1'));
    expect(callbacks.onPressSetType).toHaveBeenCalledWith('101', {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
  });

  it('opens the set-type menu from a fallback (timed) row too', () => {
    const { getByLabelText, callbacks } = renderSets({
      modality: 'duration',
      sets: [makeSet({ weight: null, reps: null, duration: 30 })],
    });
    fireEvent.press(getByLabelText('Change type for set 1'));
    expect(callbacks.onPressSetType).toHaveBeenCalledWith(
      '101',
      expect.any(Object)
    );
  });

  it('toggles the set detail on long press, keyed by render key', () => {
    const { getByTestId, callbacks } = renderSets({
      withDetail: true,
      withDelete: true,
    });
    fireEvent(getByTestId('focus-set-row'), 'longPress');
    expect(callbacks.onToggleSetDetail).toHaveBeenCalledWith('key-101');
    // Long-press no longer deletes once the detail panel owns it.
    expect(callbacks.onDeleteSet).not.toHaveBeenCalled();
  });

  it('toggles the set detail from a fallback row long press', () => {
    const { getByTestId, callbacks } = renderSets({
      withDetail: true,
      modality: 'duration',
      sets: [makeSet({ weight: null, reps: null, duration: 30 })],
    });
    fireEvent(getByTestId('set-row'), 'longPress');
    expect(callbacks.onToggleSetDetail).toHaveBeenCalledWith('key-101');
  });

  it('shows the set note and a Delete set button under the expanded row', () => {
    const { getByLabelText, getByText, callbacks } = renderSets({
      expandedSetKey: 'key-101',
      withDelete: true,
    });
    expect(getByLabelText('Notes for set 1')).toBeTruthy();
    fireEvent.press(getByText('Delete set'));
    expect(callbacks.onDeleteSet).toHaveBeenCalledWith('101');
  });

  it('shows no detail panel for a collapsed row', () => {
    const { queryByLabelText } = renderSets({ withDelete: true });
    expect(queryByLabelText('Notes for set 1')).toBeNull();
  });

  it('hides weight for reps-only exercises', () => {
    const { queryByLabelText, getByLabelText } = renderSets({
      modality: 'reps_only',
    });
    expect(queryByLabelText('Weight for set 1')).toBeNull();
    expect(getByLabelText('Reps for set 1')).toBeTruthy();
  });

  it('adds a set for the entry', () => {
    const { getByLabelText, callbacks } = renderSets();
    fireEvent.press(getByLabelText('Add set to Bench Press'));
    expect(callbacks.onAddSet).toHaveBeenCalledWith('entry-1');
  });

  it('deletes a set on long press only when a handler is wired', () => {
    const wired = renderSets({ withDelete: true });
    fireEvent(wired.getByTestId('focus-set-row'), 'longPress');
    expect(wired.callbacks.onDeleteSet).toHaveBeenCalledWith('101');
    wired.unmount();

    const unwired = renderSets();
    expect(
      unwired.getByTestId('focus-set-row').props.onLongPress
    ).toBeUndefined();
  });

  it('keeps the list row for timed exercises', () => {
    const { queryByLabelText, queryByTestId } = renderSets({
      modality: 'duration',
      sets: [makeSet({ weight: null, reps: null, duration: 30 })],
    });
    expect(queryByTestId('focus-set-row')).toBeNull();
    expect(queryByLabelText('Increase weight for set 1')).toBeNull();
    expect(queryByTestId('set-row')).toBeTruthy();
  });
});
