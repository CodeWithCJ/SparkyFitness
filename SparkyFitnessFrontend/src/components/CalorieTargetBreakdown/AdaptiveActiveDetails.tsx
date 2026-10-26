import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  ENERGY_DENSITY_KCAL_PER_KG,
  ADAPTIVE_TDEE_CLAMP_KCAL,
} from '@workspace/shared';
import type { AdaptiveTdeeData } from './types';
import { useAdaptiveDisplay } from './useAdaptiveDisplay';
import { useTrendUnits } from './useTrendUnits';

interface AdaptiveActiveDetailsProps {
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  activityMultiplier: number;
}

export const AdaptiveActiveDetails = ({
  adaptiveTdeeData,
  activityMultiplier,
}: AdaptiveActiveDetailsProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const { trendMassUnit, kcalPerTrendUnit, toTrendMass } = useTrendUnits();
  const { displayAdaptiveIntake, displayAdaptiveDelta, adaptiveDeltaText } =
    useAdaptiveDisplay(adaptiveTdeeData);

  return (
    <div className="space-y-1 mt-1">
      <p>
        {t(
          'diary.calculateExplanation.adaptiveActiveStatus',
          'Status: Active (calculated baseline from logs).'
        )}
        {adaptiveTdeeData?.confidence && (
          <>
            {' '}
            <span
              className={
                adaptiveTdeeData.confidence === 'HIGH'
                  ? 'font-medium text-green-600 dark:text-green-400'
                  : adaptiveTdeeData.confidence === 'MEDIUM'
                    ? 'font-medium text-amber-600 dark:text-amber-400'
                    : 'font-medium text-red-600 dark:text-red-400'
              }
            >
              {t(
                'settings.calorieBreakdown.confidence',
                'Confidence: {{level}}',
                { level: adaptiveTdeeData.confidence }
              )}
            </span>
          </>
        )}
      </p>
      {(adaptiveTdeeData?.confidence === 'LOW' ||
        adaptiveTdeeData?.confidence === 'MEDIUM') && (
        // Only on an explicit downgrade. The server lowers confidence for
        // sparse logs, short tracking history, or weight gaps; adaptive TDEE
        // infers expenditure from intake vs weight trend, so under-logging
        // inflates the result and the target should not be presented as firm.
        // A missing confidence is not a downgrade -- warning there would
        // nag about "0 day(s)" on a server that simply did not report it.
        <p className="text-xs text-muted-foreground">
          {t(
            'settings.calorieBreakdown.adaptiveConfidenceCaveat',
            'Based on {{days}} day(s) of calorie logs. Under-logging intake makes this estimate read high — log consistently to improve it.',
            { days: adaptiveTdeeData?.daysOfData ?? 0 }
          )}
        </p>
      )}
      <ul className="list-disc pl-4 space-y-0.5 text-sm">
        <li>
          {t(
            'diary.calculateExplanation.averageDailyCalorieIntake',
            'Average daily calorie intake: {{displayAdaptiveIntake}} {{energyUnitString}}',
            {
              displayAdaptiveIntake,
              energyUnitString: getEnergyUnitString(energyUnit),
            }
          )}
          {adaptiveTdeeData?.windowStartDate &&
            adaptiveTdeeData?.windowEndDate && (
              // The average covers only days that were actually logged,
              // not every day in the window — days under 200 kcal are
              // skipped rather than counted as zero. Saying so is what
              // makes the "under-logging reads high" caveat make sense.
              <span className="text-muted-foreground">
                {' '}
                {t(
                  'diary.calculateExplanation.intakeWindow',
                  '(mean of {{logged}} logged days between {{start}} and {{end}}; days under 200 kcal are excluded, not counted as zero)',
                  {
                    logged: adaptiveTdeeData?.daysOfData ?? 0,
                    start: adaptiveTdeeData.windowStartDate,
                    end: adaptiveTdeeData.windowEndDate,
                  }
                )}
              </span>
            )}
        </li>
        {typeof adaptiveTdeeData?.weightChangeCalories === 'number' && (
          <li>
            {t('diary.calculateExplanation.weightTrendTerm', {
              defaultValue:
                'Weight trend: {{start}} → {{end}} ({{change}} over the {{days}} days between the window’s first and last day) = {{daily}} {{massUnit}}/day — 7-day averages of your logged weights, not the readings themselves, with missing days filled in between the ones either side',
              start: `${toTrendMass(
                adaptiveTdeeData.startWeightTrend ?? 0
              ).toFixed(1)} ${trendMassUnit}`,
              end: `${toTrendMass(adaptiveTdeeData.endWeightTrend ?? 0).toFixed(
                1
              )} ${trendMassUnit}`,
              change: `${toTrendMass(
                adaptiveTdeeData.weightChangeKg ?? 0
              ).toFixed(2)} ${trendMassUnit}`,
              days: Math.max(0, (adaptiveTdeeData.daysInWindow ?? 0) - 1),
              daily: toTrendMass(
                adaptiveTdeeData.dailyWeightChangeKg ?? 0
              ).toFixed(4),
              unit: trendMassUnit,
              massUnit: trendMassUnit,
            })}
          </li>
        )}
        {typeof adaptiveTdeeData?.weightChangeCalories === 'number' && (
          <li>
            {t('diary.calculateExplanation.weightTrendCalories', {
              defaultValue:
                'Energy from that trend: −({{daily}} {{massUnit}}/day × {{kcalPerUnit}} kcal/{{massUnit}}) ≈ {{value}}',
              daily: toTrendMass(
                adaptiveTdeeData.dailyWeightChangeKg ?? 0
              ).toFixed(4),
              kcalPerKg: ENERGY_DENSITY_KCAL_PER_KG,
              kcalPerUnit: kcalPerTrendUnit,
              unit: trendMassUnit,
              massUnit: trendMassUnit,
              // Negated on purpose. The server computes
              // rawTdee = avgIntake − dailyWeightChange × 6000, so the
              // term added to intake is minus the product of the two
              // factors printed here. Without the sign the line reads
              // '−0.0185 × 6000 = +111', which is the wrong number in
              // the one panel built for checking the arithmetic.
              // Approximate, deliberately. The intake and the total
              // are each rounded on their own, so the difference
              // between them can sit a kcal away from what the
              // rounded daily rate multiplies out to. The sum line
              // below is the one that has to reconcile exactly, and
              // it does; claiming '=' here would be the false half.
              // Evaluated against the kcal constant so the equation
              // reproduces, with the converted figure appended when the
              // viewer reads another unit. The energy densities are
              // reference values from the literature — restating them as
              // 25,104 kJ/kg would make the sum work and the citation
              // unrecognisable.
              value: adaptiveDeltaText,
            })}
          </li>
        )}
        <li>
          {t(
            'diary.calculateExplanation.calculatedExpenditureTDEE',
            'Calculated Expenditure (TDEE): {{energy}} {{energyUnitString}}',
            {
              energy: Math.round(
                convertEnergy(adaptiveTdeeData?.tdee || 0, 'kcal', energyUnit)
              ),
              energyUnitString: getEnergyUnitString(energyUnit),
            }
          )}
          {typeof adaptiveTdeeData?.weightChangeCalories === 'number' &&
            !adaptiveTdeeData?.wasClamped && (
              <span className="text-muted-foreground">
                {' '}
                {t(
                  'diary.calculateExplanation.tdeeSum',
                  '({{intake}} {{sign}} {{delta}})',
                  {
                    intake: displayAdaptiveIntake,
                    sign: displayAdaptiveDelta < 0 ? '−' : '+',
                    delta: Math.abs(displayAdaptiveDelta),
                  }
                )}
              </span>
            )}
        </li>
      </ul>
      {typeof adaptiveTdeeData?.clampMin === 'number' &&
        typeof adaptiveTdeeData?.clampMax === 'number' &&
        !adaptiveTdeeData?.wasClamped && (
          // Stated even when it does not bite: the band is set by the
          // activity level, and a user whose expenditure is being held
          // down has no way to discover that unless the limits are
          // visible before they start clipping.
          <p className="text-xs text-muted-foreground">
            {t(
              'diary.calculateExplanation.adaptivePlausibilityBand',
              'Plausibility limits from your activity level (×{{multiplier}}): {{min}}–{{max}} {{unit}}. The estimate is inside this range, so it is used as calculated.',
              {
                multiplier: activityMultiplier.toFixed(3),
                min: Math.round(
                  convertEnergy(adaptiveTdeeData.clampMin, 'kcal', energyUnit)
                ),
                max: Math.round(
                  convertEnergy(adaptiveTdeeData.clampMax, 'kcal', energyUnit)
                ),
                unit: getEnergyUnitString(energyUnit),
              }
            )}
          </p>
        )}
      {adaptiveTdeeData?.wasClamped && (
        // Without this the arithmetic above simply would not add up to
        // the number shown, which is exactly the "my TDEE moved and I
        // cannot see why" confusion this panel exists to prevent.
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {t(
            'diary.calculateExplanation.adaptiveClamped',
            'Raw estimate of {{raw}} {{unit}} was capped to {{capped}} {{unit}}, the plausibility limit of ±{{band}} {{unit}} around your BMR-based estimate ({{min}}–{{max}} {{unit}}).',
            {
              // The band is defined in kcal; printing a bare 500 beside
              // converted bounds claimed a range 4x narrower than the one
              // shown next to it.
              band: Math.round(
                convertEnergy(ADAPTIVE_TDEE_CLAMP_KCAL, 'kcal', energyUnit)
              ),
              raw: Math.round(
                convertEnergy(
                  adaptiveTdeeData?.rawTdee || 0,
                  'kcal',
                  energyUnit
                )
              ),
              capped: Math.round(
                convertEnergy(adaptiveTdeeData?.tdee || 0, 'kcal', energyUnit)
              ),
              min: Math.round(
                convertEnergy(
                  adaptiveTdeeData?.clampMin || 0,
                  'kcal',
                  energyUnit
                )
              ),
              max: Math.round(
                convertEnergy(
                  adaptiveTdeeData?.clampMax || 0,
                  'kcal',
                  energyUnit
                )
              ),
              unit: getEnergyUnitString(energyUnit),
            }
          )}
        </p>
      )}
    </div>
  );
};
