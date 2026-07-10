import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CardioLog } from '@/pages/Exercises/CardioLog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'workout.durationMin': 'المدة (دقيقة)',
        'workout.distance': 'المسافة',
        'workout.calories': 'السعرات المحروقة',
        'workout.caloriesAuto': 'تلقائي',
        'workout.avgHr': 'متوسط النبض',
        'workout.rpe': 'درجة الجهد',
        'units.kilometer': 'كم',
      };
      return translations[key] ?? defaultValue ?? key;
    },
  }),
}));

// Keep controlled values round-tripping like the real dialogs do.
const Harness = ({
  onDurationChange = () => {},
  onDistanceChange = () => {},
}: {
  onDurationChange?: (value: number | '') => void;
  onDistanceChange?: (value: number | '') => void;
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
      onDurationChange={(value) => {
        setDuration(value);
        onDurationChange(value);
      }}
      onDistanceChange={(value) => {
        setDistance(value);
        onDistanceChange(value);
      }}
      onCaloriesChange={() => {}}
      onAvgHeartRateChange={() => {}}
      onRpeChange={() => {}}
    />
  );
};

describe('CardioLog', () => {
  it('accepts a decimal duration in minutes', () => {
    const onDurationChange = jest.fn();
    render(<Harness onDurationChange={onDurationChange} />);

    const duration = screen.getByLabelText('المدة (دقيقة)');
    fireEvent.focus(duration);
    fireEvent.change(duration, { target: { value: '1.25' } });
    fireEvent.blur(duration);

    expect(onDurationChange).toHaveBeenLastCalledWith(1.25);
    expect(duration).toHaveValue(1.25);
  });

  it('accepts a decimal distance', () => {
    const onDistanceChange = jest.fn();
    render(<Harness onDistanceChange={onDistanceChange} />);

    const distance = screen.getByLabelText('المسافة (كم)');
    fireEvent.focus(distance);
    fireEvent.change(distance, { target: { value: '5.3' } });
    fireEvent.blur(distance);

    expect(onDistanceChange).toHaveBeenLastCalledWith(5.3);
    expect(distance).toHaveValue(5.3);
  });

  it('associates localized Arabic labels with every cardio field', () => {
    render(
      <CardioLog
        durationMinutes={30}
        distance={5}
        caloriesBurned=""
        avgHeartRate={135}
        rpe={6}
        distanceUnit="km"
        onDurationChange={jest.fn()}
        onDistanceChange={jest.fn()}
        onCaloriesChange={jest.fn()}
        onAvgHeartRateChange={jest.fn()}
        onRpeChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText('المدة (دقيقة)')).toHaveValue(30);
    expect(screen.getByLabelText('المسافة (كم)')).toHaveValue(5);
    expect(screen.getByLabelText('السعرات المحروقة')).toHaveAttribute(
      'placeholder',
      'تلقائي'
    );
    expect(screen.getByLabelText('متوسط النبض')).toHaveValue(135);
    expect(screen.getByLabelText('درجة الجهد')).toHaveValue(6);
  });
});
