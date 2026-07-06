import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntrySetResponse } from '@workspace/shared';
import ActiveWorkoutSetRow, {
  parseRpeInput,
  type SetRowState,
} from '../../src/components/ActiveWorkoutSetRow';
import type { ActiveWorkoutMetricColumn } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

// Stub the shared stepper so weight/reps commits are drivable through plain
// testIDs (keyboardType distinguishes weight `decimal-pad` from reps
// `number-pad`).
jest.mock('../../src/components/StepperInput', () => {
  const React = require('react');
  const { Pressable, TextInput, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChangeText, onBlur, onIncrement, onDecrement, keyboardType }: any) => (
      <View>
        <Pressable testID={`stepper-decrement-${keyboardType}`} onPress={onDecrement} />
        <TextInput
          testID={`stepper-input-${keyboardType}`}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
        />
        <Pressable testID={`stepper-increment-${keyboardType}`} onPress={onIncrement} />
      </View>
    ),
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
    ...overrides,
  };
}

interface RenderOverrides {
  set?: Partial<ExerciseEntrySetResponse>;
  state?: SetRowState;
  metricColumn?: ActiveWorkoutMetricColumn;
  weightUnit?: 'kg' | 'lbs';
  displayNumber?: number;
}

function renderRow(overrides?: RenderOverrides) {
  const callbacks = {
    onCompleteActive: jest.fn(),
    onUncomplete: jest.fn(),
    onRecomplete: jest.fn(),
    onCommitField: jest.fn(),
    onDelete: jest.fn(),
    onLongPress: jest.fn(),
  };
  const utils = render(
    <ActiveWorkoutSetRow
      set={makeSet(overrides?.set)}
      displayNumber={overrides?.displayNumber ?? 1}
      state={overrides?.state ?? 'current'}
      metricColumn={overrides?.metricColumn ?? 'rpe'}
      weightUnit={overrides?.weightUnit ?? 'kg'}
      {...callbacks}
    />,
  );
  return { ...utils, callbacks };
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
    it('dims the row to 0.62 opacity', () => {
      const { getByTestId } = renderRow({ state: 'done' });
      expect(StyleSheet.flatten(getByTestId('set-row').props.style).opacity).toBe(0.62);
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

  describe('current state', () => {
    it('commits weight in kg on blur', () => {
      const { getByTestId, callbacks } = renderRow({ state: 'current', weightUnit: 'kg' });
      const input = getByTestId('stepper-input-decimal-pad');
      expect(input.props.value).toBe('60');
      fireEvent.changeText(input, '105');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 105 });
    });

    it('converts a typed lbs weight to kg on commit', () => {
      const { getByTestId, callbacks } = renderRow({ state: 'current', weightUnit: 'lbs' });
      const input = getByTestId('stepper-input-decimal-pad');
      expect(input.props.value).toBe('132.3');
      fireEvent.changeText(input, '135');
      fireEvent(input, 'blur');
      const patch = callbacks.onCommitField.mock.calls[0][1];
      expect(patch.weight).toBeCloseTo(61.235, 3);
    });

    it('commits a cleared weight as null', () => {
      const { getByTestId, callbacks } = renderRow({ state: 'current' });
      const input = getByTestId('stepper-input-decimal-pad');
      fireEvent.changeText(input, '');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: null });
    });

    it('steps weight by 5 and commits immediately', () => {
      const { getByTestId, callbacks } = renderRow({ state: 'current' });
      fireEvent.press(getByTestId('stepper-increment-decimal-pad'));
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 65 });
      fireEvent.press(getByTestId('stepper-decrement-decimal-pad'));
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 60 });
    });

    it('commits reps on blur and steps by 1', () => {
      const { getByTestId, callbacks } = renderRow({ state: 'current' });
      const input = getByTestId('stepper-input-number-pad');
      expect(input.props.value).toBe('10');
      fireEvent.changeText(input, '12');
      fireEvent(input, 'blur');
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 12 });

      fireEvent.press(getByTestId('stepper-increment-number-pad'));
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 13 });
    });

    it('logging commits all drafts, then completes the set', () => {
      const { getByTestId, getByLabelText, callbacks } = renderRow({
        state: 'current',
        metricColumn: 'rpe',
      });
      fireEvent.changeText(getByTestId('stepper-input-decimal-pad'), '80');
      fireEvent.changeText(getByTestId('stepper-input-number-pad'), '8');
      fireEvent.changeText(getByLabelText('RPE'), '8.2');

      fireEvent.press(getByLabelText('Log set'));

      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { weight: 80 });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 8 });
      expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { rpe: 8 });
      expect(callbacks.onCompleteActive).toHaveBeenCalledTimes(1);
      // Draft commits must land before completion so the completed set holds
      // exactly what the user saw.
      const completeOrder = callbacks.onCompleteActive.mock.invocationCallOrder[0];
      for (const order of callbacks.onCommitField.mock.invocationCallOrder) {
        expect(order).toBeLessThan(completeOrder);
      }
    });

    it('hides the RPE input for non-RPE metric columns', () => {
      const { queryByLabelText, getByText } = renderRow({
        state: 'current',
        metricColumn: 'volume',
      });
      expect(queryByLabelText('RPE')).toBeNull();
      expect(getByText('600')).toBeTruthy();
    });

    it('does not wrap the current row in a swipeable', () => {
      const { queryByTestId } = renderRow({ state: 'current' });
      expect(queryByTestId('reanimated-swipeable')).toBeNull();
    });
  });

  describe('upcoming state', () => {
    it('re-completes from the hollow circle', () => {
      const { getByLabelText, callbacks } = renderRow({ state: 'upcoming' });
      fireEvent.press(getByLabelText('Mark set 1 complete'));
      expect(callbacks.onRecomplete).toHaveBeenCalledWith('101');
    });

    it('is not dimmed', () => {
      const { getByTestId } = renderRow({ state: 'upcoming' });
      expect(StyleSheet.flatten(getByTestId('set-row').props.style)?.opacity).toBeUndefined();
    });
  });

  it('fires onLongPress with the set id', () => {
    const { getByTestId, callbacks } = renderRow({ state: 'upcoming' });
    fireEvent(getByTestId('set-row'), 'longPress');
    expect(callbacks.onLongPress).toHaveBeenCalledWith('101');
  });

  it('shows the W pill instead of the set number for warmups', () => {
    const { getByText, queryByText } = renderRow({
      state: 'upcoming',
      set: { set_type: 'warmup', reps: 15, weight: 20 },
      displayNumber: 3,
    });
    expect(getByText('W')).toBeTruthy();
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
      const { getByText } = renderRow({
        state: 'upcoming',
        metricColumn: 'volume',
        set: { reps: null },
      });
      expect(getByText('–')).toBeTruthy();
    });
  });
});
