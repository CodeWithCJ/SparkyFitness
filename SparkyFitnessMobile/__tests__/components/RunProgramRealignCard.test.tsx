import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { addDays, dayOfWeek, findProgram } from '@workspace/shared';
import RunProgramRealignCard from '../../src/components/recording/RunProgramRealignCard';
import { storedBeginnerProgram } from '../helpers/runProgramFixture';

// A Monday; the person runs Monday, Wednesday and Friday.
const today = '2026-11-02';

/** The goal day that leaves exactly `slots` workout days from today. */
const endForSlots = (slots: number): string => {
  let seen = 0;
  for (let d = today; ; d = addDays(d, 1)) {
    if ([1, 3, 5].includes(dayOfWeek(d)) && ++seen === slots) return d;
  }
};

/** A half-marathon plan, three done, with `slots` workout days to the goal. */
const behind = (slots: number, over = {}) =>
  storedBeginnerProgram({
    program_id: 'halfMarathon',
    workouts: findProgram('halfMarathon')!.workouts,
    next_index: 3,
    run_days: [1, 3, 5],
    end_date: endForSlots(slots),
    last_done_date: '2026-10-30',
    ...over,
  });

const renderCard = (program = behind(30), over = {}) => {
  const props = {
    program,
    today,
    onAccept: jest.fn(() => Promise.resolve()),
    onMoveGoal: jest.fn(),
    onPlanShorter: jest.fn(),
    ...over,
  };
  render(<RunProgramRealignCard {...props} />);
  return props;
};

describe('RunProgramRealignCard', () => {
  it('shows nothing when the plan fits', () => {
    renderCard(behind(33));
    expect(screen.queryByTestId('run-program-realign')).toBeNull();
  });

  it('previews what changes, before and after, and keeps the taper', () => {
    renderCard();
    expect(screen.getByText('Realign your plan')).toBeTruthy();
    expect(screen.getByText(/Now: 33 workouts left, ending/)).toBeTruthy();
    expect(screen.getByText(/After: 30 workouts, ending/)).toBeTruthy();
    expect(screen.getAllByTestId('run-program-realign-change')).toHaveLength(3);
    expect(
      screen.getByText(
        'The taper and the final workout stay exactly as they are.'
      )
    ).toBeTruthy();
  });

  it('applies the previewed plan on Accept, and only then', async () => {
    const props = renderCard();
    expect(props.onAccept).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('run-program-realign-accept'));
    });
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onAccept).toHaveBeenCalledWith(expect.any(String), false);
  });

  it('keeps the plan as it is on Not now', () => {
    const props = renderCard();
    fireEvent.press(screen.getByTestId('run-program-realign-not-now'));
    expect(screen.queryByTestId('run-program-realign')).toBeNull();
    expect(props.onAccept).not.toHaveBeenCalled();
  });

  it('blocks a second press while the change is being saved', async () => {
    let finish: () => void = () => undefined;
    const props = renderCard(behind(30), {
      onAccept: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      ),
    });
    fireEvent.press(screen.getByTestId('run-program-realign-accept'));
    fireEvent.press(screen.getByTestId('run-program-realign-accept'));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('lists every change on Show all', () => {
    renderCard(behind(27));
    expect(screen.getAllByTestId('run-program-realign-change')).toHaveLength(5);
    fireEvent.press(screen.getByTestId('run-program-realign-show-all'));
    expect(screen.getAllByTestId('run-program-realign-change')).toHaveLength(6);
  });

  it('says plainly when it eases the running after a long gap', () => {
    renderCard(behind(30, { last_done_date: '2026-10-03' }));
    expect(
      screen.getByText(
        'You have been away 30 days, so the running in your next 3 workouts is eased by 25%.'
      )
    ).toBeTruthy();
  });

  it('offers spare time as repeated base weeks', () => {
    renderCard(behind(45));
    expect(screen.getByText('You have time to spare')).toBeTruthy();
    expect(screen.getByText('What it adds')).toBeTruthy();
  });

  describe('when the goal date is not realistic', () => {
    it('says why and offers a later date, a shorter race or continuing', () => {
      const props = renderCard(behind(24));
      expect(screen.getByText('Your goal date is too tight')).toBeTruthy();
      expect(
        screen.getByText(
          'Only 24 workout days are left before your goal date and 33 workouts remain.'
        )
      ).toBeTruthy();
      expect(
        screen.getByText(
          'Fitting everything in would mean dropping a lot of your build.'
        )
      ).toBeTruthy();
      expect(screen.queryByTestId('run-program-realign-accept')).toBeNull();

      fireEvent.press(screen.getByTestId('run-program-realign-later'));
      expect(props.onMoveGoal).toHaveBeenCalledWith(endForSlots(33));
      fireEvent.press(screen.getByTestId('run-program-realign-lower'));
      expect(props.onPlanShorter).toHaveBeenCalledWith('10k');
      expect(props.onAccept).not.toHaveBeenCalled();
    });

    it('previews continuing anyway and applies it with force', async () => {
      const props = renderCard(behind(24));
      fireEvent.press(screen.getByTestId('run-program-realign-continue'));
      expect(screen.getByText(/After: 24 workouts, ending/)).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId('run-program-realign-accept'));
      });
      expect(props.onAccept).toHaveBeenCalledWith(expect.any(String), true);
    });

    it('goes back from continue anyway without changing anything', () => {
      const props = renderCard(behind(24));
      fireEvent.press(screen.getByTestId('run-program-realign-continue'));
      fireEvent.press(screen.getByTestId('run-program-realign-not-now'));
      expect(screen.getByText('Your goal date is too tight')).toBeTruthy();
      expect(props.onAccept).not.toHaveBeenCalled();
    });

    it('offers no way to continue when the taper itself does not fit', () => {
      renderCard(behind(4));
      expect(screen.queryByTestId('run-program-realign-continue')).toBeNull();
      expect(
        screen.getByText(
          'There is no longer room for the taper and the final workout.'
        )
      ).toBeTruthy();
    });
  });
});
