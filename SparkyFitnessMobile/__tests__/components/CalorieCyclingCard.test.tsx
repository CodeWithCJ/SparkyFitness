import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CalorieCyclingCard from '../../src/components/CalorieCyclingCard';

type Props = React.ComponentProps<typeof CalorieCyclingCard>;

function renderCard(props: Partial<Props> = {}) {
  const onSave = jest.fn();
  const utils = render(
    <CalorieCyclingCard
      mode="off"
      offsets={[0, 0, 0, 0, 0, 0, 0]}
      onSave={onSave}
      available
      pausedByWeeklyPlan={false}
      baseTarget={2000}
      floor={1500}
      firstDayOfWeek={1}
      energyUnit="kcal"
      {...props}
    />
  );
  return { ...utils, onSave };
}

describe('CalorieCyclingCard', () => {
  it('explains why it is unavailable while exercise calories are added back', () => {
    const { getByTestId, queryByText } = renderCard({ available: false });
    expect(getByTestId('calorie-cycling-unavailable')).toBeTruthy();
    expect(queryByText('Training vs rest')).toBeNull();
  });

  it('starts training vs rest on Mon, Wed and Fri at +15%', () => {
    const { getByText, onSave } = renderCard();
    fireEvent.press(getByText('Training vs rest'));
    expect(onSave).toHaveBeenCalledWith({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 0],
    });
  });

  it('shows each day result under its control, coloured by direction', () => {
    const { getByTestId } = renderCard({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 0],
      baseTarget: 2600,
      floor: 1500,
    });
    // Mon, Wed, Fri at +15% on 2,600: about 2,809 and 2,443 on rest days.
    expect(getByTestId('calorie-cycling-result-1')).toHaveTextContent(
      '2,809+209'
    );
    expect(getByTestId('calorie-cycling-result-2')).toHaveTextContent(
      '2,443−157'
    );
    expect(getByTestId('calorie-cycling-base')).toHaveTextContent(
      /Today's target before cycling: 2,600 kcal\./
    );
    expect(getByTestId('calorie-cycling-week-total')).toHaveTextContent(
      'Week: 18,199 of 18,200 kcal (your daily target 2,600 × 7)'
    );
  });

  it('shows the kcal and % change beside each custom day', () => {
    const { getByTestId } = renderCard({
      mode: 'custom',
      offsets: [0, 15, 0, 15, 0, 15, 0],
      baseTarget: 2600,
      floor: 1500,
    });
    expect(getByTestId('calorie-cycling-result-1')).toHaveTextContent(
      '2,809 kcal+209 kcal (+8%)'
    );
  });

  it('toggles a training day and steps the percentage', () => {
    const { getByTestId, onSave } = renderCard({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 0],
    });
    fireEvent.press(getByTestId('calorie-cycling-day-6'));
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 15],
    });
    fireEvent.press(getByTestId('calorie-cycling-percent-up'));
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'training_rest',
      offsets: [0, 20, 0, 20, 0, 20, 0],
    });
  });

  it('warns instead of previewing when no day is a training day', () => {
    const { getByText, queryByTestId } = renderCard({
      mode: 'training_rest',
      offsets: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(getByText(/Choose between 1 and 6 training days/)).toBeTruthy();
    expect(queryByTestId('calorie-cycling-preview')).toBeNull();
  });
});

describe('CalorieCyclingCard at the safety floor', () => {
  it('explains a flat week when the target is at or below the floor', () => {
    const { getByTestId, queryByTestId } = renderCard({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 0],
      baseTarget: 1630,
      floor: 1700,
    });
    expect(getByTestId('calorie-cycling-at-floor')).toHaveTextContent(
      /1,630 kcal\) is at or below your safety floor \(1,700 kcal/
    );
    expect(queryByTestId('calorie-cycling-preview')).toBeNull();
  });
});
