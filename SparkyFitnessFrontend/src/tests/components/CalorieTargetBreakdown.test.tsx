import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CalorieTargetBreakdown } from '@/components/CalorieTargetBreakdown';

describe('CalorieTargetBreakdown gradual expenditure estimate (#3485)', () => {
  const boundedData = () => ({
    ...defaultProps.adaptiveTdeeData,
    tdee: 2470,
    rawTdee: 2480,
    avgIntake: 2600,
    daysOfData: 28,
    startWeightTrend: 70,
    endWeightTrend: 70.42,
    weightChangeKg: 0.42,
    daysInWindow: 28,
    windowStartDate: '2026-10-10',
    windowEndDate: '2026-11-06',
    dailyWeightChangeKg: 0.02,
    weightChangeCalories: -120,
    weightTrendMethod: 'bounded_daily' as const,
    observedWeightDays: 3,
    weightObservationSpanDays: 21,
    lastWeightDate: '2026-11-06',
    candidateDate: '2026-11-06',
    daysSinceLastWeight: 1,
    daysSinceEstimate: 1,
    estimateStatus: 'learning' as const,
    stabilizationDays: 12,
    stabilizationWindowDays: 40,
    dailyChangeLimitKcal: 25,
    stabilityAdjustmentKcal: -10,
    clampMin: 1660,
    clampMax: 2660,
    wasClamped: false,
  });

  it('uses fitted weights over actual observation dates without treating missing days as observations', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={boundedData()}
      />
    );
    expect(screen.getByText(/Fitted weight trend:/)).toHaveTextContent(
      '70.0 kg → 70.4 kg (0.42 kg over 21 days) = 0.0200 kg/day'
    );
    expect(screen.getByText(/Observed weights:/)).toHaveTextContent(
      '3 measured days spanning 21 days'
    );
    expect(
      screen.getByText(/actual measurement dates; missing days are not filled/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/median weekly rate|7-day averages/)).toBeNull();
  });

  it('keeps the observed rate arithmetic separate from the history adjustment', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={boundedData()}
      />
    );
    expect(screen.getByText(/Raw expenditure candidate:/)).toHaveTextContent(
      '2480 kcal (2600 − 120)'
    );
    expect(screen.getByText(/History adjustment:/)).toHaveTextContent(
      '2480 − 10 = 2470 kcal'
    );
    expect(
      screen.getByText(/Energy from the observed weight rate:/)
    ).toHaveTextContent('−(0.0200 kg/day × 6000 kcal/kg) ≈ −120 kcal');
  });

  it('applies the plausibility cap before the history adjustment', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={{
          ...boundedData(),
          rawTdee: 2800,
          avgIntake: 2920,
          tdee: 2520,
          wasClamped: true,
          stabilityAdjustmentKcal: -140,
        }}
      />
    );
    expect(
      screen.getByText(/Raw estimate of 2800 kcal was capped/)
    ).toHaveTextContent('capped to 2660 kcal');
    expect(screen.getByText(/History adjustment:/)).toHaveTextContent(
      '2660 − 140 = 2520 kcal'
    );
  });

  it('reconciles converted history arithmetic in kJ and fitted weight rates in pounds', () => {
    mockUsePreferences.mockReturnValue({
      energyUnit: 'kJ',
      convertEnergy: (value: number) => value * 4.184,
      weightUnit: 'lbs',
    });
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={boundedData()}
      />
    );
    expect(screen.getByText(/Fitted weight trend:/)).toHaveTextContent(
      '0.93 lbs over 21 days) = 0.0441 lbs/day'
    );
    expect(screen.getByText(/Raw expenditure candidate:/)).toHaveTextContent(
      '10376 kJ (10878 − 502)'
    );
    expect(screen.getByText(/History adjustment:/)).toHaveTextContent(
      '10376 − 42 = 10334 kJ'
    );
  });

  it('shows a separate activity-baseline cap and history adjustment without subtracting current activity twice', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveActivitySeparate
        adaptiveTdeeData={{
          ...boundedData(),
          rawTdee: 2800,
          avgIntake: 2920,
          tdee: 2520,
          wasClamped: true,
          stabilityAdjustmentKcal: -140,
          rawActivityAdjustedTdee: 2300,
          activityAdjustedTdee: 2270,
          averageActivityCalories: 500,
          activityDaysOfData: 28,
          activityStabilityAdjustmentKcal: -30,
        }}
      />
    );
    expect(screen.getByText(/2800 − 500 = 2300 kcal/)).toBeInTheDocument();
    expect(
      screen.getByText(/Activity-baseline history adjustment:/)
    ).toHaveTextContent('2300 − 30 = 2270 kcal');
    expect(
      screen.getByText(
        /Today's steps and workouts are credited separately once/
      )
    ).toBeInTheDocument();
  });

  it('reconciles the independent activity-baseline history adjustment in kJ', () => {
    mockUsePreferences.mockReturnValue({
      energyUnit: 'kJ',
      convertEnergy: (value: number) => value * 4.184,
      weightUnit: 'kg',
    });
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveActivitySeparate
        adaptiveTdeeData={{
          ...boundedData(),
          rawTdee: 2800,
          avgIntake: 2920,
          tdee: 2520,
          wasClamped: true,
          stabilityAdjustmentKcal: -140,
          rawActivityAdjustedTdee: 2300,
          activityAdjustedTdee: 2270,
          averageActivityCalories: 500,
          activityDaysOfData: 28,
          activityStabilityAdjustmentKcal: -30,
        }}
      />
    );
    expect(screen.getByText(/11715 − 2092 = 9623 kJ/)).toBeInTheDocument();
    expect(
      screen.getByText(/Activity-baseline history adjustment:/)
    ).toHaveTextContent('9623 − 125 = 9498 kJ');
  });

  it.each([
    { status: 'learning' as const, want: /Status: Learning.*12\/40/ },
    { status: 'adaptive' as const, want: /Status: Adaptive/ },
    {
      status: 'held' as const,
      want: /Status: Holding the latest complete estimate/,
    },
    {
      status: 'fading' as const,
      want: /Status: Gradually returning to the formula baseline/,
    },
  ])(
    'explains the $status estimate state and its evidence age',
    ({ status, want }) => {
      render(
        <CalorieTargetBreakdown
          {...defaultProps}
          adaptiveTdeeData={{
            ...boundedData(),
            estimateStatus: status,
            daysSinceEstimate: 9,
          }}
        />
      );
      expect(screen.getByText(want)).toBeInTheDocument();
      expect(screen.getByText(/Latest complete evidence:/)).toHaveTextContent(
        '2026-11-06 (9 days ago)'
      );
      expect(
        screen.getByText(/displayed average can continue moving/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/25 kcal\/day/)).toHaveTextContent(
        'With an unchanged formula baseline and unchanged past records'
      );
      expect(screen.getByText(/25 kcal\/day/)).toHaveTextContent(
        'Birthdays, changes in measured BMR, or profile/settings changes can change the baseline'
      );
    }
  );

  it('explains fallback evidence with measured dates and the same calorie requirement as automatic goals', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          insufficientHistory: true,
        }}
        adaptiveTdeeData={{
          tdee: 2160,
          confidence: 'LOW',
          daysOfData: 28,
          weightTrendMethod: 'bounded_daily',
          isFallback: true,
          estimateStatus: 'fallback',
          stabilizationDays: 0,
          stabilizationWindowDays: 40,
          dailyChangeLimitKcal: 25,
          fallbackReason: 'Insufficient weight coverage',
          observedWeightDays: 1,
          weightObservationSpanDays: 0,
        }}
      />
    );
    expect(screen.getByText(/Status: Formula fallback/)).toBeInTheDocument();
    expect(screen.getByText(/Weight Logs/)).toHaveTextContent(
      '2+ measured days spanning 7+ days'
    );
    expect(
      screen.getByText(/Calorie Logs for TDEE calculation/)
    ).toHaveTextContent('14+ days');
    expect(screen.getByText(/Observed weights:/)).toHaveTextContent(
      '1 measured days spanning 0 days'
    );
    expect(
      screen.getByText(
        /No learned evidence currently contributes to this baseline/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/raw calculation of.*bypassed/)).toBeNull();
  });

  it('does not present under-logged intake as inflating expenditure', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        adaptiveTdeeData={{ ...boundedData(), confidence: 'LOW' }}
      />
    );
    expect(screen.getByText(/Under-logging intake/i)).toHaveTextContent(
      /too low/i
    );
  });

  it('explains the need for a new complete observed period even when both checklist counts are met', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          insufficientHistory: true,
        }}
        adaptiveTdeeData={{
          tdee: 2160,
          confidence: 'LOW',
          weightTrendMethod: 'bounded_daily',
          isFallback: true,
          estimateStatus: 'fallback',
          stabilizationDays: 0,
          stabilizationWindowDays: 40,
          dailyChangeLimitKcal: 25,
          daysOfData: 14,
          observedWeightDays: 2,
          weightObservationSpanDays: 7,
          fallbackReason:
            'Insufficient overlapping history: the latest observed period needs 14 qualifying calorie days',
        }}
      />
    );
    expect(screen.getByText('✓ Met (14/14 days logged)')).toBeInTheDocument();
    expect(screen.getByText('✓ Met')).toBeInTheDocument();
    expect(
      screen.getAllByText(
        /latest weight-observation period.*14.*new completed weight day/i
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/❌ Missing/)).toBeNull();
  });
});

const mockUsePreferences = jest.fn();
const mockT = jest.fn(
  (
    key: string,
    defaultValueOrOptions?: string | Record<string, unknown>,
    values?: Record<string, unknown>
  ) => {
    const localizedLabels: Record<string, string> = {
      'calculationSettings.bmrAlgorithmOptions.mifflinStJeor':
        'Localized Mifflin',
      'calculationSettings.bodyFatAlgorithmOptions.usNavy': 'Localized Navy',
      'settings.goalMode.modeNames.leanBulk': 'Localized Lean Bulk',
      'settings.goalMode.modeNames.manual': 'Localized Manual',
      'settings.goalMode.modeNames.cut': 'Localized Cut',
    };
    if (key in localizedLabels) return localizedLabels[key];

    const defaultValue =
      typeof defaultValueOrOptions === 'string'
        ? defaultValueOrOptions
        : defaultValueOrOptions?.['defaultValue'];
    const interpolationValues =
      typeof defaultValueOrOptions === 'string'
        ? values
        : defaultValueOrOptions;

    if (typeof defaultValue !== 'string') return key;
    return defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
      String(interpolationValues?.[name] ?? `{{${name}}}`)
    );
  }
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (...args: Parameters<typeof mockT>) => mockT(...args),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => mockUsePreferences(),
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
  bodyFatAlgorithm: 'U.S. Navy',
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

beforeEach(() => {
  mockT.mockClear();
  mockUsePreferences.mockReturnValue({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    weightUnit: 'kg',
  });
});

describe('CalorieTargetBreakdown weekly weight goal', () => {
  it.each([
    { weightUnit: 'lbs', kg: -0.5, rate: '-1.102 lbs / week' },
    { weightUnit: 'st_lbs', kg: -0.5, rate: '-0 st 1.102 lbs / week' },
    { weightUnit: 'lbs', kg: 0.5, rate: '+1.102 lbs / week' },
    { weightUnit: 'st_lbs', kg: 0.5, rate: '+0 st 1.102 lbs / week' },
    { weightUnit: 'st_lbs', kg: 0, rate: '0 st 0 lbs / week' },
    { weightUnit: 'kg', kg: -0.25, rate: '-0.25 kg / week' },
  ])(
    'shows a $weightUnit weekly target of $kg kg using the preferred weight unit',
    ({ weightUnit, kg, rate }) => {
      mockUsePreferences.mockReturnValue({
        energyUnit: 'kcal',
        convertEnergy: (value: number) => value,
        weightUnit,
      });
      render(
        <CalorieTargetBreakdown
          {...defaultProps}
          goalMode="weekly"
          goalModeWeeklyChangeKg={kg}
        />
      );

      expect(screen.getByText(/Weekly weight change/)).toHaveTextContent(rate);
    }
  );

  it('explains safety-floor clamping for weekly goals using the manual baseline', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        goalMode="weekly"
        goalModeCalculationMethod="manual"
        goalModeWeeklyChangeKg={-2}
        previewResult={{
          ...defaultProps.previewResult,
          target: 480,
          finalTarget: 1800,
          appliedDeficit: 1714,
          wasClampedToFloor: true,
          clampedFloorSource: 'rmr',
        }}
      />
    );
    expect(
      screen.getByText(
        '⚠️ Daily budget was automatically raised to the safety-floor limit.'
      )
    ).toBeInTheDocument();
  });

  it('explains the weekly loss target as weight rather than a percentage', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        {...{ goalModeWeeklyChangeKg: -0.5 }}
        goalMode="weekly"
        previewResult={{
          ...defaultProps.previewResult,
          target: 1765,
          finalTarget: 1800,
          appliedDeficit: 429,
          projectedWeeklyChangeKg: -0.46,
          wasClampedToFloor: true,
          clampedFloorSource: 'rmr',
        }}
      />
    );

    expect(screen.getByText(/Weekly weight change Deficit/)).toHaveTextContent(
      '-0.5 kg / week'
    );
    expect(
      screen.queryByText(/Weekly weight change Deficit \(-0%\)/)
    ).toBeNull();
  });
});

describe('CalorieTargetBreakdown baseline label', () => {
  it('explains removal of historical activity before clamping the separate baseline', () => {
    const separateProps = {
      ...defaultProps,
      adaptiveActivitySeparate: true,
      adaptiveTdeeData: {
        ...defaultProps.adaptiveTdeeData,
        rawTdee: 2800,
        tdee: 2660,
        rawActivityAdjustedTdee: 2300,
        activityAdjustedTdee: 2300,
        averageActivityCalories: 500,
        activityDaysOfData: 28,
        wasClamped: true,
        clampMin: 1660,
        clampMax: 2660,
      },
      previewResult: {
        ...defaultProps.previewResult,
        baselineTdee: 2300,
        finalTarget: 2300,
      },
    };
    render(<CalorieTargetBreakdown {...separateProps} />);

    expect(screen.getByText(/2800 − 500 = 2300 kcal/)).toBeInTheDocument();
    expect(
      screen.getByText(/Today's steps and workouts are credited separately/)
    ).toBeInTheDocument();
    expect(screen.getByText(/28 days of activity history/)).toBeInTheDocument();
  });

  it('uses translation keys for algorithm labels', () => {
    render(<CalorieTargetBreakdown {...defaultProps} />);

    expect(screen.getByText('Localized Mifflin')).toBeInTheDocument();
    expect(screen.getByText('Localized Navy')).toBeInTheDocument();
  });

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
      screen.getByText(/Localized Lean Bulk Surplus \(\+10%\) = \+219 kcal/)
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
    expect(
      screen.getByText(/Localized Manual Surplus \(\+15%\)/)
    ).toBeInTheDocument();
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
      screen.getByText(/Localized Cut Deficit \(-15%\) = -329 kcal/)
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

describe('CalorieTargetBreakdown weight-trend units', () => {
  const trendProps = {
    ...defaultProps,
    adaptiveTdeeData: {
      tdee: 2585,
      isFallback: false,
      daysOfData: 28,
      avgIntake: 1971,
      weightTrend: 110.9,
      confidence: 'HIGH' as const,
      startWeightTrend: 114.6,
      endWeightTrend: 110.9,
      weightChangeKg: -3.72,
      daysInWindow: 28,
      dailyWeightChangeKg: -0.1328,
      weightChangeCalories: 797,
      rawTdee: 2768,
    },
  };

  it('prints the adaptive weight trend in kg by default', () => {
    const { container } = render(<CalorieTargetBreakdown {...trendProps} />);

    expect(
      screen.getByText(/114\.6 kg → 110\.9 kg \(-3\.72 kg over the 27 days/)
    ).toBeInTheDocument();
    expect(screen.getByText(/= -0\.1328 kg\/day/)).toBeInTheDocument();
    expect(
      screen.getByText(/Daily Weight Change in kg × 6000 kcal\/kg/)
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\{\{/);
  });

  it('prints the adaptive weight trend in pounds when that unit is configured', () => {
    mockUsePreferences.mockReturnValue({
      energyUnit: 'kcal',
      convertEnergy: (value: number) => value,
      weightUnit: 'lbs',
    });

    const { container } = render(<CalorieTargetBreakdown {...trendProps} />);

    expect(
      screen.getByText(/252\.6 lbs → 244\.5 lbs \(-8\.20 lbs over the 27 days/)
    ).toBeInTheDocument();
    expect(screen.getByText(/= -0\.2928 lbs\/day/)).toBeInTheDocument();
    expect(
      screen.getByText(/Daily Weight Change in lbs × 2722 kcal\/lbs/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/114\.6 kg → 110\.9 kg/)).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\{\{/);

    const formulaVars = mockT.mock.calls.find(
      ([key]) => key === 'settings.breakdown.adaptiveFormula'
    )?.[1] as Record<string, unknown>;
    const explainerVars = mockT.mock.calls.find(
      ([key]) => key === 'settings.breakdown.adaptiveFormulaExplainer'
    )?.[1] as Record<string, unknown>;
    // de/es/ru still say "kg" with {{kcalPerKg}}; the per-lb figure belongs
    // only on kcalPerUnit, which English interpolates with massUnit.
    expect(formulaVars['kcalPerKg']).toBe(6000);
    expect(formulaVars['kcalPerUnit']).toBe(2722);
    expect(explainerVars['kcalPerKg']).toBe(6000);
    expect(explainerVars['kcalPerUnit']).toBe(2722);
    expect(explainerVars['fatPerKg']).toBe((9441).toLocaleString());
    expect(explainerVars['leanPerKg']).toBe((1816).toLocaleString());
  });

  it('prints stones-configured trends in pounds so the energy working stays a usable figure', () => {
    mockUsePreferences.mockReturnValue({
      energyUnit: 'kcal',
      convertEnergy: (value: number) => value,
      weightUnit: 'st_lbs',
    });

    const { container } = render(<CalorieTargetBreakdown {...trendProps} />);

    expect(
      screen.getByText(/252\.6 lbs → 244\.5 lbs \(-8\.20 lbs over the 27 days/)
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\{\{/);
  });
});

describe('CalorieTargetBreakdown adaptive checklist', () => {
  const renderFallback = (daysOfData: number, fallbackReason: string) =>
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        previewResult={{
          ...defaultProps.previewResult,
          insufficientHistory: true,
        }}
        adaptiveTdeeData={{
          tdee: 0,
          isFallback: true,
          fallbackReason,
          daysOfData,
        }}
      />
    );

  it('shows the real calorie-day count as met when only the weight rule fails (#3142)', () => {
    renderFallback(14, 'Insufficient weight entries (need at least 2)');
    expect(screen.getByText('✓ Met (14/14 days logged)')).toBeInTheDocument();
  });

  it('does not mark the calorie rule met below the required days', () => {
    renderFallback(3, 'Weight entries span less than 7 days');
    expect(
      screen.getByText('❌ Missing (3/14 days logged)')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Met \(3\/14/)).not.toBeInTheDocument();
  });
});

describe('CalorieTargetBreakdown numbered steps', () => {
  it('starts open when asked, and closed otherwise', () => {
    const { container, rerender } = render(
      <CalorieTargetBreakdown {...defaultProps} defaultOpen />
    );
    expect(container.querySelector('details')).toHaveAttribute('open');
    rerender(<CalorieTargetBreakdown {...defaultProps} />);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
  });

  it('shows each step as a row with its tag and result, working inside', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        goalModeCalculationMethod="manual"
      />
    );

    expect(screen.queryByTestId('breakdown-step-adaptive')).toBeNull();
    expect(screen.getByTestId('breakdown-step-bmr')).toHaveTextContent(
      /^1Resting metabolism \(BMR\)Localized Mifflin1800 kcal/
    );
    expect(screen.getByTestId('breakdown-step-goal')).toHaveTextContent(
      /^3Daily calorie goal.*2194 kcal/
    );
    // The full working is still there, inside the row.
    expect(
      screen.getByText(/Resting Metabolism \(RMR\/BMR\):/)
    ).toBeInTheDocument();
  });

  it('numbers the goal step 4 when adaptive TDEE is a step', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        goalModeCalculationMethod="adaptive"
      />
    );
    expect(screen.getByTestId('breakdown-step-adaptive')).toHaveTextContent(
      /^3Adaptive TDEE \(expenditure\)Adaptive TDEE2194 kcal/
    );
    expect(screen.getByTestId('breakdown-step-goal')).toHaveTextContent(
      /^4Daily calorie goal/
    );
  });
});

describe('CalorieTargetBreakdown calorie cycling', () => {
  it('adds the cycling step and ends on the cycled target', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        calorieCycling={{
          status: 'active',
          baseTarget: 2194,
          target: 1994,
          delta: -200,
          dayType: 'low',
          floor: 1800,
          clampedToFloor: false,
        }}
      />
    );

    expect(screen.getByTestId('calorie-cycling-step')).toHaveTextContent(
      'Calorie cycling (low day):−200'
    );
    expect(
      screen.getByText(/Final Energy Budget Target/).parentElement
    ).toHaveTextContent('1994');
  });

  it('says why cycling is paused', () => {
    render(
      <CalorieTargetBreakdown
        {...defaultProps}
        calorieCycling={{
          status: 'paused_weekly_plan',
          baseTarget: 2194,
          target: 2194,
          delta: 0,
          dayType: 'even',
          floor: 1800,
          clampedToFloor: false,
        }}
      />
    );

    expect(
      screen.getByText(/a weekly goal plan sets this day/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('calorie-cycling-step')).toBeNull();
  });
});
