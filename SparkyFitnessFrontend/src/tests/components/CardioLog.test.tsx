import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CardioLog } from '@/pages/Exercises/CardioLog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

// Stateful wrapper so the controlled value prop round-trips like the real
// dialogs do — without this, NumericInput would reset on the next render.
const Harness = ({
  onDurationChange = () => {},
  onDistanceChange = () => {},
}: {
  onDurationChange?: (v: number | '') => void;
  onDistanceChange?: (v: number | '') => void;
}) => {
  const [duration, setDuration] = useState<number | ''>('');
  const [distance, setDistance] = useState<number | ''>('');
  return (
    <CardioLog
      durationMinutes={duration}
      distance={distance}
      caloriesBurned=""
      avgHeartRate=""
      rpe=""
      distanceUnit="km"
      onDurationChange={(v) => {
        setDuration(v);
        onDurationChange(v);
      }}
      onDistanceChange={(v) => {
        setDistance(v);
        onDistanceChange(v);
      }}
      onCaloriesChange={() => {}}
      onAvgHeartRateChange={() => {}}
      onRpeChange={() => {}}
    />
  );
};

const inputFor = (label: RegExp) =>
  screen
    .getByText(label)
    .closest('div')!
    .querySelector('input') as HTMLInputElement;

describe('CardioLog', () => {
  it('accepts a decimal duration in minutes', () => {
    const onDurationChange = jest.fn();
    render(<Harness onDurationChange={onDurationChange} />);

    const duration = inputFor(/Duration \(min\)/);
    fireEvent.focus(duration);
    fireEvent.change(duration, { target: { value: '1.25' } });
    fireEvent.blur(duration);

    expect(onDurationChange).toHaveBeenLastCalledWith(1.25);
    expect(duration).toHaveValue(1.25);
  });

  it('accepts a decimal distance', () => {
    const onDistanceChange = jest.fn();
    render(<Harness onDistanceChange={onDistanceChange} />);

    const distance = inputFor(/Distance/);
    fireEvent.focus(distance);
    fireEvent.change(distance, { target: { value: '5.3' } });
    fireEvent.blur(distance);

    expect(onDistanceChange).toHaveBeenLastCalledWith(5.3);
    expect(distance).toHaveValue(5.3);
  });
});
