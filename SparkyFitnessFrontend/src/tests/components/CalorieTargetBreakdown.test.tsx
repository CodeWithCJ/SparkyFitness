import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalorieTargetBreakdown } from '@/components/CalorieTargetBreakdown';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Interpolates `{{var}}` the way i18next does, so assertions can match the rendered
    // text rather than the raw template.
    t: (_key: string, defaultValue?: string, opts?: Record<string, unknown>) =>
      opts
        ? (defaultValue ?? '').replace(/\{\{(\w+)\}\}/g, (_m, name) =>
            String(opts[name] ?? '')
          )
        : defaultValue,
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
    recommendedSafetyFloor: 1800,
    effectiveSafetyFloor: 1800,
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
      <CalorieTargetBreakdown
        {...defaultProps}
        bmrAlgorithm="Katch-McArdle"
        displayBodyFat={19.6}
      />
    );
    expect(
      screen.getByText(/is used by this BMR formula/i)
    ).toBeInTheDocument();
  });

  /**
   * A lean-mass formula with no logged measurement silently treats body fat as 0%,
   * which reads as an implausibly high BMR. Saying the value "is used" there would be
   * wrong twice: there is nothing to use, and the resulting target is not trustworthy.
   */
  it('flags a missing measurement when the BMR formula needs body fat', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        bmrAlgorithm="Katch-McArdle"
        displayBodyFat={0}
      />
    );
    expect(screen.getByText(/no measurement is logged/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/is used by this BMR formula/i)
    ).not.toBeInTheDocument();
  });

  it('does not warn when confidence is absent', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={{
          tdee: 2194,
          isFallback: false,
          daysOfData: 35,
          avgIntake: 2300,
          weightTrend: -0.2,
        }}
      />
    );
    expect(screen.queryByText(/Under-logging intake/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 day\(s\)/i)).not.toBeInTheDocument();
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

describe('CalorieTargetBreakdown configured safety floor', () => {
  it('shows a custom floor as the effective limit', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          effectiveSafetyFloor: 1200,
        }}
      />
    );

    expect(screen.getByText(/Effective Safety Floor:/)).toHaveTextContent(
      '1200 kcal'
    );
  });

  it('shows that automatic clamping is disabled without hiding recommendations', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          effectiveSafetyFloor: null,
        }}
      />
    );

    expect(screen.getByText(/Effective Safety Floor:/)).toHaveTextContent(
      'Disabled'
    );
    expect(screen.getByText(/Clinical Absolute Floor:/)).toBeInTheDocument();
  });

  it('warns when a custom adaptive target remains below the recommendation', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          finalTarget: 1300,
          isBelowRmr: true,
          effectiveSafetyFloor: 1200,
          recommendedSafetyFloor: 1800,
        }}
      />
    );

    expect(
      screen.getByText(/below the recommended safety floor/i)
    ).toBeInTheDocument();
  });
});
