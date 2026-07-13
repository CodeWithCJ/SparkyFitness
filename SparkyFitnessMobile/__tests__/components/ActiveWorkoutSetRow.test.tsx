import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useCSSVariable } from 'uniwind';
import type {
  ExerciseEntrySetResponse,
  ExerciseRecentSessionSet,
} from '@workspace/shared';
import ActiveWorkoutSetRow, {
  parseRpeInput,
  type SetRowMode,
  type SetRowState,
} from '../../src/components/ActiveWorkoutSetRow';
import type { WorkoutCardSet } from '../../src/utils/workoutSession';
import type { ActiveWorkoutMetricColumn } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

// Distinct values per CSS variable so RPE tone-color assertions mean something
// (the global uniwind mock returns the same color for everything).
const COLORS: Record<string, string> = {
  '--color-accent-primary': '#e11d48',
  '--color-icon-success': '#22c55e',
  '--color-text-muted': '#9ca3af',
  '--color-chrome': '#111111',
  '--color-chrome-border': '#222222',
  '--color-bg-danger': '#7f1d1d',
  '--color-border-subtle': '#333333',
  '--color-cat-amber': '#f59e0b',
  '--color-cat-orange': '#f97316',
  '--color-icon-danger': '#ef4444',
};

function makeSet(overrides?: Partial<ExerciseEntrySetResponse>): ExerciseEntrySetResponse {
  return {
    id: 101,
    set_number: 1,
    set_type: 'normal',
    reps: 10,
    weight: 60,
    duration: null,
    rest_time: 90,
    notes: null,
    rpe: null,
    completed_at: null,
    ...overrides,
  };
}

interface RenderOverrides {
  set?: Partial<WorkoutCardSet>;
  state?: SetRowState;
  metricColumn?: ActiveWorkoutMetricColumn;
  weightUnit?: 'kg' | 'lbs';
  displayNumber?: number;
  readOnly?: boolean;
  mode?: SetRowMode;
  activeField?: 'weight' | 'reps';
  isFocused?: boolean;
  nextSetId?: string | null;
  entryId?: string;
  rpeEditable?: boolean;
  completedBadge?: boolean;
  previousSet?: ExerciseRecentSessionSet | null;
  /** Wire the edit-mode completion toggle (otherwise the check is static). */
  enableToggle?: boolean;
  /** Wire the set-type handler (makes the set number a menu trigger). */
  enableSetType?: boolean;
}

function renderRow(overrides?: RenderOverrides) {
  const callbacks = {
    onComplete: jest.fn(),
    onUncomplete: jest.fn(),
    onCommitField: jest.fn(),
    onDelete: jest.fn(),
    onLongPress: jest.fn(),
    onActivateSet: jest.fn(),
    onActivateRpe: jest.fn(),
    onToggleComplete: jest.fn(),
    onDeactivate: jest.fn(),
    onEditFieldChange: jest.fn(),
    onAddSet: jest.fn(),
    onPressSetType: jest.fn(),
  };
  // onToggleComplete and onPressSetType are opt-in (via enableToggle /
  // enableSetType) so most tests exercise the static-check + onLongPress
  // fallbacks.
  const { onToggleComplete, onPressSetType, ...spreadCallbacks } = callbacks;
  const buildElement = (current?: RenderOverrides) => (
    <ActiveWorkoutSetRow
      set={makeSet(current?.set as Partial<ExerciseEntrySetResponse>)}
      displayNumber={current?.displayNumber ?? 1}
      state={current?.state ?? 'current'}
      metricColumn={current?.metricColumn ?? 'rpe'}
      weightUnit={current?.weightUnit ?? 'kg'}
      mode={current?.mode ?? (current?.readOnly ? 'view' : undefined)}
      activeField={current?.activeField}
      isFocused={current?.isFocused}
      nextSetId={current?.nextSetId}
      entryId={current?.entryId}
      rpeEditable={current?.rpeEditable}
      completedBadge={current?.completedBadge}
      previousSet={current?.previousSet}
      {...spreadCallbacks}
      onToggleComplete={current?.enableToggle ? onToggleComplete : undefined}
      onPressSetType={current?.enableSetType ? onPressSetType : undefined}
    />
  );
  const utils = render(buildElement(overrides));
  /** Re-render the same row (same callbacks) with updated overrides — e.g. the committed set flowing back. */
  const rerenderRow = (next: RenderOverrides) => utils.rerender(buildElement(next));
  return { ...utils, callbacks, rerenderRow };
}

function textColor(element: { props: { style: unknown } }) {
  return StyleSheet.flatten(element.props.style as any).color;
}

describe('parseRpeInput', () => {
  it('returns null for empty or non-numeric input', () => {
    expect(parseRpeInput('')).toBeNull();
    expect(parseRpeInput('abc')).toBeNull();
  });

  it('snaps to 0.5 steps', () => {
    expect(parseRpeInput('7')).toBe(7);
    expect(parseRpeInput('7.3')).toBe(7.5);
    expect(parseRpeInput('7.2')).toBe(7);
    expect(parseRpeInput('8.75')).toBe(9);
  });

  it('clamps to the 1–10 range', () => {
    expect(parseRpeInput('0.2')).toBe(1);
    expect(parseRpeInput('12')).toBe(10);
  });
});

describe('ActiveWorkoutSetRow', () => {
  beforeEach(() => {
    (useCSSVariable as jest.Mock).mockImplementation((vars: string | string[]) =>
      Array.isArray(vars)
        ? vars.map((v) => COLORS[v] ?? '#888888')
        : (COLORS[vars] ?? '#888888'),
    );
  });

  describe('done state', () => {
    it('dims the row content to 0.62 opacity but keeps the check vivid', () => {
      const { getByTestId, getByLabelText } = renderRow({ state: 'done' });
      expect(StyleSheet.flatten(getByTestId('set-row-content').props.style).opacity).toBe(0.62);
      // The completion check sits outside the dimmed content so its green
      // matches the card/rail badges instead of fading with the row.
      expect(
        StyleSheet.flatten(getByLabelText('Un-complete set 1').props.style)?.opacity,
      ).toBeUndefined();
    });

    it('un-completes on check press', () => {
      const { getByLabelText, callbacks } = renderRow({ state: 'done' });
      fireEvent.press(getByLabelText('Un-complete set 1'));
      expect(callbacks.onUncomplete).toHaveBeenCalledWith('101');
    });

    it('exposes swipe delete', () => {
      const { getByLabelText, callbacks } = renderRow({ state: 'done' });
      fireEvent.press(getByLabelText('Delete set 1'));
      expect(callbacks.onDelete).toHaveBeenCalledWith('101');
    });
  });

  // The cursor (next-unlogged) row when the keyboard is elsewhere: it shows
  // planned values as tap-to-edit display cells plus the pulsing log ring.
  describe('current state — cursor, not focused', () => {
    it('logs an unedited row without re-committing its values (no drift)', () => {
      // lbs so a re-commit would be visible: the seeded weight display round-
      // trips lbs↔kg and drifts the stored value (60 kg → ~60.01 kg). Nothing
      // was edited, so no field commits — only completion fires.
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        weightUnit: 'lbs',
      });
      fireEvent.press(getByLabelText('Log set 1'));
      expect(callbacks.onCommitField).not.toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalledWith('101');
    });

    it('activates the tapped cell instead of showing inputs inline', () => {
      const { getByLabelText, queryByLabelText, callbacks } = renderRow({ state: 'current' });
      expect(queryByLabelText('Weight')).toBeNull();
      fireEvent.press(getByLabelText('Edit weight for set 1'));
      expect(callbacks.onActivateSet).toHaveBeenCalledWith('101', 'weight');
      fireEvent.press(getByLabelText('Edit reps for set 1'));
      expect(callbacks.onActivateSet).toHaveBeenCalledWith('101', 'reps');
    });

    it('activates RPE when the RPE column cell is tapped', () => {
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        metricColumn: 'rpe',
      });
      fireEvent.press(getByLabelText('Edit RPE for set 1'));
      expect(callbacks.onActivateRpe).toHaveBeenCalledWith('101');
    });

    it('does not make a non-RPE metric column tappable', () => {
      const { queryByLabelText } = renderRow({ state: 'current', metricColumn: 'volume' });
      expect(queryByLabelText('Edit RPE for set 1')).toBeNull();
    });
  });

  describe('current state — focused, editing', () => {
    it('commits weight in kg on blur', () => {
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        isFocused: true,
        weightUnit: 'kg',
      });
      const input = getByLabelText('Weight');
      expect(input.props.value).toBe('60');
      fireEvent.changeText(input, '105');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 105 });
    });

    it('converts a typed lbs weight to kg quantized to the server precision', () => {
      // DECIMAL(10,2) storage: committing the raw conversion (61.23496995…)
      // would make the autosave echo differ and re-seed the row's drafts.
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        isFocused: true,
        weightUnit: 'lbs',
      });
      const input = getByLabelText('Weight');
      expect(input.props.value).toBe('132.3');
      fireEvent.changeText(input, '135');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 61.23 });
    });

    it('does not re-commit a draft that parses back to the stored weight', () => {
      // The draft can legally hold more decimals than the seeded display form
      // (it survives under focus without re-seeding). If it still quantizes to
      // the stored kg, committing it would only bump the revision.
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        isFocused: true,
        weightUnit: 'lbs',
        set: { weight: 61.26 },
      });
      const input = getByLabelText('Weight');
      fireEvent.changeText(input, '135.05'); // 61.2576… kg → quantizes to 61.26
      fireEvent(input, 'blur');
      const weightCommits = callbacks.onCommitField.mock.calls.filter(
        ([, patch]) => 'weight' in patch,
      );
      expect(weightCommits).toHaveLength(0);
    });

    it('commits a cleared weight as null', () => {
      const { getByLabelText, callbacks } = renderRow({ state: 'current', isFocused: true });
      const input = getByLabelText('Weight');
      fireEvent.changeText(input, '');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: null });
    });

    it('does not re-commit an untouched weight on blur (no lbs↔kg drift)', () => {
      // Tap a set to peek, then leave without editing. The seeded display value
      // must not round-trip back through the unit conversion and drift the kg.
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        isFocused: true,
        weightUnit: 'lbs',
      });
      const input = getByLabelText('Weight');
      expect(input.props.value).toBe('132.3'); // 60 kg shown in lbs
      fireEvent(input, 'blur');
      const weightCommits = callbacks.onCommitField.mock.calls.filter(
        ([, patch]) => 'weight' in patch,
      );
      expect(weightCommits).toHaveLength(0);
    });

    it('commits reps on blur', () => {
      const { getByLabelText, callbacks } = renderRow({ state: 'current', isFocused: true });
      const input = getByLabelText('Reps');
      expect(input.props.value).toBe('10');
      fireEvent.changeText(input, '12');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 12 });
    });

    it('logging commits all drafts, then completes the set', () => {
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        isFocused: true,
        metricColumn: 'rpe',
      });
      fireEvent.changeText(getByLabelText('Weight'), '80');
      fireEvent.changeText(getByLabelText('Reps'), '8');
      fireEvent.changeText(getByLabelText('RPE'), '8.2');

      fireEvent.press(getByLabelText('Log set 1'));

      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 80 });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 8 });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { rpe: 8 });
      expect(callbacks.onComplete).toHaveBeenCalledWith('101');
      // Draft commits must land before completion so the completed set holds
      // exactly what the user saw.
      const completeOrder = callbacks.onComplete.mock.invocationCallOrder[0];
      for (const order of callbacks.onCommitField.mock.invocationCallOrder) {
        expect(order).toBeLessThan(completeOrder);
      }
    });

    it('commits in-progress drafts when the row deactivates without a blur', () => {
      // The accessory Done button and a tap on another row both deactivate the
      // row before the input's native blur event can reach JS — the commit
      // must not depend on blur firing.
      const base = { state: 'current' as const, metricColumn: 'rpe' as const };
      const { getByLabelText, callbacks, rerenderRow } = renderRow({
        ...base,
        isFocused: true,
      });
      fireEvent.changeText(getByLabelText('Weight'), '80');
      fireEvent.changeText(getByLabelText('Reps'), '8');
      fireEvent.changeText(getByLabelText('RPE'), '8');
      expect(callbacks.onCommitField).not.toHaveBeenCalled();

      rerenderRow({ ...base, isFocused: false });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 80 });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 8 });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { rpe: 8 });
    });

    it('commits nothing when an untouched row deactivates', () => {
      const base = { state: 'current' as const, metricColumn: 'rpe' as const };
      const { callbacks, rerenderRow } = renderRow({ ...base, isFocused: true });
      rerenderRow({ ...base, isFocused: false });
      expect(callbacks.onCommitField).not.toHaveBeenCalled();
    });

    it('hides the RPE input for non-RPE metric columns', () => {
      const { queryByLabelText, getByText } = renderRow({
        state: 'current',
        isFocused: true,
        metricColumn: 'volume',
      });
      expect(queryByLabelText('RPE')).toBeNull();
      expect(getByText('600')).toBeTruthy();
    });

    it('does not wrap the actively-edited row in a swipeable', () => {
      const { queryByTestId } = renderRow({ state: 'current', isFocused: true });
      expect(queryByTestId('reanimated-swipeable')).toBeNull();
    });

    it('gives each input a distinct accessory id so the keyboard bar shows on all three', () => {
      // iOS attaches a shared InputAccessoryView to only the first input, so a
      // single id would leave reps/RPE with a bare keyboard.
      const { getByLabelText } = renderRow({
        state: 'current',
        isFocused: true,
        metricColumn: 'rpe',
      });
      const ids = [
        getByLabelText('Weight').props.inputAccessoryViewID,
        getByLabelText('Reps').props.inputAccessoryViewID,
        getByLabelText('RPE').props.inputAccessoryViewID,
      ];
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(3);
    });

    it('issues a fresh accessory id on each activation but holds it while active', () => {
      // Fabric recycles native TextInputs with their last props retained, so a
      // remount that reuses a prior activation's exact id string is treated as
      // unchanged and the accessory bar never reattaches (bare keyboard on the
      // second edit of the same cell). Re-renders during one activation must
      // NOT change the id, or the live attachment breaks under the open
      // keyboard (e.g. autosave churn).
      const base = { state: 'current' as const, metricColumn: 'rpe' as const };
      const { getByLabelText, rerenderRow } = renderRow({ ...base, isFocused: true });
      const firstId = getByLabelText('Weight').props.inputAccessoryViewID;

      rerenderRow({ ...base, isFocused: true, weightUnit: 'lbs' });
      expect(getByLabelText('Weight').props.inputAccessoryViewID).toBe(firstId);

      rerenderRow({ ...base, isFocused: false });
      rerenderRow({ ...base, isFocused: true });
      const secondId = getByLabelText('Weight').props.inputAccessoryViewID;
      expect(secondId).toBeTruthy();
      expect(secondId).not.toBe(firstId);
    });
  });

  describe('upcoming state', () => {
    it('logs out of order from its own ring', () => {
      // Skip-ahead logging: an upcoming set carries a tappable ring so the user
      // can complete it without finishing the sets before it. An unedited row
      // logs its stored values as-is (no lossy re-commit).
      const { getByLabelText, callbacks } = renderRow({ state: 'upcoming' });
      fireEvent.press(getByLabelText('Log set 1'));
      expect(callbacks.onCommitField).not.toHaveBeenCalled();
      expect(callbacks.onComplete).toHaveBeenCalledWith('101');
    });

    it('still lets an upcoming cell be tapped to edit (pre-fill)', () => {
      const { getByLabelText, callbacks } = renderRow({ state: 'upcoming' });
      fireEvent.press(getByLabelText('Edit weight for set 1'));
      expect(callbacks.onActivateSet).toHaveBeenCalledWith('101', 'weight');
    });

    it('offers Log in the keyboard accessory while uncompleted', () => {
      // Out-of-order logging: a focused upcoming row must be loggable from the
      // accessory too, or the RPE field (last in the Next chain) dead-ends on
      // Done. One bar per input, so the button appears once per accessory.
      const { getAllByText, callbacks } = renderRow({
        state: 'upcoming',
        isFocused: true,
        metricColumn: 'rpe',
      });
      fireEvent.press(getAllByText('Log')[0]);
      expect(callbacks.onComplete).toHaveBeenCalledWith('101');
    });

    it('omits Log from the accessory once the set is completed', () => {
      const { queryByText } = renderRow({ state: 'done', isFocused: true });
      expect(queryByText('Log')).toBeNull();
    });

    it('is not dimmed', () => {
      const { getByTestId } = renderRow({ state: 'upcoming' });
      expect(StyleSheet.flatten(getByTestId('set-row').props.style)?.opacity).toBeUndefined();
    });
  });

  describe('readOnly', () => {
    it('renders a static checkmark on done rows with no un-complete control', () => {
      const { getByTestId, queryByLabelText } = renderRow({ state: 'done', readOnly: true });
      expect(getByTestId('icon-checkmark')).toBeTruthy();
      expect(queryByLabelText('Un-complete set 1')).toBeNull();
    });

    it('does not dim done rows', () => {
      const { getByTestId } = renderRow({ state: 'done', readOnly: true });
      expect(StyleSheet.flatten(getByTestId('set-row').props.style)?.opacity).toBeUndefined();
    });

    it('offers no swipe-delete and no completion control', () => {
      const done = renderRow({ state: 'done', readOnly: true });
      expect(done.queryByTestId('reanimated-swipeable')).toBeNull();
      expect(done.queryByLabelText('Delete set 1')).toBeNull();

      const upcoming = renderRow({ state: 'upcoming', readOnly: true });
      expect(upcoming.queryByLabelText('Mark set 1 complete')).toBeNull();
      // View mode has no logging, so upcoming rows keep a blank last column.
      expect(upcoming.queryByLabelText('Log set 1')).toBeNull();
    });

    it('coerces a current state to a plain row with no editing chrome', () => {
      const { queryByLabelText, getByText } = renderRow({
        state: 'current',
        readOnly: true,
      });
      expect(queryByLabelText('Weight')).toBeNull();
      expect(queryByLabelText('Reps')).toBeNull();
      expect(queryByLabelText('Log set 1')).toBeNull();
      expect(queryByLabelText('RPE')).toBeNull();
      // Read-only cells are flat text, not tap-to-activate.
      expect(queryByLabelText('Edit weight for set 1')).toBeNull();
      expect(getByText('60')).toBeTruthy();
    });

    it('still fires onLongPress with the set id', () => {
      const { getByTestId, callbacks } = renderRow({ state: 'done', readOnly: true });
      fireEvent(getByTestId('set-row'), 'longPress');
      expect(callbacks.onLongPress).toHaveBeenCalledWith('101');
    });

    it('renders the metric column', () => {
      const { getByText } = renderRow({
        state: 'done',
        readOnly: true,
        metricColumn: 'volume',
      });
      expect(getByText('600')).toBeTruthy();
    });

    it('renders without the mutating callbacks', () => {
      const { getByTestId } = render(
        <ActiveWorkoutSetRow
          set={makeSet()}
          displayNumber={1}
          state="done"
          metricColumn="rpe"
          weightUnit="kg"
          mode="view"
          onLongPress={jest.fn()}
        />,
      );
      expect(getByTestId('set-row')).toBeTruthy();
    });

    it('renders without onLongPress (preset detail passes none)', () => {
      const { getByTestId } = render(
        <ActiveWorkoutSetRow
          set={makeSet()}
          displayNumber={1}
          state="upcoming"
          metricColumn="rpe"
          weightUnit="kg"
          mode="view"
        />,
      );
      fireEvent(getByTestId('set-row'), 'longPress');
      expect(getByTestId('set-row')).toBeTruthy();
    });

    it('shows the duration in the weight cell for time-based sets', () => {
      const { getByText } = renderRow({
        state: 'upcoming',
        readOnly: true,
        set: { weight: null, reps: null, duration: 90 },
      });
      expect(getByText('1:30')).toBeTruthy();
    });
  });

  describe('edit mode', () => {
    const editSet = (overrides?: Partial<WorkoutCardSet>): Partial<WorkoutCardSet> => ({
      editWeightText: '100',
      editRepsText: '5',
      ...overrides,
    });

    describe('active row (controlled inputs)', () => {
      it('renders the raw draft strings and dispatches per keystroke', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          set: editSet({ editWeightText: '102.55' }),
        });
        const weightInput = getByLabelText('Weight');
        expect(weightInput.props.value).toBe('102.55');

        fireEvent.changeText(weightInput, '102.556');
        expect(callbacks.onEditFieldChange).toHaveBeenCalledWith('101', 'weight', '102.556');
        // No commit path on typing — the reducer is the single source.
        expect(callbacks.onCommitField).not.toHaveBeenCalled();

        fireEvent.changeText(getByLabelText('Reps'), '6');
        expect(callbacks.onEditFieldChange).toHaveBeenCalledWith('101', 'reps', '6');
      });

      it('shows no log ring and no delete button (delete is swipe / long-press)', () => {
        const { queryByLabelText } = renderRow({
          mode: 'edit',
          state: 'current',
          set: editSet(),
        });
        expect(queryByLabelText('Log set 1')).toBeNull();
        // The last column no longer hosts a delete button on the active row.
        expect(queryByLabelText('Delete set 1')).toBeNull();
      });

      it('toggles completion from the last-column check when enabled', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          enableToggle: true,
          set: editSet(),
        });
        fireEvent.press(getByLabelText('Mark set 1 complete'));
        expect(callbacks.onToggleComplete).toHaveBeenCalledWith('101');
      });

      // Each input has its own InputAccessoryView (unique nativeID; iOS won't
      // share one across inputs), so the bar's buttons appear once per input —
      // all wired to the same handler, so pressing the first is equivalent.
      it('Next on the weight field keeps focus in-row; on reps it activates the next set', () => {
        const withNext = renderRow({
          mode: 'edit',
          state: 'current',
          activeField: 'reps',
          nextSetId: '202',
          entryId: 'entry-1',
          set: editSet(),
        });
        fireEvent.press(withNext.getAllByText('Next Set')[0]);
        expect(withNext.callbacks.onActivateSet).toHaveBeenCalledWith('202', 'weight');
        expect(withNext.callbacks.onAddSet).not.toHaveBeenCalled();
      });

      it('Next on the last set adds a set to the owning exercise', () => {
        const { getAllByText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          activeField: 'reps',
          nextSetId: null,
          entryId: 'entry-1',
          set: editSet(),
        });
        fireEvent.press(getAllByText('Next Set')[0]);
        expect(callbacks.onAddSet).toHaveBeenCalledWith('entry-1');
      });

      it('Done deactivates the set', () => {
        const { getAllByText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          set: editSet(),
        });
        fireEvent.press(getAllByText('Done')[0]);
        expect(callbacks.onDeactivate).toHaveBeenCalledTimes(1);
      });

      // The header Save path reads the reducer synchronously, so edit-mode RPE
      // must commit an already-snapped/clamped value on every keystroke — not
      // wait for blur like the live screen.
      it('commits the snapped+clamped RPE on every keystroke', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          metricColumn: 'rpe',
          set: editSet(),
        });
        const rpe = getByLabelText('RPE');
        fireEvent.changeText(rpe, '8.');
        expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', { rpe: 8 });
        // Snaps to 0.5 steps live (8.3 → 8.5), not just on blur.
        fireEvent.changeText(rpe, '8.3');
        expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', { rpe: 8.5 });
        fireEvent(rpe, 'blur');
        expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', { rpe: 8.5 });
      });

      it('commits null when the RPE field is cleared, so Save drops a stale value', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          metricColumn: 'rpe',
          set: editSet({ rpe: 8 }),
        });
        fireEvent.changeText(getByLabelText('RPE'), '');
        expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', { rpe: null });
      });

      it('clamps an out-of-range RPE on keystroke, so Save can never persist 11', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'current',
          metricColumn: 'rpe',
          set: editSet(),
        });
        fireEvent.changeText(getByLabelText('RPE'), '11');
        expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', { rpe: 10 });
      });

      it('does not rewrite the RPE text mid-typing when the clamp changes the committed value', () => {
        const base = { mode: 'edit' as const, state: 'current' as const, metricColumn: 'rpe' as const };
        const { getByLabelText, callbacks, rerenderRow } = renderRow({
          ...base,
          set: editSet(),
        });
        const rpe = getByLabelText('RPE');
        fireEvent.changeText(rpe, '0');
        expect(callbacks.onCommitField).toHaveBeenLastCalledWith('101', { rpe: 1 });
        // The committed (clamped) value flows back into the row; the visible
        // text must stay what the user typed, not jump "0" → "1".
        rerenderRow({ ...base, set: editSet({ rpe: 1 }) });
        expect(getByLabelText('RPE').props.value).toBe('0');
        // Blur still snaps the display to the committed form.
        fireEvent(getByLabelText('RPE'), 'blur');
        expect(getByLabelText('RPE').props.value).toBe('1');
      });

      it('hides the RPE input when rpeEditable is false', () => {
        const { queryByLabelText } = renderRow({
          mode: 'edit',
          state: 'current',
          metricColumn: 'rpe',
          rpeEditable: false,
          set: editSet(),
        });
        expect(queryByLabelText('RPE')).toBeNull();
      });
    });

    describe('inactive rows', () => {
      it('shows the draft strings and activates the tapped field', () => {
        const { getByLabelText, getByText, callbacks } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          set: editSet({ editWeightText: '102.55', editRepsText: '8' }),
        });
        expect(getByText('102.55')).toBeTruthy();
        fireEvent.press(getByLabelText('Edit weight for set 1'));
        expect(callbacks.onActivateSet).toHaveBeenCalledWith('101', 'weight');
        fireEvent.press(getByLabelText('Edit reps for set 1'));
        expect(callbacks.onActivateSet).toHaveBeenCalledWith('101', 'reps');
      });

      it('activates RPE when the RPE column cell is tapped (rpeEditable)', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          metricColumn: 'rpe',
          rpeEditable: true,
          set: editSet(),
        });
        fireEvent.press(getByLabelText('Edit RPE for set 1'));
        expect(callbacks.onActivateRpe).toHaveBeenCalledWith('101');
      });

      it('does not make the RPE column tappable when RPE is not editable (preset)', () => {
        const { queryByLabelText } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          metricColumn: 'rpe',
          rpeEditable: false,
          set: editSet(),
        });
        expect(queryByLabelText('Edit RPE for set 1')).toBeNull();
      });

      it('renders a static completed badge when the toggle is disabled', () => {
        const { getByTestId, queryByLabelText } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          completedBadge: true,
          set: editSet(),
        });
        expect(getByTestId('completed-badge')).toBeTruthy();
        expect(queryByLabelText('Un-complete set 1')).toBeNull();
        expect(queryByLabelText('Mark set 1 complete')).toBeNull();
      });

      it('un-completes a completed set via the toggle when enabled', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          completedBadge: true,
          enableToggle: true,
          set: editSet(),
        });
        fireEvent.press(getByLabelText('Un-complete set 1'));
        expect(callbacks.onToggleComplete).toHaveBeenCalledWith('101');
      });

      it('keeps swipe-delete and does not dim', () => {
        const { getByLabelText, getByTestId, callbacks } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          set: editSet(),
        });
        expect(
          StyleSheet.flatten(getByTestId('set-row').props.style)?.opacity,
        ).toBeUndefined();
        fireEvent.press(getByLabelText('Delete set 1'));
        expect(callbacks.onDelete).toHaveBeenCalledWith('101');
      });

      it('long-presses the cells through onLongPress', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          set: editSet(),
        });
        fireEvent(getByLabelText('Edit weight for set 1'), 'longPress');
        expect(callbacks.onLongPress).toHaveBeenCalledWith('101');
      });

      it('shows the duration in the weight cell for time-based sets', () => {
        const { getByText } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          set: {
            weight: null,
            reps: null,
            duration: 45,
            editWeightText: '',
            editRepsText: '',
          },
        });
        expect(getByText('45s')).toBeTruthy();
      });
    });
  });

  it('fires onLongPress with the set id', () => {
    const { getByTestId, callbacks } = renderRow({ state: 'upcoming' });
    fireEvent(getByTestId('set-row'), 'longPress');
    expect(callbacks.onLongPress).toHaveBeenCalledWith('101');
  });

  describe('set-type menu', () => {
    it('opens the set-type menu when the set number is tapped', () => {
      const { getByLabelText, callbacks } = renderRow({
        state: 'upcoming',
        enableSetType: true,
      });
      fireEvent.press(getByLabelText('Change type for set 1'));
      expect(callbacks.onPressSetType).toHaveBeenCalledWith('101', expect.any(Object));
    });

    it('routes the row long-press to onLongPress (not the set-type menu) when both are wired', () => {
      // Live wires both: long-press expands the row detail, the set-number tap
      // still opens the type menu.
      const { getByTestId, callbacks } = renderRow({
        state: 'upcoming',
        enableSetType: true,
      });
      fireEvent(getByTestId('set-row'), 'longPress');
      expect(callbacks.onLongPress).toHaveBeenCalledWith('101');
      expect(callbacks.onPressSetType).not.toHaveBeenCalled();
    });

    it('falls back to the set-type menu on long-press when no onLongPress is wired (edit form)', () => {
      const onPressSetType = jest.fn();
      const { getByTestId } = render(
        <ActiveWorkoutSetRow
          set={makeSet()}
          displayNumber={1}
          state="upcoming"
          metricColumn="rpe"
          weightUnit="kg"
          mode="edit"
          onPressSetType={onPressSetType}
        />,
      );
      fireEvent(getByTestId('set-row'), 'longPress');
      expect(onPressSetType).toHaveBeenCalledWith('101', expect.any(Object));
    });

    it('leaves the set number inert without a set-type handler', () => {
      const { queryByLabelText } = renderRow({ state: 'upcoming' });
      expect(queryByLabelText('Change type for set 1')).toBeNull();
    });
  });

  it.each([
    ['warmup', 'W'],
    ['drop', 'D'],
    ['failure', 'F'],
  ])('shows %s sets as a plain %s instead of the set number', (setType, letter) => {
    const { getByText, queryByText } = renderRow({
      state: 'upcoming',
      set: { set_type: setType, reps: 15, weight: 20 },
      displayNumber: 3,
    });
    expect(getByText(letter)).toBeTruthy();
    expect(queryByText('3')).toBeNull();
  });

  describe('metric column display', () => {
    it('shows an en-dash when RPE is missing', () => {
      const { getByText } = renderRow({ state: 'upcoming', metricColumn: 'rpe' });
      expect(getByText('–')).toBeTruthy();
    });

    it.each([
      [6, COLORS['--color-icon-success']],
      [8, COLORS['--color-cat-amber']],
      [9.5, COLORS['--color-cat-orange']],
      [10, COLORS['--color-icon-danger']],
    ])('tints RPE %s with its effort tone', (rpe, expectedColor) => {
      const { getByText } = renderRow({
        state: 'upcoming',
        metricColumn: 'rpe',
        // reps 3 so the reps cell can't collide with any RPE label.
        set: { rpe: rpe as number, reps: 3 },
      });
      const label = Number.isInteger(rpe) ? String(rpe) : (rpe as number).toFixed(1);
      expect(textColor(getByText(label))).toBe(expectedColor);
    });

    it('formats volume per weight unit', () => {
      const kg = renderRow({ state: 'upcoming', metricColumn: 'volume', weightUnit: 'kg' });
      expect(kg.getByText('600')).toBeTruthy();

      const lbs = renderRow({ state: 'upcoming', metricColumn: 'volume', weightUnit: 'lbs' });
      expect(lbs.getByText('1,323')).toBeTruthy();
    });

    it('formats estimated 1RM and 10RM', () => {
      // 90 kg × 6 reps: Epley 1RM = 108, estimated 10RM = 81 — values that
      // can't collide with the weight/reps cells.
      const set = { weight: 90, reps: 6 };
      const e1rm = renderRow({ state: 'upcoming', metricColumn: 'e1rm', set });
      expect(e1rm.getByText('108')).toBeTruthy();

      const tenrm = renderRow({ state: 'upcoming', metricColumn: 'tenrm', set });
      expect(tenrm.getByText('81')).toBeTruthy();
    });

    it('shows an en-dash when a metric cannot be computed', () => {
      // weight 0 keeps the weight/reps cells populated ("0" / "10") so the only
      // en-dash on the row is the uncomputable volume metric.
      const { getByText } = renderRow({
        state: 'upcoming',
        metricColumn: 'volume',
        set: { weight: 0, reps: 10 },
      });
      expect(getByText('–')).toBeTruthy();
    });
  });

  describe('previous column', () => {
    const prev = (o?: Partial<ExerciseRecentSessionSet>): ExerciseRecentSessionSet => ({
      setNumber: 1,
      setType: null,
      weight: 100,
      reps: 5,
      ...o,
    });

    it('renders weight × reps in the display unit', () => {
      const kg = renderRow({ state: 'upcoming', previousSet: prev() });
      expect(kg.getByText('100 × 5')).toBeTruthy();

      const lbs = renderRow({ state: 'upcoming', previousSet: prev(), weightUnit: 'lbs' });
      expect(lbs.getByText('220.5 × 5')).toBeTruthy();
    });

    it('prefixes warmup sets and handles one-sided values', () => {
      const warm = renderRow({
        state: 'upcoming',
        previousSet: prev({ setType: 'warmup', weight: 50, reps: 8 }),
      });
      expect(warm.getByText('W 50 × 8')).toBeTruthy();

      const weightOnly = renderRow({ state: 'upcoming', previousSet: prev({ reps: null }) });
      expect(weightOnly.getByText('100')).toBeTruthy();

      const repsOnly = renderRow({
        state: 'upcoming',
        previousSet: prev({ weight: null, reps: 8 }),
      });
      expect(repsOnly.getByText('8 reps')).toBeTruthy();
    });

    it('renders an em-dash when this row has no previous counterpart', () => {
      const { getByText } = renderRow({ state: 'upcoming', previousSet: null });
      expect(getByText('—')).toBeTruthy();
    });

    it('omits the column when the prop is not passed', () => {
      const { queryByText } = renderRow({ state: 'upcoming' });
      expect(queryByText('—')).toBeNull();
    });

    describe('tap-to-fill', () => {
      it('replaces already-entered values with the previous ones', () => {
        const { getByLabelText, callbacks } = renderRow({
          state: 'upcoming',
          set: { weight: 60, reps: 10 },
          previousSet: prev(),
        });

        fireEvent.press(getByLabelText('Fill set 1 from previous'));

        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
          weight: 100,
          reps: 5,
        });
      });

      it('fills an empty set in kg regardless of display unit', () => {
        const { getByLabelText, callbacks } = renderRow({
          state: 'upcoming',
          weightUnit: 'lbs',
          set: { weight: null, reps: null },
          previousSet: prev(),
        });

        fireEvent.press(getByLabelText('Fill set 1 from previous'));

        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
          weight: 100,
          reps: 5,
        });
      });

      it('leaves a field alone when the previous set lacks it', () => {
        const { getByLabelText, callbacks } = renderRow({
          state: 'upcoming',
          set: { weight: 60, reps: 10 },
          previousSet: prev({ reps: null }),
        });

        fireEvent.press(getByLabelText('Fill set 1 from previous'));

        // Weight replaced; reps untouched rather than cleared to null.
        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 100 });
      });

      it('replaces in edit mode through the same kg commit path', () => {
        const { getByLabelText, callbacks } = renderRow({
          mode: 'edit',
          state: 'upcoming',
          set: { weight: 70, reps: 3, editWeightText: '70', editRepsText: '3' },
          previousSet: prev(),
        });

        fireEvent.press(getByLabelText('Fill set 1 from previous'));

        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
          weight: 100,
          reps: 5,
        });
      });

      it('offers no fill target on a dash row', () => {
        const { queryByLabelText } = renderRow({
          state: 'upcoming',
          previousSet: null,
        });
        expect(queryByLabelText('Fill set 1 from previous')).toBeNull();
      });
    });
  });

  describe('draft re-seed signature (survives an id churn)', () => {
    it('keeps an in-progress draft when only the set id churns', () => {
      const { getByLabelText, rerenderRow } = renderRow({
        state: 'current',
        isFocused: true,
        set: { id: -1, weight: 60 },
      });
      const input = getByLabelText('Weight');
      expect(input.props.value).toBe('60'); // seeded from stored weight
      // Uncommitted edit (no blur) — the local draft holds "105".
      fireEvent.changeText(input, '105');
      expect(input.props.value).toBe('105');

      // An autosave churns the id (-1 → 777) while the values are unchanged and
      // the instance survives (stable render key). The signature dropped set.id,
      // so the draft must NOT re-seed and wipe the typed text.
      rerenderRow({ state: 'current', isFocused: true, set: { id: 777, weight: 60 } });
      expect(getByLabelText('Weight').props.value).toBe('105');
    });

    it('re-seeds an unfocused row when the set VALUES change (external edit)', () => {
      const base = { state: 'current' as const };
      const { getByLabelText, rerenderRow } = renderRow({
        ...base,
        isFocused: false,
        set: { id: 101, weight: 60 },
      });
      // The value changes while the row shows display cells; the next focus
      // must seed the input from the fresh store value, not a stale draft.
      rerenderRow({ ...base, isFocused: false, set: { id: 101, weight: 80 } });
      rerenderRow({ ...base, isFocused: true, set: { id: 101, weight: 80 } });
      expect(getByLabelText('Weight').props.value).toBe('80');
    });

    it('does not rewrite drafts under a focused row when a store value changes', () => {
      // THE mid-edit clobber: fill-from-previous, edit lbs (blur commits a kg
      // the server rounds), then type reps — the autosave echo adopts the
      // rounded weight while reps is still an uncommitted draft. The re-seed
      // must not snap the typed reps back to the previous value.
      const base = { state: 'current' as const, weightUnit: 'lbs' as const };
      const { getByLabelText, callbacks, rerenderRow } = renderRow({
        ...base,
        isFocused: true,
        set: { id: 101, weight: 45.36, reps: 10 }, // filled from previous
      });
      const weight = getByLabelText('Weight');
      fireEvent.changeText(weight, '135');
      fireEvent(weight, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 61.23 });

      fireEvent.changeText(getByLabelText('Reps'), '12');

      // Autosave echo lands mid-typing: the committed weight flows back (any
      // server normalization would change the signature the same way).
      rerenderRow({ ...base, isFocused: true, set: { id: 101, weight: 61.23, reps: 10 } });
      expect(getByLabelText('Reps').props.value).toBe('12');
      expect(getByLabelText('Weight').props.value).toBe('135');

      // Deactivating flushes the surviving draft to the store.
      rerenderRow({ ...base, isFocused: false, set: { id: 101, weight: 61.23, reps: 10 } });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 12 });
      const weightCommits = callbacks.onCommitField.mock.calls.filter(
        ([, patch]) => 'weight' in patch,
      );
      expect(weightCommits).toHaveLength(1);
    });

    it('fill-from-previous updates the visible inputs on a focused row', () => {
      // The focused row skips the store-driven re-seed, so the fill handler
      // mirrors the values into the drafts itself.
      const { getByLabelText, callbacks } = renderRow({
        state: 'current',
        isFocused: true,
        set: { id: 101, weight: 60, reps: 10 },
        previousSet: { setNumber: 1, setType: null, weight: 100, reps: 5 },
      });
      fireEvent.changeText(getByLabelText('Reps'), '12'); // typed, then overridden by fill
      fireEvent.press(getByLabelText('Fill set 1 from previous'));
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 100, reps: 5 });
      expect(getByLabelText('Weight').props.value).toBe('100');
      expect(getByLabelText('Reps').props.value).toBe('5');
    });
  });
});
