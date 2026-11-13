import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CalorieCyclingCard, {
  percentSignFirst,
} from '../../src/components/CalorieCyclingCard';

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
      todayWeekday={1}
      energyUnit="kcal"
      previewReady
      {...props}
    />
  );
  return { ...utils, onSave };
}

const training = {
  mode: 'training_rest' as const,
  offsets: [0, 15, 0, 15, 0, 15, 0],
  baseTarget: 2600,
  floor: 1500,
};

describe('CalorieCyclingCard', () => {
  it('explains why it is unavailable while exercise calories are added back', () => {
    const { getByTestId, queryByText } = renderCard({ available: false });
    expect(getByTestId('calorie-cycling-unavailable')).toBeTruthy();
    expect(queryByText('Training vs rest')).toBeNull();
  });

  it('starts training vs rest on Mon, Wed and Fri at +15%', () => {
    const { getByText, onSave } = renderCard();
    fireEvent.press(getByText('Training / rest'));
    expect(onSave).toHaveBeenCalledWith({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 0],
    });
  });

  it('draws each day from the shared week maths and shows today in the day card', () => {
    const { getByTestId } = renderCard(training);
    // Mon, Wed, Fri at +15% on 2,600: about 2,809 and 2,443 on rest days.
    expect(getByTestId('calorie-cycling-bar-1').props.accessibilityLabel).toBe(
      'Monday: 2,809, +209'
    );
    expect(getByTestId('calorie-cycling-bar-2').props.accessibilityLabel).toBe(
      'Tuesday: 2,443, −157'
    );
    expect(getByTestId('calorie-cycling-day-card')).toHaveTextContent(
      'Today · Training2,809 kcal+209 kcal (+8%) vs your daily target'
    );
    expect(getByTestId('calorie-cycling-week-total')).toHaveTextContent(
      'Week: 18,199 of 18,200 kcal (your daily target 2,600 × 7)'
    );
  });

  it('switches a day from the icon under it and steps the boost by 1%', () => {
    const { getByTestId, onSave } = renderCard(training);
    fireEvent.press(getByTestId('calorie-cycling-toggle-6'));
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 15],
    });
    fireEvent.press(getByTestId('calorie-cycling-percent-up'));
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'training_rest',
      offsets: [0, 16, 0, 16, 0, 16, 0],
    });
  });

  it('sets the selected custom day with the stepper and a typed value', () => {
    const { getByTestId, onSave } = renderCard({
      ...training,
      mode: 'custom',
    });
    fireEvent.press(getByTestId('calorie-cycling-day-percent-down'));
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'custom',
      offsets: [0, 14, 0, 15, 0, 15, 0],
    });
    const input = getByTestId('calorie-cycling-day-percent-input');
    fireEvent.changeText(input, '-22');
    fireEvent(input, 'endEditing');
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'custom',
      offsets: [0, -22, 0, 15, 0, 15, 0],
    });
  });

  it('nudges a custom bar from its accessibility actions', () => {
    const { getByTestId, onSave } = renderCard({
      ...training,
      mode: 'custom',
    });
    fireEvent(getByTestId('calorie-cycling-bar-3'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onSave).toHaveBeenLastCalledWith({
      mode: 'custom',
      offsets: [0, 15, 0, 16, 0, 15, 0],
    });
  });

  it('warns and shows no week total when no day is a training day', () => {
    const { getByText, queryByTestId, getByTestId } = renderCard({
      ...training,
      offsets: [0, 0, 0, 0, 0, 0, 0],
    });
    expect(getByText(/Choose between 1 and 6 training days/)).toBeTruthy();
    expect(queryByTestId('calorie-cycling-week-total')).toBeNull();
    // The chart stays so a day can still be switched to training.
    expect(getByTestId('calorie-cycling-toggle-1')).toBeTruthy();
  });
});

describe('CalorieCyclingCard without a cycling summary', () => {
  it('keeps the days editable when no training day is left', () => {
    // A pattern that changes nothing has no cycling summary on the server.
    renderCard({
      mode: 'training_rest',
      offsets: [0, 0, 0, 0, 0, 0, 0],
      baseTarget: 2000,
      floor: null,
      previewReady: false,
    });
    expect(screen.getByTestId('calorie-cycling-chart')).toBeTruthy();
    expect(screen.queryByTestId('calorie-cycling-preview')).toBeNull();
  });

  it('says it is waiting while no target has loaded', () => {
    renderCard({ ...training, baseTarget: 0, previewReady: false });
    expect(screen.getByTestId('calorie-cycling-waiting')).toBeTruthy();
  });
});

describe('CalorieCyclingCard at the safety floor', () => {
  it('keeps the chart and explains a flat week', () => {
    const { getByTestId, queryByTestId } = renderCard({
      ...training,
      baseTarget: 1630,
      floor: 1700,
    });
    expect(getByTestId('calorie-cycling-at-floor')).toHaveTextContent(
      /1,630 kcal\) is at or below your safety floor \(1,700 kcal/
    );
    expect(getByTestId('calorie-cycling-chart')).toBeTruthy();
    expect(queryByTestId('calorie-cycling-week-total')).toBeNull();
  });
});

describe('percentSignFirst', () => {
  // Hermes on iOS has no Intl.NumberFormat#formatToParts; rendering the
  // percent field must not depend on it.
  const proto = Intl.NumberFormat.prototype as unknown as Record<
    string,
    unknown
  >;
  const original = proto.formatToParts;
  beforeAll(() => {
    delete proto.formatToParts;
  });
  afterAll(() => {
    proto.formatToParts = original;
  });

  it('works without formatToParts', () => {
    expect(percentSignFirst('en')).toBe(false);
    expect(percentSignFirst('tr')).toBe(true);
  });
});
