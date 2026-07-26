import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import EditableSetList from '../../src/components/EditableSetList';
import type { WorkoutDraftSet } from '../../src/types/drafts';
import type { ExerciseModality } from '@workspace/shared';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

const SETS: WorkoutDraftSet[] = [
  { clientId: 's1', weight: '100', reps: '5', duration: 45 },
  { clientId: 's2', weight: '', reps: '', duration: null },
];

function renderList(props?: {
  modality?: ExerciseModality;
  sets?: WorkoutDraftSet[];
}) {
  const callbacks = {
    onActivateSet: jest.fn(),
    onDeactivateSet: jest.fn(),
    onUpdateSetField: jest.fn(),
    onRemoveSet: jest.fn(),
    onAddSet: jest.fn(),
  };
  const utils = render(
    <EditableSetList
      exerciseClientId="ex-1"
      sets={props?.sets ?? SETS}
      activeSetKey={null}
      activeSetField="weight"
      modality={props?.modality}
      weightUnit="kg"
      {...callbacks}
    />,
  );
  return { ...utils, callbacks };
}

describe('EditableSetList', () => {
  it('renders Set/Weight/Reps headers and a row per set by default', () => {
    const { getByText, getAllByText } = renderList();
    expect(getByText('Set')).toBeTruthy();
    expect(getByText('Weight')).toBeTruthy();
    expect(getByText('Reps')).toBeTruthy();
    expect(getByText('100 kg')).toBeTruthy();
    // Row numbers 1 and 2.
    expect(getAllByText(/^[12]$/).length).toBeGreaterThanOrEqual(2);
  });

  it('renders Set/Reps headers for reps_only', () => {
    const { getByText, queryByText } = renderList({ modality: 'reps_only' });
    expect(getByText('Reps')).toBeTruthy();
    expect(queryByText('Weight')).toBeNull();
  });

  it.each(['duration', 'duration_distance'] as const)(
    'renders a Set/Sec header pair for %s',
    (modality) => {
      const { getByText, queryByText } = renderList({ modality });
      expect(getByText('Sec')).toBeTruthy();
      expect(queryByText('Weight')).toBeNull();
      expect(queryByText('Reps')).toBeNull();
      // The row shows the draft's stored seconds.
      expect(getByText('45')).toBeTruthy();
    },
  );

  it('adds a set through the Add Set action', () => {
    const { getByText, callbacks } = renderList();
    fireEvent.press(getByText('Add Set'));
    expect(callbacks.onAddSet).toHaveBeenCalledWith('ex-1');
  });

  it('routes duration activation with the composite set key', () => {
    const { getByText, callbacks } = renderList({ modality: 'duration' });
    fireEvent.press(getByText('45'));
    expect(callbacks.onActivateSet).toHaveBeenCalledWith('ex-1:s1', 'duration');
  });
});
