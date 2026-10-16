import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import GoalPresetsSection from '../components/GoalPresetsSection';
import WeeklyGoalPlansSection from '../components/WeeklyGoalPlansSection';
import MealDistributionEditor from '../components/MealDistributionEditor';
import NutrientDirectionGuide from '../components/NutrientDirectionGuide';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import {
  useMealTypes,
  useProfile,
  useServerConnection,
  usePreferences,
} from '../hooks';
import type { MealType } from '../types/mealTypes';
import { useLatestMeasurementsOnOrBefore } from '../hooks/useMeasurements';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import {
  useAdjustedCalorieGoal,
  useGoalPresetMutations,
  useGoalPresets,
  useGoalsQuery,
  useNutrientGoalPreferences,
  useSaveGoalsMutation,
  useWeeklyGoalPlans,
  useSaveNutrientGoalPreferences,
} from '../hooks/useGoals';
import type {
  NutrientGoalPreferences,
  NutrientGoalType,
} from '../services/api/nutrientGoalPreferencesApi';
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import {
  AddedSugarAlgorithm,
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  calculateAge,
  calculateSingleNutrientAutoValue,
  getAutoCalculateFamily,
  type AlgorithmBundle,
  type UserNutrientData,
} from '@workspace/shared';
import type { DailyGoals, GoalPreset } from '../types/goals';
import {
  DIRECTION_COLORS,
  NUTRIENT_DIRECTION_GUIDES,
  buildGuideDirections,
  type NutrientDirectionGuideKey,
} from '../constants/nutrientDirectionGuides';
import type { MealPercentages } from '../utils/mealDistribution';
import type { RootStackScreenProps } from '../types/navigation';
import { getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import {
  WATER_UNIT_LABELS,
  volumeFromMl,
  volumeToMl,
} from '../utils/unitConversions';

type GoalsScreenProps = RootStackScreenProps<'Goals'>;

type NutrientGoalField =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'dietary_fiber'
  | 'saturated_fat'
  | 'polyunsaturated_fat'
  | 'monounsaturated_fat'
  | 'trans_fat'
  | 'cholesterol'
  | 'sodium'
  | 'potassium'
  | 'sugars'
  | 'vitamin_a'
  | 'vitamin_c'
  | 'calcium'
  | 'iron'
  | 'caffeine_mg'
  | 'alcohol_g';

type OtherGoalField =
  | 'water_goal_ml'
  | 'target_exercise_calories_burned'
  | 'target_exercise_duration_minutes'
  | 'target_steps';

type GoalField = NutrientGoalField | OtherGoalField;

const MACRO_FIELDS: NutrientGoalField[] = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
];

const OTHER_NUTRIENT_FIELDS: NutrientGoalField[] = [
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
  'caffeine_mg',
  'alcohol_g',
];

const OTHER_FIELDS: OtherGoalField[] = [
  'water_goal_ml',
  'target_exercise_calories_burned',
  'target_exercise_duration_minutes',
  'target_steps',
];

const ALL_FIELDS: GoalField[] = [
  ...MACRO_FIELDS,
  ...OTHER_NUTRIENT_FIELDS,
  ...OTHER_FIELDS,
];

const toDrafts = (
  goals: DailyGoals,
  waterUnit: string
): Record<GoalField, string> => {
  const drafts = Object.fromEntries(
    ALL_FIELDS.map((field) => [field, String(goals[field] ?? 0)])
  ) as Record<GoalField, string>;
  // Water is stored in ml; the field is edited in the user's water unit.
  drafts.water_goal_ml = String(
    Number(volumeFromMl(goals.water_goal_ml ?? 0, waterUnit).toFixed(2))
  );
  return drafts;
};

const parseDraft = (text: string): number => Number(text.replace(',', '.'));

// Custom nutrient goals are stored by nutrient name; an unset goal is edited
// as an empty field rather than 0.
const toCustomDrafts = (goals: DailyGoals): Record<string, string> =>
  Object.fromEntries(
    Object.entries(goals.custom_nutrients ?? {}).map(([name, value]) => [
      name,
      String(value),
    ])
  );

// The four built-in meals keep their own goal columns; any other meal type
// lives in custom_meal_percentages, keyed by its lowercase name.
const DEFAULT_MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'];

const mealKey = (name: string): string => name.toLowerCase();

const getMealPercentage = (goals: DailyGoals, key: string): number => {
  const custom = goals.custom_meal_percentages;
  if (custom && key in custom) return custom[key] ?? 0;
  const legacy = (goals as unknown as Record<string, unknown>)[
    `${key}_percentage`
  ];
  return typeof legacy === 'number' ? legacy : 0;
};

// Keys a preset stores. Anything else on a goal row (ids, dates) stays out.
const PRESET_KEYS: (keyof DailyGoals)[] = [
  ...ALL_FIELDS,
  'protein_percentage',
  'carbs_percentage',
  'fat_percentage',
  'breakfast_percentage',
  'lunch_percentage',
  'dinner_percentage',
  'snacks_percentage',
  'custom_meal_percentages',
  'custom_nutrients',
];

const pickPresetValues = (goals: DailyGoals): DailyGoals =>
  Object.fromEntries(
    PRESET_KEYS.filter((key) => goals[key] !== undefined).map((key) => [
      key,
      goals[key],
    ])
  ) as unknown as DailyGoals;

const ACTIVITY_LEVELS = ['not_much', 'light', 'moderate', 'heavy'] as const;

const enumValue = <T extends string>(
  values: Record<string, T>,
  raw: string | undefined,
  fallback: T
): T => (Object.values(values).includes(raw as T) ? (raw as T) : fallback);

interface DirectionDraft {
  goalType: NutrientGoalType;
  min: string;
  max: string;
}

const NUTRIENT_DIRECTION_FIELDS: NutrientGoalField[] = [
  ...MACRO_FIELDS,
  ...OTHER_NUTRIENT_FIELDS,
];

const toDirectionDrafts = (
  directions: NutrientGoalPreferences
): Record<string, DirectionDraft> =>
  Object.fromEntries(
    NUTRIENT_DIRECTION_FIELDS.filter((field) => directions[field]).map(
      (field) => [
        field,
        {
          goalType: directions[field].goalType,
          min: String(directions[field].targetMin ?? ''),
          max: String(directions[field].targetMax ?? ''),
        },
      ]
    )
  );

interface GoalsFormProps {
  date: string;
  goals: DailyGoals;
  directions?: NutrientGoalPreferences;
  mealTypes: MealType[];
  /** Set when editing a goal preset (existing, or `{}`-less new) instead of today's goals. */
  preset?: GoalPreset | null;
  isPresetMode?: boolean;
  onDone: () => void;
  onEditPreset: (presetId?: string) => void;
  onEditPlan: (planId?: string) => void;
}

const GoalsForm: React.FC<GoalsFormProps> = ({
  date,
  goals,
  directions,
  mealTypes,
  preset = null,
  isPresetMode = false,
  onDone,
  onEditPreset,
  onEditPlan,
}) => {
  const [presetName, setPresetName] = useState(preset?.preset_name ?? '');
  const { t } = useTranslation();
  const { saveGoals, isPending: isSavingGoals } = useSaveGoalsMutation();
  const saveDirections = useSaveNutrientGoalPreferences();
  const [isSavingDirections, setIsSavingDirections] = useState(false);
  const isPending = isSavingGoals || isSavingDirections;
  const [initialDirections] = useState(() =>
    directions ? toDirectionDrafts(directions) : {}
  );
  const [directionDrafts, setDirectionDrafts] = useState(initialDirections);
  const { preferences } = usePreferences();
  const isAdaptive =
    !isPresetMode && preferences?.calorie_goal_adjustment_mode === 'adaptive';
  const adjustedCalories = useAdjustedCalorieGoal(date, isAdaptive);
  const waterUnit = preferences?.water_display_unit ?? 'ml';
  const { profile } = useProfile();
  const { latestMeasurements } = useLatestMeasurementsOnOrBefore({ date });
  const [base, setBase] = useState(goals);
  const [initialDrafts, setInitialDrafts] = useState(() =>
    toDrafts(goals, waterUnit)
  );
  const [drafts, setDrafts] = useState(initialDrafts);
  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });
  const [initialCustomDrafts, setInitialCustomDrafts] = useState(() =>
    toCustomDrafts(goals)
  );
  const [customDrafts, setCustomDrafts] = useState(initialCustomDrafts);

  const algorithms: AlgorithmBundle = useMemo(
    () => ({
      fatBreakdown: enumValue(
        FatBreakdownAlgorithm,
        preferences?.fat_breakdown_algorithm,
        FatBreakdownAlgorithm.AHA_GUIDELINES
      ),
      minerals: enumValue(
        MineralCalculationAlgorithm,
        preferences?.mineral_calculation_algorithm,
        MineralCalculationAlgorithm.RDA_STANDARD
      ),
      vitamins: enumValue(
        VitaminCalculationAlgorithm,
        preferences?.vitamin_calculation_algorithm,
        VitaminCalculationAlgorithm.RDA_STANDARD
      ),
      sugar: enumValue(
        SugarCalculationAlgorithm,
        preferences?.sugar_calculation_algorithm,
        SugarCalculationAlgorithm.WHO_GUIDELINES
      ),
      addedSugar: AddedSugarAlgorithm.WHO_MAXIMUM,
    }),
    [preferences]
  );

  // Several formulas depend on sex, so with it unknown the calculator is
  // withheld rather than guessing a silently wrong recommendation.
  const calcCalories = parseDraft(drafts.calories);
  const calcFat = parseDraft(drafts.fat);
  const userData: UserNutrientData | null = useMemo(() => {
    if (profile?.gender !== 'male' && profile?.gender !== 'female') return null;
    const activity = ACTIVITY_LEVELS.find(
      (level) => level === preferences?.activity_level
    );
    return {
      age: profile.date_of_birth
        ? calculateAge(profile.date_of_birth, getDeviceTimezone())
        : 0,
      sex: profile.gender,
      weightKg: Number(latestMeasurements?.weight) || 0,
      calories: Number.isFinite(calcCalories) ? calcCalories : 0,
      totalFatGrams: Number.isFinite(calcFat) ? calcFat : 0,
      activityLevel: activity,
    };
  }, [profile, latestMeasurements, preferences, calcCalories, calcFat]);

  const calculateField = (field: NutrientGoalField): number | null => {
    if (!userData) return null;
    const value = calculateSingleNutrientAutoValue(field, userData, algorithms);
    return value === null ? null : Math.round(value * 10) / 10;
  };

  const applyCalculated = (fields: NutrientGoalField[]) => {
    const updates: Partial<Record<GoalField, string>> = {};
    for (const field of fields) {
      const value = calculateField(field);
      if (value !== null) updates[field] = String(value);
    }
    setDrafts((prev) => ({ ...prev, ...updates }));
  };

  const calculableFields = NUTRIENT_DIRECTION_FIELDS.filter(
    (field) => getAutoCalculateFamily(field) !== null
  );

  // Visible meal types (custom ones included) share the 100% budget. Hidden
  // meals keep whatever percentage they already had.
  const meals = useMemo(
    () =>
      mealTypes.length > 0
        ? mealTypes.map((mealType) => ({
            key: mealKey(mealType.name),
            label: mealType.name,
          }))
        : DEFAULT_MEAL_KEYS.map((key) => ({
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
          })),
    [mealTypes]
  );
  const [initialMealDrafts, setInitialMealDrafts] = useState<MealPercentages>(
    () =>
      Object.fromEntries(
        meals.map(({ key }) => [key, getMealPercentage(goals, key)])
      )
  );
  const [mealDrafts, setMealDrafts] = useState(initialMealDrafts);
  const mealTotal = meals.reduce(
    (sum, { key }) => sum + (mealDrafts[key] ?? 0),
    0
  );
  const mealTotalValid = Math.round(mealTotal) === 100;

  const nutrientLabel = (field: NutrientGoalField) => {
    const unit = NUTRIENT_META[field]?.unit;
    const label = getNutrientLabel(t, field);
    return unit ? `${label} (${unit})` : label;
  };

  const labels: Record<GoalField, string> = {
    ...(Object.fromEntries(
      [...MACRO_FIELDS, ...OTHER_NUTRIENT_FIELDS].map((field) => [
        field,
        nutrientLabel(field),
      ])
    ) as Record<NutrientGoalField, string>),
    calories: isAdaptive
      ? t('goals.fields.baselineCalories', {
          defaultValue: 'Baseline calories (kcal)',
        })
      : nutrientLabel('calories'),
    water_goal_ml: t('goals.fields.water', {
      defaultValue: 'Water ({{unit}})',
      unit: WATER_UNIT_LABELS[waterUnit] ?? waterUnit,
    }),
    target_exercise_calories_burned: t('goals.fields.exerciseCalories', {
      defaultValue: 'Exercise calories (kcal)',
    }),
    target_exercise_duration_minutes: t('goals.fields.exerciseMinutes', {
      defaultValue: 'Exercise duration (min)',
    }),
    target_steps: t('goals.fields.steps', {
      defaultValue: 'Daily steps',
    }),
  };

  const { presets } = useGoalPresets();
  const {
    createPreset,
    updatePreset,
    deletePreset,
    isPending: presetBusy,
  } = useGoalPresetMutations();

  const presetFailed = useCallback(
    () =>
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.presets.failed', {
          defaultValue: 'Could not update goal presets.',
        }),
      }),
    [t]
  );

  const { plans } = useWeeklyGoalPlans();

  // Validates the form and returns the full goal row it describes, or null
  // (after showing why) when a value is invalid.
  const buildGoals = useCallback((): DailyGoals | null => {
    const next: DailyGoals = { ...base };
    for (const field of ALL_FIELDS) {
      // Leave untouched fields exactly as the server returned them, so an
      // unset goal (null/absent) is not saved back as 0.
      if (drafts[field] === initialDrafts[field]) continue;
      const value = parseDraft(drafts[field]);
      if (!Number.isFinite(value) || value < 0) {
        Toast.show({
          type: 'error',
          text1: t('goals.invalidValue', {
            defaultValue: 'Enter a valid number for every goal.',
          }),
        });
        return null;
      }
      next[field] =
        field === 'water_goal_ml'
          ? Math.round(volumeToMl(value, waterUnit))
          : value;
    }
    for (const [name, text] of Object.entries(customDrafts)) {
      if (text === (initialCustomDrafts[name] ?? '')) continue;
      const rest = { ...next.custom_nutrients };
      if (text.trim() === '') {
        delete rest[name];
      } else {
        const value = parseDraft(text);
        if (!Number.isFinite(value) || value < 0) {
          Toast.show({
            type: 'error',
            text1: t('goals.invalidValue', {
              defaultValue: 'Enter a valid number for every goal.',
            }),
          });
          return null;
        }
        rest[name] = value;
      }
      next.custom_nutrients = rest;
    }
    for (const { key } of meals) {
      if (mealDrafts[key] === initialMealDrafts[key]) continue;
      const value = mealDrafts[key] ?? 0;
      if (DEFAULT_MEAL_KEYS.includes(key)) {
        (next as unknown as Record<string, number>)[`${key}_percentage`] =
          value;
        // A custom entry for the same meal would shadow this column on read.
        if (
          next.custom_meal_percentages &&
          key in next.custom_meal_percentages
        ) {
          const rest = { ...next.custom_meal_percentages };
          delete rest[key];
          next.custom_meal_percentages =
            Object.keys(rest).length > 0 ? rest : undefined;
        }
      } else {
        next.custom_meal_percentages = {
          ...next.custom_meal_percentages,
          [key]: value,
        };
      }
    }
    if (!mealTotalValid) {
      Toast.show({
        type: 'error',
        text1: t('goals.meals.mustBe100', {
          defaultValue: 'Meal percentages must total 100%.',
        }),
      });
      return null;
    }
    return next;
  }, [
    base,
    drafts,
    initialDrafts,
    customDrafts,
    initialCustomDrafts,
    mealTotalValid,
    meals,
    mealDrafts,
    initialMealDrafts,
    waterUnit,
    t,
  ]);

  const handleSave = useCallback(async () => {
    const next = buildGoals();
    if (!next) return;
    if (isPresetMode) {
      const name = presetName.trim();
      if (!name) {
        Toast.show({
          type: 'error',
          text1: t('goals.presets.nameRequired', {
            defaultValue: 'Give the preset a name.',
          }),
        });
        return;
      }
      try {
        if (preset?.id) {
          await updatePreset({
            id: preset.id,
            preset: { ...preset, ...pickPresetValues(next), preset_name: name },
          });
        } else {
          await createPreset({ ...pickPresetValues(next), preset_name: name });
        }
        onDone();
      } catch {
        presetFailed();
      }
      return;
    }
    const directionUpdates: {
      key: string;
      preference: {
        goalType: NutrientGoalType;
        targetMin?: number;
        targetMax?: number;
      };
    }[] = [];
    for (const [key, draft] of Object.entries(directionDrafts)) {
      const initial = initialDirections[key];
      if (
        initial &&
        initial.goalType === draft.goalType &&
        (draft.goalType !== 'target' ||
          (initial.min === draft.min && initial.max === draft.max))
      ) {
        continue;
      }
      if (draft.goalType === 'target') {
        const min = parseDraft(draft.min);
        const max = parseDraft(draft.max);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
          Toast.show({
            type: 'error',
            text1: t('goals.directions.invalidRange', {
              defaultValue:
                'A range needs a minimum and a maximum, with minimum not above maximum.',
            }),
          });
          return;
        }
        directionUpdates.push({
          key,
          preference: { goalType: 'target', targetMin: min, targetMax: max },
        });
      } else {
        directionUpdates.push({
          key,
          preference: { goalType: draft.goalType },
        });
      }
    }
    try {
      await saveGoals({ date, goals: next, cascade: true });
      if (directionUpdates.length > 0) {
        setIsSavingDirections(true);
        try {
          await saveDirections(directionUpdates);
        } finally {
          setIsSavingDirections(false);
        }
      }
      onDone();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.saveFailed', { defaultValue: 'Failed to save goals.' }),
      });
    }
  }, [
    isPresetMode,
    presetName,
    preset,
    createPreset,
    updatePreset,
    presetFailed,
    date,
    buildGoals,
    directionDrafts,
    initialDirections,
    saveDirections,
    saveGoals,
    onDone,
    t,
  ]);

  const applyGuide = (guideKey: NutrientDirectionGuideKey) => {
    const guide = NUTRIENT_DIRECTION_GUIDES.find((g) => g.key === guideKey);
    if (!guide) return;
    const updates = buildGuideDirections(
      guide,
      directionDrafts,
      Number.isFinite(calcCalories) ? calcCalories : 0
    );
    setDirectionDrafts((prev) => ({ ...prev, ...updates }));
    Toast.show({
      type: 'success',
      text1: t('goals.directions.guide.applied', {
        defaultValue: 'Directions updated. Tap Save to keep them.',
      }),
    });
  };

  const handleApplyPreset = (applied: GoalPreset) => {
    // Saved goals are built from this base, so preset custom nutrients and
    // meal values survive a save of fields the user did not then edit.
    const nextBase: DailyGoals = {
      ...goals,
      ...pickPresetValues(applied),
    };
    // getMealPercentage prefers custom_meal_percentages. Drop the other
    // store for each built-in meal the preset set, or today's value shadows
    // the one the form shows.
    const custom = { ...(nextBase.custom_meal_percentages ?? {}) };
    for (const key of DEFAULT_MEAL_KEYS) {
      const column = `${key}_percentage` as keyof DailyGoals;
      if (
        applied.custom_meal_percentages &&
        key in applied.custom_meal_percentages
      ) {
        delete (nextBase as unknown as Record<string, unknown>)[column];
      } else if (applied[column] !== undefined) {
        delete custom[key];
      }
    }
    nextBase.custom_meal_percentages =
      Object.keys(custom).length > 0 ? custom : undefined;

    const nextDrafts = toDrafts(nextBase, waterUnit);
    const nextCustomDrafts = toCustomDrafts(nextBase);
    const nextMeals: MealPercentages = Object.fromEntries(
      meals.map(({ key }) => [key, getMealPercentage(nextBase, key)])
    );
    setBase(nextBase);
    setInitialDrafts(nextDrafts);
    setDrafts(nextDrafts);
    setInitialCustomDrafts(nextCustomDrafts);
    setCustomDrafts(nextCustomDrafts);
    setInitialMealDrafts(nextMeals);
    setMealDrafts(nextMeals);
    Toast.show({
      type: 'success',
      text1: t('goals.presets.applied', {
        defaultValue: 'Preset applied. Tap Save to keep it.',
      }),
    });
  };

  const handleDeletePreset = async (preset: GoalPreset) => {
    if (!preset.id) return;
    try {
      await deletePreset(preset.id);
    } catch {
      presetFailed();
    }
  };

  const directionSegments: Segment<NutrientGoalType>[] = [
    {
      key: 'minimum',
      color: DIRECTION_COLORS.minimum,
      label: t('goals.directions.minimum', { defaultValue: 'Min' }),
    },
    {
      key: 'maximum',
      color: DIRECTION_COLORS.maximum,
      label: t('goals.directions.maximum', { defaultValue: 'Max' }),
    },
    {
      key: 'target',
      color: DIRECTION_COLORS.target,
      label: t('goals.directions.range', { defaultValue: 'Range' }),
    },
  ];

  const renderDirection = (field: NutrientGoalField) => {
    const draft = directionDrafts[field];
    const update = (patch: Partial<DirectionDraft>) =>
      setDirectionDrafts((prev) => ({
        ...prev,
        [field]: { ...prev[field], ...patch },
      }));
    return (
      <View className="gap-2 pt-1">
        <SegmentedControl
          segments={directionSegments}
          activeKey={draft.goalType}
          onSelect={(goalType) => update({ goalType })}
        />
        {draft.goalType === 'target' && (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <FormInput
                value={draft.min}
                onChangeText={(min) => update({ min })}
                keyboardType="decimal-pad"
                placeholder={t('goals.directions.rangeMin', {
                  defaultValue: 'Range min',
                })}
                accessibilityLabel={`${labels[field]} ${t(
                  'goals.directions.rangeMin',
                  { defaultValue: 'Range min' }
                )}`}
              />
            </View>
            <View className="flex-1">
              <FormInput
                value={draft.max}
                onChangeText={(max) => update({ max })}
                keyboardType="decimal-pad"
                placeholder={t('goals.directions.rangeMax', {
                  defaultValue: 'Range max',
                })}
                accessibilityLabel={`${labels[field]} ${t(
                  'goals.directions.rangeMax',
                  { defaultValue: 'Range max' }
                )}`}
              />
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderCalculate = (field: NutrientGoalField) => (
    <Button
      variant="secondary"
      onPress={() => applyCalculated([field])}
      accessibilityLabel={t('goals.calculator.calculateField', {
        defaultValue: 'Calculate {{nutrient}}',
        nutrient: getNutrientLabel(t, field),
      })}
      className="py-2 self-start"
      textClassName="text-xs"
    >
      {t('goals.calculator.calculate', { defaultValue: 'Calculate' })}
    </Button>
  );

  const renderFields = (fields: GoalField[]) =>
    fields.map((field) => (
      <View key={field} className="gap-1">
        <Text className="text-sm font-medium text-text-primary">
          {labels[field]}
        </Text>
        <FormInput
          value={drafts[field]}
          onChangeText={(text) =>
            setDrafts((prev) => ({ ...prev, [field]: text }))
          }
          keyboardType="decimal-pad"
          accessibilityLabel={labels[field]}
          testID={`goal-input-${field}`}
        />
        {userData &&
          getAutoCalculateFamily(field) !== null &&
          renderCalculate(field as NutrientGoalField)}
        {directionDrafts[field] && renderDirection(field as NutrientGoalField)}
      </View>
    ));

  const sectionTitle = (text: string) => (
    <Text className="text-base font-semibold text-text-primary pt-2">
      {text}
    </Text>
  );

  return (
    <FormScreenChrome
      title={
        isPresetMode
          ? preset
            ? t('goals.presets.editTitle', { defaultValue: 'Edit preset' })
            : t('goals.presets.newTitle', { defaultValue: 'New preset' })
          : t('goals.title', { defaultValue: 'Goals' })
      }
      saveLabel={t('common.save', { defaultValue: 'Save' })}
      savingLabel={t('common.saving', { defaultValue: 'Saving…' })}
      isSaving={isPending || presetBusy}
      onSave={handleSave}
      onCancel={onDone}
    >
      {isPresetMode ? (
        <View className="gap-1">
          <Text className="text-sm font-medium text-text-primary">
            {t('goals.presets.nameLabel', { defaultValue: 'Preset name' })}
          </Text>
          <FormInput
            value={presetName}
            onChangeText={setPresetName}
            placeholder={t('goals.presets.namePlaceholder', {
              defaultValue: 'Preset name',
            })}
            accessibilityLabel={t('goals.presets.nameLabel', {
              defaultValue: 'Preset name',
            })}
            testID="goal-preset-name"
          />
          <Text className="text-sm text-text-secondary">
            {t('goals.presets.editDescription', {
              defaultValue:
                'A preset is a saved set of goals. Apply it to your goals, or assign it to days of the week in a weekly plan.',
            })}
          </Text>
        </View>
      ) : (
        <Text className="text-sm text-text-secondary">
          {t('goals.description', {
            defaultValue:
              'Daily targets that apply from today onward. Past days keep their goals.',
          })}
        </Text>
      )}
      {isAdaptive && (
        <Text className="text-sm text-text-secondary">
          {adjustedCalories !== undefined
            ? t('goals.adaptiveNoteToday', {
                defaultValue:
                  'Adaptive mode is on, so your calorie goal changes daily. Today it is {{calories}} kcal. The baseline below sets how far above or below your estimated maintenance you aim to be; it is not a fixed daily target.',
                calories: Math.round(adjustedCalories),
              })
            : t('goals.adaptiveNote', {
                defaultValue:
                  'Adaptive mode is on, so your calorie goal changes daily. The baseline below sets how far above or below your estimated maintenance you aim to be; it is not a fixed daily target.',
              })}
        </Text>
      )}
      {Object.keys(directionDrafts).length > 0 && (
        <>
          <Text className="text-sm text-text-secondary">
            {t('goals.directions.note', {
              defaultValue:
                'Min means more is better, Max means stay under, and Range means stay between two values. This changes how progress is judged, not the goal numbers.',
            })}
          </Text>
          <NutrientDirectionGuide onApply={applyGuide} />
        </>
      )}
      {sectionTitle(
        t('goals.sections.macros', { defaultValue: 'Calories & macros' })
      )}
      {renderFields(MACRO_FIELDS)}
      {sectionTitle(
        t('goals.sections.nutrients', { defaultValue: 'Other nutrients' })
      )}
      {userData ? (
        <Button
          variant="secondary"
          onPress={() => applyCalculated(calculableFields)}
          className="py-2"
          textClassName="text-sm"
        >
          {t('goals.calculator.calculateAll', {
            defaultValue: 'Calculate all from my profile',
          })}
        </Button>
      ) : (
        <Text className="text-sm text-text-secondary">
          {t('goals.calculator.needsProfile', {
            defaultValue:
              'Set your sex in your profile on the web to calculate recommended nutrient goals.',
          })}
        </Text>
      )}
      {renderFields(OTHER_NUTRIENT_FIELDS)}
      {customNutrients.length > 0 && (
        <>
          {sectionTitle(
            t('goals.sections.customNutrients', {
              defaultValue: 'Custom nutrients',
            })
          )}
          {customNutrients.map((nutrient) => {
            const label = `${nutrient.name} (${nutrient.unit})`;
            return (
              <View key={nutrient.id} className="gap-1">
                <Text className="text-sm font-medium text-text-primary">
                  {label}
                </Text>
                <FormInput
                  value={customDrafts[nutrient.name] ?? ''}
                  onChangeText={(text) =>
                    setCustomDrafts((prev) => ({
                      ...prev,
                      [nutrient.name]: text,
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder={t('goals.customNutrients.notSet', {
                    defaultValue: 'No goal',
                  })}
                  accessibilityLabel={label}
                  testID={`goal-input-custom-${nutrient.name}`}
                />
              </View>
            );
          })}
        </>
      )}
      {sectionTitle(
        t('goals.sections.activity', { defaultValue: 'Water & exercise' })
      )}
      {renderFields(OTHER_FIELDS)}
      {sectionTitle(
        t('goals.sections.meals', { defaultValue: 'Meal calorie distribution' })
      )}
      <MealDistributionEditor
        meals={meals}
        values={mealDrafts}
        onChange={setMealDrafts}
        totalCalories={
          isAdaptive && adjustedCalories !== undefined
            ? adjustedCalories
            : Number.isFinite(calcCalories)
              ? calcCalories
              : 0
        }
      />
      {!isPresetMode && (
        <>
          {sectionTitle(
            t('goals.sections.presets', { defaultValue: 'Goal presets' })
          )}
          <GoalPresetsSection
            presets={presets}
            isBusy={presetBusy}
            onApply={handleApplyPreset}
            onCreate={() => onEditPreset()}
            onEdit={(item) => onEditPreset(item.id)}
            onDelete={handleDeletePreset}
          />
          {sectionTitle(
            t('goals.sections.weekly', { defaultValue: 'Weekly plans' })
          )}
          <WeeklyGoalPlansSection
            plans={plans}
            presets={presets}
            onCreate={() => onEditPlan()}
            onEdit={(plan) => onEditPlan(plan.id)}
          />
        </>
      )}
    </FormScreenChrome>
  );
};

const GoalsScreen: React.FC<GoalsScreenProps> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { isConnected } = useServerConnection();
  const presetId = route.params?.presetId;
  const isPresetMode = !!presetId || !!route.params?.newPreset;
  const [date] = useState(getTodayDate);
  const { goals, isLoading, isError, refetch } = useGoalsQuery(date, {
    enabled: isConnected,
  });
  const { mealTypes, isLoading: isLoadingMealTypes } = useMealTypes({
    enabled: isConnected,
  });
  const { directions, isLoading: isLoadingDirectionsQuery } =
    useNutrientGoalPreferences({ enabled: isConnected && !isPresetMode });
  const { presets, isLoading: isLoadingPresets } = useGoalPresets({
    enabled: isConnected,
  });
  const isLoadingDirections =
    isLoadingDirectionsQuery || isLoadingMealTypes || isLoadingPresets;
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const editPreset = useCallback(
    (id?: string) =>
      navigation.push('Goals', id ? { presetId: id } : { newPreset: true }),
    [navigation]
  );
  const editPlan = useCallback(
    (planId?: string) => navigation.navigate('WeeklyGoalPlanEdit', { planId }),
    [navigation]
  );

  const preset = presetId
    ? (presets.find((item) => item.id === presetId) ?? null)
    : null;
  const isBusy = isLoading || isLoadingDirections;
  const isMissingPreset = !!presetId && !isBusy && !preset;

  if (isBusy || isError || !goals || isMissingPreset) {
    return (
      <StatusView
        loading={isBusy}
        icon={isBusy ? undefined : 'alert-circle'}
        title={
          isBusy
            ? undefined
            : isMissingPreset
              ? t('goals.presets.notFound', {
                  defaultValue: 'Could not find this preset.',
                })
              : t('goals.loadFailed', {
                  defaultValue: 'Could not load your goals.',
                })
        }
        action={
          isBusy
            ? undefined
            : isMissingPreset
              ? {
                  label: t('goals.weekly.goBack', { defaultValue: 'Go back' }),
                  onPress: goBack,
                }
              : {
                  label: t('common.retry', { defaultValue: 'Retry' }),
                  onPress: () => void refetch(),
                }
        }
      />
    );
  }

  return (
    <GoalsForm
      // Editing a preset reuses this screen, so reset the form when it changes.
      key={presetId ?? (isPresetMode ? 'new-preset' : 'daily')}
      date={date}
      goals={preset ?? goals}
      directions={directions}
      mealTypes={mealTypes}
      preset={preset}
      isPresetMode={isPresetMode}
      onDone={goBack}
      onEditPreset={editPreset}
      onEditPlan={editPlan}
    />
  );
};

export default GoalsScreen;
