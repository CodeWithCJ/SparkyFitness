import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CardioEffortForm from '../../src/components/CardioEffortForm';
import type { WorkoutCardSet } from '../../src/utils/workoutSession';

jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn(() => '#000'),
}));

const makeSet = (overrides?: Partial<WorkoutCardSet>): WorkoutCardSet => ({
  id: 101,
  set_number: 1,
  set_type: 'normal',
  weight: null,
  reps: null,
  duration: 1800,
  distance: 5.2,
  rest_time: 0,
  ...overrides,
});

describe('CardioEffortForm', () => {
  it('seeds minutes from the set duration and km from the set distance', () => {
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
      />,
    );
    expect(getByLabelText('Duration in minutes for Run').props.value).toBe('30');
    expect(getByLabelText('Distance in km for Run').props.value).toBe('5.2');
  });

  it('renders assumed duration/distance as placeholders while the fields are empty', () => {
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        assumed={{ weight: null, reps: null, duration: 1500, distance: 5 }}
      />,
    );
    expect(getByLabelText('Duration in minutes for Run').props.placeholder).toBe('25');
    expect(getByLabelText('Distance in km for Run').props.placeholder).toBe('5');
    expect(getByLabelText('Duration in minutes for Run').props.value).toBe('');
  });

  it('shows no assumed placeholder over a filled field or outside live mode', () => {
    const filled = render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        assumed={{ weight: null, reps: null, duration: 1500, distance: 5 }}
      />,
    );
    expect(
      filled.getByLabelText('Duration in minutes for Run').props.placeholder,
    ).toBe('–');

    const editMode = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="edit"
        distanceUnit="km"
        assumed={{ weight: null, reps: null, duration: 1500, distance: 5 }}
      />,
    );
    expect(
      editMode.getByLabelText('Duration in minutes for Run').props.placeholder,
    ).toBe('–');
  });

  it('converts the assumed distance placeholder into the display unit', () => {
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="live"
        distanceUnit="miles"
        assumed={{ weight: null, reps: null, duration: null, distance: 1.609344 }}
      />,
    );
    expect(getByLabelText('Distance in mi for Run').props.placeholder).toBe('1');
  });

  it('converts the seeded distance into miles for a miles user', () => {
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ distance: 1.609344 })}
        exerciseName="Run"
        mode="live"
        distanceUnit="miles"
      />,
    );
    expect(getByLabelText('Distance in mi for Run').props.value).toBe('1');
  });

  it('commits rounded seconds and quantized km on blur in live mode', () => {
    const onCommitField = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        onCommitField={onCommitField}
      />,
    );

    const duration = getByLabelText('Duration in minutes for Run');
    fireEvent.changeText(duration, '30.5');
    expect(onCommitField).not.toHaveBeenCalled();
    fireEvent(duration, 'blur');
    expect(onCommitField).toHaveBeenCalledWith('101', { duration: 1830 });

    const distance = getByLabelText('Distance in km for Run');
    fireEvent.changeText(distance, '5.2');
    fireEvent(distance, 'blur');
    expect(onCommitField).toHaveBeenCalledWith('101', { distance: 5.2 });
  });

  it('converts a miles entry to km on commit', () => {
    const onCommitField = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ distance: null })}
        exerciseName="Run"
        mode="live"
        distanceUnit="miles"
        onCommitField={onCommitField}
      />,
    );
    const distance = getByLabelText('Distance in mi for Run');
    fireEvent.changeText(distance, '1');
    fireEvent(distance, 'blur');
    expect(onCommitField).toHaveBeenCalledWith('101', { distance: 1.609 });
  });

  it('clears with null when a field is emptied', () => {
    const onCommitField = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        onCommitField={onCommitField}
      />,
    );
    const distance = getByLabelText('Distance in km for Run');
    fireEvent.changeText(distance, '');
    fireEvent(distance, 'blur');
    expect(onCommitField).toHaveBeenCalledWith('101', { distance: null });
  });

  it('commits every keystroke in edit mode so a header Save reads current state', () => {
    const onCommitField = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="edit"
        distanceUnit="km"
        onCommitField={onCommitField}
      />,
    );
    fireEvent.changeText(getByLabelText('Duration in minutes for Run'), '25');
    expect(onCommitField).toHaveBeenCalledWith('101', { duration: 1500 });
  });

  it('offers the completion affordance in live mode and commits drafts first', () => {
    const onCommitField = jest.fn();
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        onCommitField={onCommitField}
        onComplete={onComplete}
        onUncomplete={jest.fn()}
      />,
    );
    fireEvent.changeText(getByLabelText('Duration in minutes for Run'), '30');
    fireEvent.press(getByLabelText('Complete Run'));
    expect(onCommitField).toHaveBeenCalledWith('101', { duration: 1800 });
    expect(onComplete).toHaveBeenCalledWith('101');
  });

  it('uncompletes a completed effort', () => {
    const onUncomplete = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        state="done"
        onCommitField={jest.fn()}
        onComplete={jest.fn()}
        onUncomplete={onUncomplete}
      />,
    );
    fireEvent.press(getByLabelText('Mark Run incomplete'));
    expect(onUncomplete).toHaveBeenCalledWith('101');
  });

  it('reports focused fields in live mode so the screen bar can target them', () => {
    const onActivateSet = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        onCommitField={jest.fn()}
        onActivateSet={onActivateSet}
      />,
    );
    fireEvent(getByLabelText('Duration in minutes for Run'), 'focus');
    expect(onActivateSet).toHaveBeenCalledWith('101', 'duration');
    fireEvent(getByLabelText('Distance in km for Run'), 'focus');
    expect(onActivateSet).toHaveBeenCalledWith('101', 'distance');
  });

  it('does not report focus outside live mode', () => {
    const onActivateSet = jest.fn();
    const { getByLabelText } = render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="edit"
        distanceUnit="km"
        onCommitField={jest.fn()}
        onActivateSet={onActivateSet}
      />,
    );
    fireEvent(getByLabelText('Duration in minutes for Run'), 'focus');
    expect(onActivateSet).not.toHaveBeenCalled();
  });

  it('registers a live accessory handle whose log adopts drafts then completes', () => {
    const handles: Record<string, { log: () => void }> = {};
    const onRegisterAccessoryHandle = (key: string, handle: { log: () => void } | null) => {
      if (handle == null) delete handles[key];
      else handles[key] = handle;
    };
    const onCommitField = jest.fn();
    const onComplete = jest.fn();
    const { getByLabelText, unmount } = render(
      <CardioEffortForm
        set={makeSet({ duration: null, distance: null })}
        exerciseName="Run"
        mode="live"
        distanceUnit="km"
        renderKey="rk-101"
        onCommitField={onCommitField}
        onComplete={onComplete}
        onRegisterAccessoryHandle={onRegisterAccessoryHandle}
      />,
    );

    expect(handles['rk-101']).toBeDefined();
    fireEvent.changeText(getByLabelText('Duration in minutes for Run'), '30');
    handles['rk-101'].log();
    expect(onCommitField).toHaveBeenCalledWith('101', { duration: 1800 });
    expect(onComplete).toHaveBeenCalledWith('101');

    unmount();
    expect(handles['rk-101']).toBeUndefined();
  });

  it('registers no accessory handle outside live mode', () => {
    const onRegisterAccessoryHandle = jest.fn();
    render(
      <CardioEffortForm
        set={makeSet()}
        exerciseName="Run"
        mode="edit"
        distanceUnit="km"
        onCommitField={jest.fn()}
        onRegisterAccessoryHandle={onRegisterAccessoryHandle}
      />,
    );
    expect(onRegisterAccessoryHandle).not.toHaveBeenCalled();
  });

  it('matches the set rows: done check, pulsing cursor ring, muted upcoming ring', () => {
    const renderWithState = (state: 'done' | 'current' | 'upcoming') =>
      render(
        <CardioEffortForm
          set={makeSet()}
          exerciseName="Run"
          mode="live"
          distanceUnit="km"
          state={state}
          onCommitField={jest.fn()}
          onComplete={jest.fn()}
          onUncomplete={jest.fn()}
        />,
      );

    const done = renderWithState('done');
    expect(done.getByTestId('cardio-complete-badge')).toBeTruthy();
    expect(done.queryByTestId('cardio-log-ring')).toBeNull();

    const current = renderWithState('current');
    expect(current.getByTestId('cardio-log-ring')).toBeTruthy();
    expect(current.queryByTestId('cardio-complete-badge')).toBeNull();

    const upcoming = renderWithState('upcoming');
    expect(upcoming.getByTestId('cardio-upcoming-ring')).toBeTruthy();
    expect(upcoming.queryByTestId('cardio-log-ring')).toBeNull();
  });

  it('renders a labeled duration/distance table in view mode', () => {
    const { getByText, queryByLabelText } = render(
      <CardioEffortForm set={makeSet()} exerciseName="Run" mode="view" distanceUnit="km" />,
    );
    expect(getByText('Duration (min)')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
    expect(getByText('Distance (km)')).toBeTruthy();
    expect(getByText('5.2')).toBeTruthy();
    expect(queryByLabelText('Duration in minutes for Run')).toBeNull();
  });

  it('view mode converts the distance column into the display unit', () => {
    const { getByText } = render(
      <CardioEffortForm
        set={makeSet({ distance: 1.609344 })}
        exerciseName="Run"
        mode="view"
        distanceUnit="miles"
      />,
    );
    expect(getByText('Distance (mi)')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
  });

  it('view mode shows dashes for a legacy set-less entry', () => {
    const { getByText, getAllByText } = render(
      <CardioEffortForm set={null} exerciseName="Run" mode="view" distanceUnit="km" />,
    );
    expect(getByText('Duration (min)')).toBeTruthy();
    expect(getByText('Distance (km)')).toBeTruthy();
    expect(getAllByText('–')).toHaveLength(2);
  });
});
