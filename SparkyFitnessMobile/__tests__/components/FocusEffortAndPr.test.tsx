import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import FocusEffortSheet from '../../src/components/FocusEffortSheet';
import FocusPrCard, { PR_CARD_MS } from '../../src/components/FocusPrCard';

describe('FocusEffortSheet', () => {
  const setup = (metric: 'rpe' | 'rir' = 'rpe', initialValue = 8) => {
    const onSave = jest.fn();
    const onSkip = jest.fn();
    const utils = render(
      <FocusEffortSheet
        visible
        title="Bench Press · Set 2"
        metric={metric}
        initialValue={initialValue}
        onSave={onSave}
        onSkip={onSkip}
      />
    );
    return { ...utils, onSave, onSkip };
  };

  it('starts at the given RPE with the reps left and saves the value', () => {
    const { getByText, getByTestId, onSave } = setup();
    expect(getByText('Bench Press · Set 2')).toBeTruthy();
    expect(getByText('2 reps left')).toBeTruthy();
    fireEvent.press(getByTestId('focus-effort-plus'));
    expect(getByText('1 rep left')).toBeTruthy();
    fireEvent.press(getByTestId('focus-effort-plus'));
    fireEvent.press(getByTestId('focus-effort-plus'));
    expect(getByText('Max effort')).toBeTruthy();
    expect(getByTestId('focus-effort-value').props.children).toBe(10);
    fireEvent.press(getByTestId('focus-effort-save'));
    expect(onSave).toHaveBeenCalledWith(10);
  });

  it('stays inside 1 to 10 and can be skipped', () => {
    const { getByTestId, onSkip, onSave } = setup('rpe', 1);
    fireEvent.press(getByTestId('focus-effort-minus'));
    expect(getByTestId('focus-effort-value').props.children).toBe(1);
    fireEvent.press(getByTestId('focus-effort-skip'));
    expect(onSkip).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses the 0 to 5 reps in reserve scale for RIR', () => {
    const { getByText, getByTestId, onSave } = setup('rir', 2);
    expect(getByText('Reps in reserve, 0 to 5')).toBeTruthy();
    fireEvent.press(getByTestId('focus-effort-minus'));
    fireEvent.press(getByTestId('focus-effort-minus'));
    fireEvent.press(getByTestId('focus-effort-minus'));
    expect(getByText('Nothing left')).toBeTruthy();
    fireEvent.press(getByTestId('focus-effort-save'));
    expect(onSave).toHaveBeenCalledWith(0);
  });
});

describe('FocusPrCard', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the record and closes on its own after about five seconds', () => {
    const onClose = jest.fn();
    const { getByText, getByTestId } = render(
      <FocusPrCard
        visible
        exerciseName="Bench Press"
        load="85 kg × 8"
        detail={{ gain: '+2.5 kg', previous: '82.5 kg' }}
        onClose={onClose}
      />
    );
    expect(getByText('New PR!')).toBeTruthy();
    expect(getByTestId('focus-pr-load').props.children).toBe('85 kg × 8');
    expect(
      getByText('+2.5 kg over your previous best of 82.5 kg')
    ).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(PR_CARD_MS - 1);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(2);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once on Continue', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <FocusPrCard
        visible
        exerciseName="Bench Press"
        load="85 kg × 8"
        detail={null}
        onClose={onClose}
      />
    );
    fireEvent.press(getByTestId('focus-pr-continue'));
    expect(onClose).toHaveBeenCalled();
  });
});
