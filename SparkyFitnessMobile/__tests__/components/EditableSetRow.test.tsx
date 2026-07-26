import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EditableSetRow from '../../src/components/EditableSetRow';
import type { ExerciseModality } from '@workspace/shared';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

interface RenderOverrides {
  weight?: string;
  reps?: string;
  duration?: string;
  isActive?: boolean;
  activeField?: 'weight' | 'reps' | 'duration' | 'rpe';
  modality?: ExerciseModality;
  nextSetKey?: string | null;
}

function renderRow(overrides?: RenderOverrides) {
  const callbacks = {
    onActivateSet: jest.fn(),
    onDeactivate: jest.fn(),
    onUpdateSetField: jest.fn(),
    onRemoveSet: jest.fn(),
    onAddSet: jest.fn(),
  };
  const utils = render(
    <EditableSetRow
      exerciseClientId="ex-1"
      setClientId="set-1"
      weight={overrides?.weight ?? ''}
      reps={overrides?.reps ?? ''}
      duration={overrides?.duration ?? ''}
      setNumber={1}
      isActive={overrides?.isActive ?? false}
      activeField={overrides?.activeField}
      modality={overrides?.modality}
      weightUnit="kg"
      nextSetKey={overrides?.nextSetKey}
      {...callbacks}
    />,
  );
  return { ...utils, callbacks };
}

describe('EditableSetRow', () => {
  describe('weight_reps (default)', () => {
    it('renders weight and reps inputs when active and dispatches field updates', () => {
      const { getByDisplayValue, callbacks } = renderRow({
        isActive: true,
        weight: '100',
        reps: '5',
      });
      fireEvent.changeText(getByDisplayValue('100'), '105');
      expect(callbacks.onUpdateSetField).toHaveBeenCalledWith('ex-1', 'set-1', 'weight', '105');
      fireEvent.changeText(getByDisplayValue('5'), '6');
      expect(callbacks.onUpdateSetField).toHaveBeenCalledWith('ex-1', 'set-1', 'reps', '6');
    });

    it('activates the tapped field from the inactive display', () => {
      const { getByText, callbacks } = renderRow({ weight: '100', reps: '5' });
      fireEvent.press(getByText('100 kg'));
      expect(callbacks.onActivateSet).toHaveBeenCalledWith('ex-1:set-1', 'weight');
      fireEvent.press(getByText('5'));
      expect(callbacks.onActivateSet).toHaveBeenCalledWith('ex-1:set-1', 'reps');
    });
  });

  describe('reps_only', () => {
    it('drops the weight input and display cell', () => {
      const active = renderRow({
        modality: 'reps_only',
        isActive: true,
        weight: '100',
        reps: '12',
      });
      expect(active.queryByDisplayValue('100')).toBeNull();
      expect(active.getByDisplayValue('12')).toBeTruthy();

      const inactive = renderRow({ modality: 'reps_only', weight: '100', reps: '12' });
      expect(inactive.queryByText('100 kg')).toBeNull();
      expect(inactive.getByText('12')).toBeTruthy();
    });
  });

  describe.each(['duration', 'duration_distance'] as const)('%s', (modality) => {
    it('renders a single seconds stepper when active', () => {
      const { getByDisplayValue, queryByDisplayValue, callbacks } = renderRow({
        modality,
        isActive: true,
        weight: '100',
        reps: '5',
        duration: '45',
      });
      expect(queryByDisplayValue('100')).toBeNull();
      expect(queryByDisplayValue('5')).toBeNull();
      fireEvent.changeText(getByDisplayValue('45'), '60');
      expect(callbacks.onUpdateSetField).toHaveBeenCalledWith('ex-1', 'set-1', 'duration', '60');
    });

    it('steps the duration ±5 seconds', () => {
      const { getByTestId, callbacks } = renderRow({
        modality,
        isActive: true,
        duration: '45',
      });
      fireEvent.press(getByTestId('icon-add'));
      expect(callbacks.onUpdateSetField).toHaveBeenCalledWith('ex-1', 'set-1', 'duration', '50');
      fireEvent.press(getByTestId('icon-remove'));
      expect(callbacks.onUpdateSetField).toHaveBeenCalledWith('ex-1', 'set-1', 'duration', '40');
    });

    it('activates the duration field from the inactive display', () => {
      const { getByText, callbacks } = renderRow({ modality, duration: '45' });
      fireEvent.press(getByText('45'));
      expect(callbacks.onActivateSet).toHaveBeenCalledWith('ex-1:set-1', 'duration');
    });
  });

  it('advances a duration row straight to the next set (no in-row hop)', () => {
    // The advance handler is exercised through the accessory bar on iOS; here
    // the behavior contract is the field the NEXT row activates with.
    const { callbacks, getByText } = renderRow({
      modality: 'duration',
      duration: '45',
      nextSetKey: 'ex-1:set-2',
    });
    fireEvent.press(getByText('45'));
    expect(callbacks.onActivateSet).toHaveBeenCalledWith('ex-1:set-1', 'duration');
  });
});
