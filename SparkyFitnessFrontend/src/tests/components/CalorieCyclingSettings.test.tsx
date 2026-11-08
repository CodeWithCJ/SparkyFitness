import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalorieCyclingSettings } from '@/components/CalorieCyclingSettings';

type Props = React.ComponentProps<typeof CalorieCyclingSettings>;

const renderSettings = (overrides: Partial<Props> = {}) => {
  const onChange = jest.fn();
  const onSelectDay = jest.fn();
  const utils = render(
    <CalorieCyclingSettings
      mode="training_rest"
      offsets={[0, 15, 0, 15, 0, 15, 0]}
      onChange={onChange}
      available
      pausedByWeeklyPlan={false}
      baseTarget={2600}
      floor={1500}
      firstDayOfWeek={1}
      todayWeekday={0}
      selectedDay={1}
      onSelectDay={onSelectDay}
      convertEnergy={(value) => value}
      energyUnit="kcal"
      energyUnitString="kcal"
      {...overrides}
    />
  );
  return { ...utils, onChange, onSelectDay };
};

describe('CalorieCyclingSettings', () => {
  it('draws each day from the shared week maths and shows the selected day', () => {
    renderSettings();
    // Mon, Wed, Fri at +15% on 2,600: about 2,809 and 2,443 on rest days.
    expect(screen.getByTestId('calorie-cycling-bar-1')).toHaveAccessibleName(
      'Monday: 2,809, +209'
    );
    expect(screen.getByTestId('calorie-cycling-bar-2')).toHaveAccessibleName(
      'Tuesday: 2,443, −157'
    );
    expect(screen.getByTestId('calorie-cycling-day-card')).toHaveTextContent(
      'Monday · Training2,809 kcal+209 kcal (+8%) vs your daily target'
    );
    expect(screen.getByTestId('calorie-cycling-week-total')).toHaveTextContent(
      // Whole-kcal rounding: 3 x 2,809 + 4 x 2,443.
      'Week: 18,199 of 18,200 kcal (your daily target 2,600 × 7)'
    );
  });

  it('moves the mode with the arrow keys as one radio group', async () => {
    const { onChange } = renderSettings({ mode: 'off' });
    const off = screen.getByRole('radio', { name: 'Off' });
    // One tab stop for the group: the other options are skipped by Tab.
    expect(screen.getByRole('radio', { name: /Custom/ })).toHaveAttribute(
      'tabindex',
      '-1'
    );
    off.focus();
    fireEvent.keyDown(off, { key: 'ArrowRight' });
    // Radix moves focus on the next tick and selects the focused radio.
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'training_rest' })
      )
    );
  });

  it('only selects a day when a bar is tapped, never changes it', () => {
    const { onChange, onSelectDay } = renderSettings({ mode: 'custom' });
    const bar = screen.getByTestId('calorie-cycling-bar-3');
    fireEvent.pointerDown(bar, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 102, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientY: 102, pointerId: 1 });
    fireEvent.click(bar);
    expect(onSelectDay).toHaveBeenCalledWith(3);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('changes a custom day only once it is dragged, from where the drag began', () => {
    // A 200 px chart: the full height is 80 points (-40 to +40).
    const rect = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 200 } as DOMRect);
    const { onChange, onSelectDay } = renderSettings({ mode: 'custom' });
    const bar = screen.getByTestId('calorie-cycling-bar-3');
    fireEvent.pointerDown(bar, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 250, pointerId: 1 });
    // 50 px up = +20 points on top of Wednesday's +15.
    expect(onSelectDay).toHaveBeenCalledWith(3);
    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'custom',
      offsets: [0, 15, 0, 35, 0, 15, 0],
    });
    rect.mockRestore();
  });

  it('nudges the selected custom day with the arrow keys and the stepper', () => {
    const { onChange } = renderSettings({ mode: 'custom' });
    fireEvent.keyDown(screen.getByTestId('calorie-cycling-bar-1'), {
      key: 'ArrowUp',
    });
    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'custom',
      offsets: [0, 16, 0, 15, 0, 15, 0],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lower by 1%' }));
    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'custom',
      offsets: [0, 14, 0, 15, 0, 15, 0],
    });
  });

  it('switches a day between training and rest from the icon under it', () => {
    const { onChange } = renderSettings();
    fireEvent.click(screen.getByTestId('calorie-cycling-toggle-6'));
    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'training_rest',
      offsets: [0, 15, 0, 15, 0, 15, 15],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Raise by 1%' }));
    expect(onChange).toHaveBeenLastCalledWith({
      mode: 'training_rest',
      offsets: [0, 16, 0, 16, 0, 16, 0],
    });
  });

  it('keeps the chart and explains a flat week at the safety floor', () => {
    renderSettings({ baseTarget: 1630, floor: 1700 });
    expect(screen.getByTestId('calorie-cycling-at-floor')).toHaveTextContent(
      /1,630 kcal\) is at or below your safety floor \(1,700 kcal/
    );
    expect(screen.getByTestId('calorie-cycling-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('calorie-cycling-week-total')).toBeNull();
  });

  it('marks a day held at the safety floor', () => {
    renderSettings({
      mode: 'custom',
      offsets: [-40, 40, -40, 40, -40, 40, 0],
      baseTarget: 1800,
      floor: 1500,
      selectedDay: 2,
    });
    expect(screen.getByTestId('calorie-cycling-bar-2')).toHaveTextContent(
      'floor'
    );
    expect(screen.getByTestId('calorie-cycling-day-card')).toHaveTextContent(
      'Safety floor'
    );
  });
});
