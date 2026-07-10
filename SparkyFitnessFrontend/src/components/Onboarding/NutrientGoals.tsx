import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import {
  convertMlToSelectedUnit,
  convertSelectedUnitToMl,
} from '@/utils/nutritionCalculations';
import { useTranslation } from 'react-i18next';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { ExpandedGoals } from '@/types/goals';
import { MealPercentages } from '@/types/meal';
import MealPercentageManager from '../MealPercentageManager';

interface NutrientField {
  key: string;
  labelKey: string;
  unitKey: string;
  decimals: 0 | 1;
  caloriesPerGram?: 4 | 9;
  highlighted?: boolean;
}

interface NutrientSection {
  titleKey: string;
  fields: readonly NutrientField[];
}

const NUTRIENT_SECTIONS: readonly NutrientSection[] = [
  {
    titleKey: 'onboarding.nutrientGoalsDailyMacros',
    fields: [
      {
        key: 'carbs',
        labelKey: 'onboarding.nutrientGoalsCarbohydrates',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
        caloriesPerGram: 4,
      },
      {
        key: 'protein',
        labelKey: 'onboarding.nutrientGoalsProtein',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
        caloriesPerGram: 4,
      },
      {
        key: 'fat',
        labelKey: 'onboarding.nutrientGoalsFat',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
        caloriesPerGram: 9,
      },
      {
        key: 'dietary_fiber',
        labelKey: 'onboarding.nutrientGoalsFiber',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
        highlighted: true,
      },
    ],
  },
  {
    titleKey: 'onboarding.nutrientGoalsFatBreakdown',
    fields: [
      {
        key: 'saturated_fat',
        labelKey: 'onboarding.nutrientGoalsSaturatedFat',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
      },
      {
        key: 'trans_fat',
        labelKey: 'onboarding.nutrientGoalsTransFat',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
      },
      {
        key: 'polyunsaturated_fat',
        labelKey: 'onboarding.nutrientGoalsPolyunsaturatedFat',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
      },
      {
        key: 'monounsaturated_fat',
        labelKey: 'onboarding.nutrientGoalsMonounsaturatedFat',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
      },
    ],
  },
  {
    titleKey: 'onboarding.nutrientGoalsMinerals',
    fields: [
      {
        key: 'cholesterol',
        labelKey: 'onboarding.nutrientGoalsCholesterol',
        unitKey: 'onboarding.nutrientGoalsMilligramUnit',
        decimals: 0,
      },
      {
        key: 'sodium',
        labelKey: 'onboarding.nutrientGoalsSodium',
        unitKey: 'onboarding.nutrientGoalsMilligramUnit',
        decimals: 0,
      },
      {
        key: 'potassium',
        labelKey: 'onboarding.nutrientGoalsPotassium',
        unitKey: 'onboarding.nutrientGoalsMilligramUnit',
        decimals: 0,
      },
      {
        key: 'calcium',
        labelKey: 'onboarding.nutrientGoalsCalcium',
        unitKey: 'onboarding.nutrientGoalsMilligramUnit',
        decimals: 0,
      },
      {
        key: 'iron',
        labelKey: 'onboarding.nutrientGoalsIron',
        unitKey: 'onboarding.nutrientGoalsMilligramUnit',
        decimals: 1,
      },
    ],
  },
  {
    titleKey: 'onboarding.nutrientGoalsSugarsVitamins',
    fields: [
      {
        key: 'sugars',
        labelKey: 'onboarding.nutrientGoalsSugar',
        unitKey: 'onboarding.nutrientGoalsGramUnit',
        decimals: 1,
      },
      {
        key: 'vitamin_a',
        labelKey: 'onboarding.nutrientGoalsVitaminA',
        unitKey: 'onboarding.nutrientGoalsMicrogramUnit',
        decimals: 0,
      },
      {
        key: 'vitamin_c',
        labelKey: 'onboarding.nutrientGoalsVitaminC',
        unitKey: 'onboarding.nutrientGoalsMilligramUnit',
        decimals: 1,
      },
    ],
  },
];

const WATER_UNITS = [
  { value: 'ml', labelKey: 'onboarding.nutrientGoalsWaterUnitMl' },
  { value: 'oz', labelKey: 'onboarding.nutrientGoalsWaterUnitOz' },
  { value: 'liter', labelKey: 'onboarding.nutrientGoalsWaterUnitLiter' },
] as const;

export interface NutrientGoalsProps {
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  editedPlan: ExpandedGoals | null;
  handlePercentagesChange: (newPercentages: MealPercentages) => void;
  localEnergyUnit: 'kcal' | 'kJ';
  localWaterUnit: 'ml' | 'oz' | 'liter';
  memoizedInitialPercentages: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snacks: number;
  };
  setEditedPlan: React.Dispatch<React.SetStateAction<ExpandedGoals | null>>;
  setLocalWaterUnit: React.Dispatch<
    React.SetStateAction<'ml' | 'oz' | 'liter'>
  >;
}

export const NutrientGoals = ({
  convertEnergy,
  editedPlan,
  handlePercentagesChange,
  localEnergyUnit,
  localWaterUnit,
  memoizedInitialPercentages,
  setEditedPlan,
  setLocalWaterUnit,
}: NutrientGoalsProps) => {
  const { t } = useTranslation();
  const { data: customNutrients } = useCustomNutrients();

  const updatePlanValue = (key: string, value: number) => {
    setEditedPlan((previous) =>
      previous ? { ...previous, [key]: value } : null
    );
  };

  const getMacroPercentage = (field: NutrientField): number => {
    if (!field.caloriesPerGram || !editedPlan?.calories) return 0;

    const caloriesInKcal = convertEnergy(
      editedPlan.calories,
      localEnergyUnit,
      'kcal'
    );
    const adjustedCalories =
      caloriesInKcal - Number(editedPlan.dietary_fiber || 0) * 2;
    if (adjustedCalories <= 0) return 0;

    const amount = Number(editedPlan[field.key] ?? 0);
    return Math.round(
      ((amount * field.caloriesPerGram) / adjustedCalories) * 100
    );
  };

  return (
    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {NUTRIENT_SECTIONS.map((section) => (
        <section
          key={section.titleKey}
          className="overflow-hidden rounded-2xl border border-border bg-card"
          aria-labelledby={`${section.titleKey}-heading`}
        >
          <div className="border-b border-border bg-muted px-4 py-3">
            <h3
              id={`${section.titleKey}-heading`}
              className="text-sm font-bold text-foreground"
            >
              {t(section.titleKey)}
            </h3>
          </div>
          <Table>
            <TableBody>
              {section.fields.map((field) => {
                const label = t(field.labelKey);
                const inputId = `nutrient-goal-${field.key}`;
                const displayLabel = field.caloriesPerGram
                  ? t('onboarding.nutrientGoalsLabelWithPercentage', {
                      label,
                      percentage: getMacroPercentage(field),
                    })
                  : label;

                return (
                  <TableRow
                    key={field.key}
                    className={`border-border hover:bg-transparent ${field.highlighted ? 'bg-muted/40' : ''}`}
                  >
                    <TableCell className="text-sm font-medium text-muted-foreground">
                      <label htmlFor={inputId}>{displayLabel}</label>
                    </TableCell>
                    <TableCell className="text-end font-bold text-foreground">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={field.decimals === 0 ? 1 : 0.1}
                          value={Number(editedPlan?.[field.key] ?? 0).toFixed(
                            field.decimals
                          )}
                          onChange={(event) =>
                            updatePlanValue(
                              field.key,
                              Number(event.target.value)
                            )
                          }
                          className="h-8 w-20 bg-transparent text-end text-sm"
                          dir="ltr"
                          aria-label={label}
                        />
                        <span className="text-sm font-normal">
                          {t(field.unitKey)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ))}

      {customNutrients && customNutrients.length > 0 && (
        <section
          className="overflow-hidden rounded-2xl border border-border bg-card"
          aria-labelledby="custom-nutrient-goals-heading"
        >
          <div className="border-b border-border bg-muted px-4 py-3">
            <h3
              id="custom-nutrient-goals-heading"
              className="text-sm font-bold text-foreground"
            >
              {t('onboarding.nutrientGoalsCustom')}
            </h3>
          </div>
          <Table>
            <TableBody>
              {customNutrients.map((nutrient) => {
                const inputId = `custom-nutrient-goal-${nutrient.id}`;
                return (
                  <TableRow
                    key={nutrient.id}
                    className="border-border hover:bg-transparent"
                  >
                    <TableCell className="text-sm font-medium text-muted-foreground">
                      <label htmlFor={inputId}>{nutrient.name}</label>
                    </TableCell>
                    <TableCell className="text-end font-bold text-foreground">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={0.1}
                          value={Number(
                            editedPlan?.[nutrient.name] ?? 0
                          ).toFixed(1)}
                          onChange={(event) =>
                            updatePlanValue(
                              nutrient.name,
                              Number(event.target.value)
                            )
                          }
                          className="h-8 w-20 bg-transparent text-end text-sm"
                          dir="ltr"
                          aria-label={nutrient.name}
                        />
                        <span className="text-sm font-normal">
                          {nutrient.unit}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      )}

      <section
        className="overflow-hidden rounded-2xl border border-border bg-card"
        aria-labelledby="hydration-exercise-goals-heading"
      >
        <div className="border-b border-border bg-muted px-4 py-3">
          <h3
            id="hydration-exercise-goals-heading"
            className="text-sm font-bold text-foreground"
          >
            {t('onboarding.nutrientGoalsHydrationExercise')}
          </h3>
        </div>
        <div
          className="flex justify-center gap-2 border-b border-border p-3"
          role="group"
          aria-label={t('onboarding.nutrientGoalsWaterUnitLabel')}
        >
          {WATER_UNITS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocalWaterUnit(value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                localWaterUnit === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={localWaterUnit === value}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <Table>
          <TableBody>
            <TableRow className="border-border hover:bg-transparent">
              <TableCell className="text-sm font-medium text-muted-foreground">
                <label htmlFor="nutrient-goal-water">
                  {t('onboarding.nutrientGoalsWaterGoal')}
                </label>
              </TableCell>
              <TableCell className="text-end font-bold text-foreground">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    id="nutrient-goal-water"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.1}
                    value={
                      editedPlan?.water_goal_ml
                        ? convertMlToSelectedUnit(
                            editedPlan.water_goal_ml,
                            localWaterUnit
                          ).toFixed(1)
                        : ''
                    }
                    onChange={(event) =>
                      updatePlanValue(
                        'water_goal_ml',
                        convertSelectedUnitToMl(
                          Number(event.target.value),
                          localWaterUnit
                        )
                      )
                    }
                    className="h-8 w-20 bg-transparent text-end text-sm"
                    dir="ltr"
                    aria-label={t('onboarding.nutrientGoalsWaterGoal')}
                  />
                  <span className="text-xs font-normal">
                    {t(
                      WATER_UNITS.find(({ value }) => value === localWaterUnit)
                        ?.labelKey ?? 'onboarding.nutrientGoalsWaterUnitMl'
                    )}
                  </span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-border hover:bg-transparent">
              <TableCell className="text-sm font-medium text-muted-foreground">
                <label htmlFor="nutrient-goal-exercise-duration">
                  {t('onboarding.nutrientGoalsExerciseDuration')}
                </label>
              </TableCell>
              <TableCell className="text-end font-bold text-foreground">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    id="nutrient-goal-exercise-duration"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={editedPlan?.target_exercise_duration_minutes ?? ''}
                    onChange={(event) =>
                      updatePlanValue(
                        'target_exercise_duration_minutes',
                        Number(event.target.value)
                      )
                    }
                    className="h-8 w-20 bg-transparent text-end text-sm"
                    dir="ltr"
                    aria-label={t('onboarding.nutrientGoalsExerciseDuration')}
                  />
                  <span className="text-sm font-normal">
                    {t('onboarding.nutrientGoalsMinuteUnit')}
                  </span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-none hover:bg-transparent">
              <TableCell className="text-sm font-medium text-muted-foreground">
                <label htmlFor="nutrient-goal-exercise-calories">
                  {t('onboarding.nutrientGoalsExerciseCalories')}
                </label>
              </TableCell>
              <TableCell className="text-end font-bold text-foreground">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    id="nutrient-goal-exercise-calories"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={editedPlan?.target_exercise_calories_burned ?? ''}
                    onChange={(event) =>
                      updatePlanValue(
                        'target_exercise_calories_burned',
                        Number(event.target.value)
                      )
                    }
                    className="h-8 w-20 bg-transparent text-end text-sm"
                    dir="ltr"
                    aria-label={t('onboarding.nutrientGoalsExerciseCalories')}
                  />
                  <span className="text-sm font-normal">
                    {t('onboarding.nutrientGoalsKcalUnit')}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      <section
        className="overflow-hidden rounded-2xl border border-border bg-card"
        aria-labelledby="meal-calorie-distribution-heading"
      >
        <div className="border-b border-border bg-muted px-4 py-3">
          <h3
            id="meal-calorie-distribution-heading"
            className="text-sm font-bold text-foreground"
          >
            {t('onboarding.nutrientGoalsMealDistribution')}
          </h3>
        </div>
        <div className="p-4">
          <MealPercentageManager
            initialPercentages={memoizedInitialPercentages}
            totalCalories={editedPlan?.calories || 2000}
            onPercentagesChange={handlePercentagesChange}
          />
        </div>
      </section>
    </div>
  );
};
