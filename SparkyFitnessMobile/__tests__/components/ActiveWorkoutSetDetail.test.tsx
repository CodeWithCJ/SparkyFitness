import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ActiveWorkoutSetDetail from '../../src/components/ActiveWorkoutSetDetail';
import WorkoutNotesField from '../../src/components/WorkoutNotesField';
import type { WorkoutCardSet } from '../../src/utils/workoutSession';

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
    rest_time: 60,
    notes: null,
    duration: null,
    ...overrides,
  };
}

describe('ActiveWorkoutSetDetail', () => {
  it('commits the trimmed per-set note on blur', () => {
    const onCommitField = jest.fn();
    const { getByLabelText } = render(
      <ActiveWorkoutSetDetail set={makeSet()} onCommitField={onCommitField} />,
    );
    const input = getByLabelText('Notes for set 1');
    fireEvent.changeText(input, '  felt strong  ');
    fireEvent(input, 'blur');
    expect(onCommitField).toHaveBeenCalledWith('101', { notes: 'felt strong' });
  });

  it('clears the note to null when blurred empty', () => {
    const onCommitField = jest.fn();
    const { getByLabelText } = render(
      <ActiveWorkoutSetDetail set={makeSet({ notes: 'old' })} onCommitField={onCommitField} />,
    );
    const input = getByLabelText('Notes for set 1');
    fireEvent.changeText(input, '   ');
    fireEvent(input, 'blur');
    expect(onCommitField).toHaveBeenCalledWith('101', { notes: null });
  });

  it('flushes an uncommitted note when the panel unmounts without a blur', () => {
    // Logging a set or toggling the panel shut tears the field down while it's
    // still focused (keyboardShouldPersistTaps keeps the keyboard up), so the
    // native blur never reaches JS — the draft must still reach the store.
    const onCommitField = jest.fn();
    const { getByLabelText, unmount } = render(
      <ActiveWorkoutSetDetail set={makeSet()} onCommitField={onCommitField} />,
    );
    fireEvent.changeText(getByLabelText('Notes for set 1'), 'last set to failure');
    unmount();
    expect(onCommitField).toHaveBeenCalledWith('101', { notes: 'last set to failure' });
  });

  it('does not re-commit an unchanged note on unmount', () => {
    const onCommitField = jest.fn();
    const { unmount } = render(
      <ActiveWorkoutSetDetail set={makeSet({ notes: 'existing' })} onCommitField={onCommitField} />,
    );
    unmount();
    expect(onCommitField).not.toHaveBeenCalled();
  });
});

describe('WorkoutNotesField re-seed', () => {
  it('re-seeds the draft when the incoming value prop changes', () => {
    const { getByLabelText, rerender } = render(
      <WorkoutNotesField
        value="first"
        onCommit={jest.fn()}
        accessibilityLabel="note"
      />,
    );
    const input = getByLabelText('note');
    expect(input.props.value).toBe('first');

    // A reconcile / target switch rewrites the value under the mounted field —
    // the draft must follow rather than stay pinned to the initial value.
    rerender(
      <WorkoutNotesField
        value="second"
        onCommit={jest.fn()}
        accessibilityLabel="note"
      />,
    );
    expect(getByLabelText('note').props.value).toBe('second');
  });

  it('keeps an in-progress draft while the value prop is unchanged', () => {
    const { getByLabelText, rerender } = render(
      <WorkoutNotesField value="" onCommit={jest.fn()} accessibilityLabel="note" />,
    );
    const input = getByLabelText('note');
    fireEvent.changeText(input, 'typing…');
    // A re-render with the same value must not clobber the local draft.
    rerender(<WorkoutNotesField value="" onCommit={jest.fn()} accessibilityLabel="note" />);
    expect(getByLabelText('note').props.value).toBe('typing…');
  });
});

describe('WorkoutNotesField unmount flush', () => {
  it('commits an uncommitted draft when the field unmounts', () => {
    const onCommit = jest.fn();
    const { getByLabelText, unmount } = render(
      <WorkoutNotesField value="" onCommit={onCommit} accessibilityLabel="note" />,
    );
    fireEvent.changeText(getByLabelText('note'), 'felt strong');
    // No blur — the field is torn down first.
    unmount();
    expect(onCommit).toHaveBeenCalledWith('felt strong');
  });

  it('does not commit on unmount when the draft matches the committed value', () => {
    const onCommit = jest.fn();
    const { unmount } = render(
      <WorkoutNotesField value="already saved" onCommit={onCommit} accessibilityLabel="note" />,
    );
    unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not double-commit when a blur already landed before unmount', () => {
    // After a blur commits, the parent rewrites `value`; the field re-seeds so
    // the draft matches, and the unmount flush is a no-op.
    const onCommit = jest.fn();
    const { getByLabelText, rerender, unmount } = render(
      <WorkoutNotesField value="" onCommit={onCommit} accessibilityLabel="note" />,
    );
    const input = getByLabelText('note');
    fireEvent.changeText(input, 'done');
    fireEvent(input, 'blur');
    expect(onCommit).toHaveBeenCalledTimes(1);
    // The committed value flows back in as the new prop.
    rerender(<WorkoutNotesField value="done" onCommit={onCommit} accessibilityLabel="note" />);
    unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
