import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ExerciseSummary from '../../src/components/ExerciseSummary';
import FoodSummary from '../../src/components/FoodSummary';
import MeasurementsSummary from '../../src/components/MeasurementsSummary';

describe('Arabic diary summaries', () => {
  it('offers an Arabic food action for an empty day', () => {
    const onAddFood = jest.fn();
    const screen = render(
      <FoodSummary foodEntries={[]} onAddFood={onAddFood} />,
    );

    fireEvent.press(screen.getByText('اضغط لإضافة صنف غذائي'));
    expect(onAddFood).toHaveBeenCalledTimes(1);
  });

  it('offers an Arabic exercise action for an empty day', () => {
    const onAddExercise = jest.fn();
    const screen = render(
      <ExerciseSummary
        exerciseEntries={[]}
        entryDate="2026-07-10"
        onAddExercise={onAddExercise}
      />,
    );

    fireEvent.press(screen.getByLabelText('إضافة تمرين'));
    expect(onAddExercise).toHaveBeenCalledTimes(1);
  });

  it('formats measurement labels, values, and accessibility in Arabic', () => {
    const onPress = jest.fn();
    const screen = render(
      <MeasurementsSummary
        measurements={
          {
            weight: 70.5,
            body_fat_percentage: 20,
            steps: 1234,
          } as never
        }
        onPress={onPress}
      />,
    );

    expect(screen.getByText('القياسات')).toBeTruthy();
    expect(screen.getByText('٧٠٫٥ كجم')).toBeTruthy();
    expect(screen.getByText('دهون الجسم')).toBeTruthy();
    expect(screen.getByText('٢٠٪')).toBeTruthy();
    expect(screen.getByText('١٬٢٣٤')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('تعديل القياسات'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
