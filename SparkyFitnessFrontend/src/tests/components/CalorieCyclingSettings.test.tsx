import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalorieCyclingSettings } from '@/components/CalorieCyclingSettings';

const renderSettings = (baseTarget: number, floor: number | null) =>
  render(
    <CalorieCyclingSettings
      mode="training_rest"
      offsets={[0, 15, 0, 15, 0, 15, 0]}
      onChange={jest.fn()}
      available
      pausedByWeeklyPlan={false}
      baseTarget={baseTarget}
      floor={floor}
      firstDayOfWeek={1}
      convertEnergy={(value) => value}
      energyUnit="kcal"
      energyUnitString="kcal"
    />
  );

describe('CalorieCyclingSettings', () => {
  it('explains a flat week when the target is at or below the safety floor', () => {
    renderSettings(1630, 1700);
    expect(screen.getByTestId('calorie-cycling-at-floor')).toHaveTextContent(
      /1,630 kcal\) is at or below your safety floor \(1,700 kcal/
    );
    expect(screen.queryByTestId('calorie-cycling-week-total')).toBeNull();
    expect(screen.queryByTestId('calorie-cycling-result-1')).toBeNull();
  });

  it('previews the week when the target is above the floor', () => {
    renderSettings(2600, 1500);
    expect(screen.queryByTestId('calorie-cycling-at-floor')).toBeNull();
    // Mon, Wed, Fri at +15% on 2,600: training days about 2,809, rest about 2,443,
    // shown beside each day button.
    expect(screen.getByTestId('calorie-cycling-result-1')).toHaveTextContent(
      /2,809 kcal\+209 kcal \(\+8%\)/
    );
    expect(screen.getByTestId('calorie-cycling-result-2')).toHaveTextContent(
      /2,443 kcal−157 kcal \(−6%\)/
    );
    expect(screen.getByTestId('calorie-cycling-base')).toHaveTextContent(
      "Today's target before cycling: 2,600 kcal."
    );
    expect(screen.getByTestId('calorie-cycling-week-total')).toHaveTextContent(
      // Whole-kcal rounding: 3 x 2,809 + 4 x 2,443.
      'Week: 18,199 of 18,200 kcal (your daily target 2,600 × 7)'
    );
  });
});
