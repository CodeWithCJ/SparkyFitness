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
    target: 2194,
    baselineTdee: 2194,
    appliedDeficit: 0,
    rmr: 1800,
    isBelowRmr: false,
    isBelowAbsoluteFloor: false,
    absoluteFloorValue: 1500,
    finalTarget: 2194,
    insufficientHistory: false,
    projectedWeeklyChangeKg: 0,
    projectedWeeklyChangePercent: 0,
    isGainGoal: false,
    safetyZone: 'green' as const,
    wasClampedToFloor: false,
    clampedFloorSource: null,
    maxFeasibleDeficitPercent: null,
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

describe('CalorieTargetBreakdown goal adjustment line', () => {
  // appliedDeficit and the adjustment percentage are both signed, so rendering
  // them raw double-printed the sign for gain modes ("Deficit (--10%) = --200").
  const gainProps = {
    ...defaultProps,
    goalMode: 'lean_bulk',
    previewResult: {
      ...defaultProps.previewResult,
      appliedDeficit: -219,
      finalTarget: 2413,
      isGainGoal: true,
    },
  };

  it('labels a gain mode as a surplus with a single + sign', () => {
    render(<CalorieTargetBreakdown {...gainProps} />);
    expect(screen.getByText('Goal Surplus:')).toBeInTheDocument();
    expect(
      screen.getByText(/lean_bulk Surplus \(\+10%\) = \+219 kcal/)
    ).toBeInTheDocument();
  });

  it('never double-prints a sign for a gain mode', () => {
    const { container } = render(<CalorieTargetBreakdown {...gainProps} />);
    expect(container.textContent).not.toMatch(/--|\+-|-\+/);
  });

  it('labels a manual surplus as a surplus', () => {
    render(
      <CalorieTargetBreakdown
        {...gainProps}
        goalMode="manual"
        goalModeCustomPercentage={15}
      />
    );
    expect(screen.getByText('Goal Surplus:')).toBeInTheDocument();
    expect(screen.getByText(/manual Surplus \(\+15%\)/)).toBeInTheDocument();
  });

  it('still labels a deficit mode as a deficit', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        goalMode="cut"
        previewResult={{
          ...defaultProps.previewResult,
          appliedDeficit: 329,
          finalTarget: 1865,
        }}
      />
    );
    expect(screen.getByText('Goal Deficit:')).toBeInTheDocument();
    expect(
      screen.getByText(/cut Deficit \(-15%\) = -329 kcal/)
    ).toBeInTheDocument();
  });
});

describe('CalorieTargetBreakdown adaptive-TDEE confidence', () => {
  /**
   * The server already computes LOW/MEDIUM/HIGH and downgrades it for sparse logs or
   * weight gaps, but the panel never rendered it — so a target derived from 17 days of
   * under-logged intake was presented with a green tick and no caveat.
   */
  it('surfaces a LOW confidence and warns about under-logging', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={{
          tdee: 2283,
          isFallback: false,
          daysOfData: 17,
          avgIntake: 753,
          weightTrend: -0.2,
          confidence: 'LOW' as const,
        }}
      />
    );

    expect(screen.getByText(/Confidence: LOW/i)).toBeInTheDocument();
    expect(screen.getByText(/17 day\(s\) of calorie/i)).toBeInTheDocument();
    expect(screen.getByText(/Under-logging intake/i)).toBeInTheDocument();
  });

  it('does not nag when confidence is HIGH', () => {
    render(<CalorieTargetBreakdown {...defaultProps} />);

    expect(screen.getByText(/Confidence: HIGH/i)).toBeInTheDocument();
    expect(screen.queryByText(/Under-logging intake/i)).not.toBeInTheDocument();
  });
});

describe('CalorieTargetBreakdown shown working', () => {
  /**
   * The US Navy constants are imperial. The panel computed in inches but printed the
   * raw centimetre values, so plugging in the numbers it displayed gave 22.8% against
   * a stated 16.3%.
   */
  it('prints the body-fat formula inputs in the inches it evaluates with', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        displayWaist={82}
        displayNeck={38}
        displayHeight={165.1}
      />
    );

    const working = screen.getByText(/86\.01 × log10/);
    expect(working.textContent).toMatch(/in\b/);
    expect(working.textContent).not.toMatch(/82cm/);
  });

  /**
   * Mifflin-St Jeor takes no body-fat input, so section 2 must not read like one.
   */
  it('says body fat is reference-only when the BMR formula ignores it', () => {
    render(<CalorieTargetBreakdown {...defaultProps} />);
    expect(
      screen.getByText(/does not take body fat as an input/i)
    ).toBeInTheDocument();
  });

  it('says body fat is used when the BMR formula consumes it', () => {
    render(
      <CalorieTargetBreakdown {...defaultProps} bmrAlgorithm="Katch-McArdle" />
    );
    expect(
      screen.getByText(/is used by this BMR formula/i)
    ).toBeInTheDocument();
  });

  /**
   * A stored 73.45 kg printed as "73.5" made the panel unable to reproduce its own
   * BMR: the shown working recomputed to 1597 against a stated 1596.
   */
  it('prints weight at the precision the formula evaluates with', () => {
    render(<CalorieTargetBreakdown {...defaultProps} displayWeight={73.45} />);
    expect(screen.getByText(/73\.45/)).toBeInTheDocument();
  });
});
