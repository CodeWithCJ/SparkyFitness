import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalorieTargetBreakdown } from '@/components/CalorieTargetBreakdown';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  }),
}));

const defaultProps = {
  previewResult: {
    baselineTdee: 2194,
    appliedDeficit: 0,
    rmr: 1800,
    absoluteFloorValue: 1500,
    finalTarget: 2194,
    insufficientHistory: false,
  },
  adaptiveTdeeData: {
    tdee: 2194,
    isFallback: false,
    daysOfData: 35,
    avgIntake: 2300,
    weightTrend: -0.2,
    confidence: 'HIGH' as const,
  },
  bmrAlgorithm: 'Mifflin-St Jeor',
  bodyFatAlgorithm: 'US Navy',
  displayWeight: 84.5,
  displayHeight: 180,
  displayAge: 35,
  displayGender: 'male' as const,
  goalMode: 'maintain',
  goalModeCalculationMethod: 'adaptive',
  goalModeCustomPercentage: 0,
  calorieGoalAdjustmentMode: 'dynamic',
  rawManualGoal: 2000,
  adjustedManualGoal: 2000,
  activityMultiplier: 1.2,
};

describe('CalorieTargetBreakdown baseline label', () => {
  it('labels the baseline as the adaptive TDEE under the adaptive method with sufficient data', () => {
    render(<CalorieTargetBreakdown {...defaultProps} />);
    expect(
      screen.getByText('Adaptive TDEE (Expenditure):')
    ).toBeInTheDocument();
  });

  it('labels the baseline as an estimate under the adaptive method with insufficient history', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          baselineTdee: 2160,
          finalTarget: 2160,
          insufficientHistory: true,
        }}
        adaptiveTdeeData={{
          tdee: 0,
          isFallback: true,
          fallbackReason: 'Insufficient weight entries (need at least 2)',
          daysOfData: 3,
        }}
      />
    );
    expect(screen.getByText('Estimated TDEE:')).toBeInTheDocument();
  });

  it('labels the baseline as the adaptive goal under the manual method with the adaptive adjustment mode', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        goalModeCalculationMethod="manual"
        calorieGoalAdjustmentMode="adaptive"
        adjustedManualGoal={2194}
      />
    );
    expect(screen.getByText('Baseline (Adaptive Goal):')).toBeInTheDocument();
  });

  it('labels the baseline as the manual goal under the manual method', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        goalModeCalculationMethod="manual"
        calorieGoalAdjustmentMode="dynamic"
      />
    );
    expect(screen.getByText('Baseline (Manual Goal):')).toBeInTheDocument();
  });
});
