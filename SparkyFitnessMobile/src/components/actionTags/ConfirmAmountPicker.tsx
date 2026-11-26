import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  ACTION_TAG_MAX_QUANTITY,
  type ActionTagResponse,
} from '@workspace/shared';
import FormInput from '../FormInput';
import Button from '../ui/Button';
import { useAdjustedDailyGoal, useGoalsQuery } from '../../hooks/useGoals';
import { useFood } from '../../hooks/useFoods';
import { useFoodVariants } from '../../hooks/useFoodVariants';
import { useMeal } from '../../hooks/useMeals';
import { useMealTypes } from '../../hooks/useMealTypes';
import { usePreferences } from '../../hooks/usePreferences';
import { useWaterContainersQuery } from '../../hooks/useWaterContainers';
import {
  buildMealDisplayValuesFromFoods,
  getMealTypeDisplayLabel,
} from '../../utils/mealNutrition';
import { volumeToMl } from '../../utils/unitConversions';
import {
  convertWaterVolumeFromMl,
  formatCurrentTimeHhMm,
  formatDisplayNumber,
  formatInputNumber,
  loadLastUsedAmount,
  MULTIPLIER_PRESETS,
  normalizeHhMm,
  normalizeWaterVolumeUnit,
  parseContainerMl,
  saveLastUsedAmount,
  triggerScanHaptic,
  WATER_DRINK_PRESETS,
  WATER_LITER_PRESETS,
  WATER_ML_PRESETS,
  WATER_OZ_PRESETS,
  type LastUsedAmount,
  type ScanConfirmOptions,
  type WaterVolumeUnit,
} from './actionTagPickerUtils';

export const ConfirmAmountPicker: React.FC<{
  tag: ActionTagResponse;
  entryDate: string;
  onOpenSettings: () => void;
  onConfirm: (options?: ScanConfirmOptions) => void;
  onCancel: () => void;
}> = ({ tag, entryDate, onOpenSettings, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const action = tag.action;
  const isWater = action.type === 'water';
  const tapToLogEnabled = Boolean(tag.tap_to_log);
  const allowCustomTimestamp = Boolean(tag.allow_custom_timestamp);

  const { preferences } = usePreferences();
  const { containers } = useWaterContainersQuery({ enabled: isWater });
  const waterContainer = useMemo(
    () =>
      isWater
        ? containers.find((c) => c.id === action.container_id)
        : undefined,
    [action, containers, isWater]
  );
  const preferredWaterUnit = useMemo<WaterVolumeUnit>(() => {
    const containerUnit = normalizeWaterVolumeUnit(waterContainer?.unit);
    if (containerUnit) return containerUnit;
    return normalizeWaterVolumeUnit(preferences?.water_display_unit) ?? 'ml';
  }, [preferences?.water_display_unit, waterContainer?.unit]);

  const containerMl = useMemo(() => {
    if (!waterContainer) return 250;
    const totalMl = parseContainerMl(waterContainer.volume);
    const servingsPerContainer = Math.max(
      1,
      Number(
        (waterContainer as { servings_per_container?: unknown })
          .servings_per_container ?? 1
      ) || 1
    );
    return totalMl / servingsPerContainer;
  }, [waterContainer]);

  const { food } = useFood(action.type === 'food' ? action.food_id : '', {
    enabled: action.type === 'food',
  });
  const { variants } = useFoodVariants(
    action.type === 'food' ? action.food_id : '',
    { enabled: action.type === 'food' }
  );
  const { meal } = useMeal(
    action.type === 'meal' ? action.meal_template_id : '',
    { enabled: action.type === 'meal' }
  );

  const { mealTypes, defaultMealTypeId } = useMealTypes({
    enabled: !isWater,
  });
  const [mealTypeOverrideId, setMealTypeOverrideId] = useState<string | null>(
    null
  );

  const selectedMealTypeId = useMemo(() => {
    if (isWater) return null;
    if (mealTypeOverrideId) return mealTypeOverrideId;
    if (action.meal.mode === 'fixed') return action.meal.meal_type_id;
    return defaultMealTypeId ?? null;
  }, [action, defaultMealTypeId, isWater, mealTypeOverrideId]);

  const [customTime, setCustomTime] = useState<string>(() =>
    formatCurrentTimeHhMm()
  );
  const [timeError, setTimeError] = useState<string | null>(null);

  const waterUsesVolume = useMemo(
    () =>
      isWater &&
      (normalizeWaterVolumeUnit(waterContainer?.unit) !== null ||
        (Array.isArray(tag.preset_amounts) && tag.preset_amounts.length > 0)),
    [isWater, tag.preset_amounts, waterContainer?.unit]
  );

  const defaultValue = useMemo(() => {
    if (isWater) {
      if (!waterUsesVolume) return action.drinks;
      const mlAmount = Math.max(50, Math.round(action.drinks * containerMl));
      return convertWaterVolumeFromMl(mlAmount, preferredWaterUnit);
    }
    return action.quantity;
  }, [action, containerMl, isWater, preferredWaterUnit, waterUsesVolume]);

  const baseUnit = useMemo(() => {
    if (isWater) return waterUsesVolume ? preferredWaterUnit : 'drinks';
    return action.unit;
  }, [action, isWater, preferredWaterUnit, waterUsesVolume]);

  const variantServingSize = useMemo(() => {
    if (action.type !== 'food') return null;
    const safeVariants = variants ?? [];
    const found = safeVariants.find(
      (v: { id: string; serving_size?: number | string | null }) =>
        v.id === action.variant_id
    );
    const num = Number(found?.serving_size);
    return Number.isFinite(num) && num > 0 ? num : null;
  }, [action, variants]);

  const availableUnits = useMemo(() => {
    if (isWater) return [preferredWaterUnit, 'drinks'];
    if (
      action.type === 'food' &&
      variantServingSize &&
      action.unit !== 'serving'
    ) {
      return [action.unit, 'serving'];
    }
    return [action.unit];
  }, [action, isWater, preferredWaterUnit, variantServingSize]);

  const [selectedUnit, setSelectedUnit] = useState<string>(baseUnit);
  const [unitPickerOpen, setUnitPickerOpen] = useState<boolean>(false);
  const [selectedValue, setSelectedValue] = useState<number>(defaultValue);
  const [customInput, setCustomInput] = useState<string>(
    formatInputNumber(defaultValue)
  );
  const [lastUsed, setLastUsed] = useState<LastUsedAmount | null>(null);

  useEffect(() => {
    let active = true;
    void loadLastUsedAmount(tag.id).then((loaded) => {
      if (active && loaded) {
        setLastUsed(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, [tag.id]);

  const handleSelectUnit = (nextUnit: string) => {
    if (nextUnit === selectedUnit) {
      setUnitPickerOpen(false);
      return;
    }

    let nextValue = selectedValue;
    if (isWater) {
      const fromVolUnit = normalizeWaterVolumeUnit(selectedUnit);
      const toVolUnit = normalizeWaterVolumeUnit(nextUnit);
      if (fromVolUnit && nextUnit === 'drinks') {
        const ml = volumeToMl(selectedValue, fromVolUnit);
        nextValue = Math.max(1, Math.round(ml / Math.max(1, containerMl)));
      } else if (selectedUnit === 'drinks' && toVolUnit) {
        const ml = selectedValue * Math.max(1, containerMl);
        nextValue = convertWaterVolumeFromMl(ml, toVolUnit);
      } else if (fromVolUnit && toVolUnit) {
        const ml = volumeToMl(selectedValue, fromVolUnit);
        nextValue = convertWaterVolumeFromMl(ml, toVolUnit);
      }
    } else if (variantServingSize) {
      if (selectedUnit === 'serving' && nextUnit !== 'serving') {
        nextValue = Number((selectedValue * variantServingSize).toFixed(2));
      } else if (selectedUnit !== 'serving' && nextUnit === 'serving') {
        nextValue = Number((selectedValue / variantServingSize).toFixed(2));
      }
    }

    setSelectedUnit(nextUnit);
    setSelectedValue(nextValue);
    setCustomInput(formatInputNumber(nextValue));
    setUnitPickerOpen(false);
    triggerScanHaptic('light');
  };

  const presets = useMemo(() => {
    if (Array.isArray(tag.preset_amounts) && tag.preset_amounts.length > 0) {
      return tag.preset_amounts.map((val, idx) => ({
        key: `custom-preset-${idx}-${val}`,
        label: isWater
          ? selectedUnit === 'drinks'
            ? `${formatDisplayNumber(val)}×`
            : `${formatDisplayNumber(val)} ${selectedUnit}`
          : `${formatDisplayNumber(val)} ${selectedUnit}`,
        value: val,
      }));
    }
    if (isWater) {
      const volUnit = normalizeWaterVolumeUnit(selectedUnit);
      if (volUnit === 'oz') {
        return WATER_OZ_PRESETS.map((oz) => ({
          key: `oz-${oz}`,
          label: `${oz} oz`,
          value: oz,
        }));
      }
      if (volUnit === 'liter') {
        return WATER_LITER_PRESETS.map((liters) => ({
          key: `liter-${liters}`,
          label: `${formatDisplayNumber(liters)} liter`,
          value: liters,
        }));
      }
      if (volUnit === 'ml') {
        return WATER_ML_PRESETS.map((ml) => ({
          key: `ml-${ml}`,
          label: `${ml} ml`,
          value: ml,
        }));
      }
      return WATER_DRINK_PRESETS.map((drinks) => ({
        key: `drinks-${drinks}`,
        label: `${drinks}×`,
        value: drinks,
      }));
    }
    const baseAmount =
      variantServingSize && baseUnit !== selectedUnit
        ? selectedUnit === 'serving'
          ? defaultValue / variantServingSize
          : baseUnit === 'serving'
            ? defaultValue * variantServingSize
            : defaultValue
        : defaultValue;

    return MULTIPLIER_PRESETS.map((mult) => ({
      key: `mult-${mult}`,
      label: `${mult}×`,
      value: Number((baseAmount * mult).toFixed(2)),
    }));
  }, [
    baseUnit,
    defaultValue,
    isWater,
    selectedUnit,
    tag.preset_amounts,
    variantServingSize,
  ]);

  const { goals } = useGoalsQuery(entryDate);
  const { adjustedGoal } = useAdjustedDailyGoal(entryDate, true);
  const dailyCalorieGoal = useMemo(() => {
    const g =
      (adjustedGoal as { calories?: number } | undefined)?.calories ??
      (goals as { calories?: number } | undefined)?.calories ??
      0;
    return Number.isFinite(Number(g)) && Number(g) > 0 ? Number(g) : null;
  }, [adjustedGoal, goals]);

  const livePreview = useMemo(() => {
    if (isWater) {
      const volUnit = normalizeWaterVolumeUnit(selectedUnit);
      const mlAmount = volUnit
        ? volumeToMl(selectedValue, volUnit)
        : selectedValue * containerMl;
      const kcalPerMl =
        waterContainer?.linked_food_id &&
        waterContainer?.linked_variant_serving_size &&
        Number(waterContainer.linked_variant_serving_size) > 0
          ? Number(
              (waterContainer as { linked_food_calories?: number })
                .linked_food_calories ?? 0
            ) / Number(waterContainer.linked_variant_serving_size)
          : 0;
      const kcal = Math.max(0, Math.round(mlAmount * kcalPerMl));
      return {
        title: waterContainer?.name ?? tag.label,
        imageUri: null as string | null,
        calories: kcal,
        protein: 0,
        carbs: 0,
        fat: 0,
        goalPercent:
          dailyCalorieGoal && kcal > 0
            ? Math.min(999, Math.round((kcal / dailyCalorieGoal) * 100))
            : null,
      };
    }

    if (action.type === 'food') {
      const safeVariants = variants ?? [];
      const variant = safeVariants.find(
        (v: { id: string }) => v.id === action.variant_id
      );
      const rawQtyInBaseUnit =
        selectedUnit !== action.unit &&
        variantServingSize &&
        selectedUnit === 'serving'
          ? selectedValue * variantServingSize
          : selectedValue;
      const boundedQty = Math.min(
        ACTION_TAG_MAX_QUANTITY,
        Math.max(0.01, rawQtyInBaseUnit)
      );
      const baseQty = Math.max(
        0.01,
        Number(variant?.serving_size ?? action.quantity)
      );
      const ratio = boundedQty / baseQty;
      const calories = Math.round(
        Number((variant as { calories?: number } | undefined)?.calories ?? 0) *
          ratio
      );
      const protein = Number(
        (
          Number((variant as { protein?: number } | undefined)?.protein ?? 0) *
          ratio
        ).toFixed(1)
      );
      const carbs = Number(
        (
          Number((variant as { carbs?: number } | undefined)?.carbs ?? 0) *
          ratio
        ).toFixed(1)
      );
      const fat = Number(
        (
          Number((variant as { fat?: number } | undefined)?.fat ?? 0) * ratio
        ).toFixed(1)
      );
      const img =
        (food as { image_url?: string | null } | undefined)?.image_url ?? null;
      return {
        title: food?.name ?? tag.label,
        imageUri: img,
        calories: Math.max(0, calories),
        protein: Math.max(0, protein),
        carbs: Math.max(0, carbs),
        fat: Math.max(0, fat),
        goalPercent:
          dailyCalorieGoal && calories > 0
            ? Math.min(999, Math.round((calories / dailyCalorieGoal) * 100))
            : null,
      };
    }

    const mealData = meal as
      | {
          name?: string;
          serving_size?: number | null;
          serving_unit?: string | null;
          total_servings?: number | null;
          image_url?: string | null;
          foods?: Parameters<typeof buildMealDisplayValuesFromFoods>[0];
        }
      | undefined;
    const boundedMealQty = Math.min(
      ACTION_TAG_MAX_QUANTITY,
      Math.max(0.01, selectedValue)
    );
    const mealFoods = mealData?.foods ?? [];
    const perServing = buildMealDisplayValuesFromFoods(
      mealFoods,
      {
        serving_size: mealData?.serving_size,
        serving_unit: mealData?.serving_unit,
        total_servings: mealData?.total_servings,
      },
      'perServing'
    );
    const calories = Math.round((perServing.calories ?? 0) * boundedMealQty);
    const protein = Number(
      ((perServing.protein ?? 0) * boundedMealQty).toFixed(1)
    );
    const carbs = Number(((perServing.carbs ?? 0) * boundedMealQty).toFixed(1));
    const fat = Number(((perServing.fat ?? 0) * boundedMealQty).toFixed(1));
    return {
      title: mealData?.name ?? tag.label,
      imageUri: mealData?.image_url ?? null,
      calories: Math.max(0, calories),
      protein: Math.max(0, protein),
      carbs: Math.max(0, carbs),
      fat: Math.max(0, fat),
      goalPercent:
        dailyCalorieGoal && calories > 0
          ? Math.min(999, Math.round((calories / dailyCalorieGoal) * 100))
          : null,
    };
  }, [
    action,
    containerMl,
    meal,
    dailyCalorieGoal,
    food,
    isWater,
    selectedUnit,
    selectedValue,
    tag.label,
    variantServingSize,
    variants,
    waterContainer,
  ]);

  const buildConfirmOptions = useCallback(
    (
      explicitValue?: number,
      explicitUnit?: string
    ): ScanConfirmOptions | null => {
      const targetVal = explicitValue ?? selectedValue;
      const targetUnit = explicitUnit ?? selectedUnit;
      const options: ScanConfirmOptions = {};

      if (isWater) {
        const volUnit = normalizeWaterVolumeUnit(targetUnit);
        if (volUnit) {
          const rawMl = volumeToMl(targetVal, volUnit);
          const ml = Math.min(10000, Math.max(1, Math.round(rawMl)));
          options.override = { water_ml_override: ml };
        } else {
          const drinks = Math.min(20, Math.max(1, Math.round(targetVal)));
          options.override =
            drinks !== action.drinks ? { drinks_override: drinks } : undefined;
        }
      } else {
        let quantityInActionUnit = targetVal;
        if (targetUnit !== action.unit) {
          if (
            action.type === 'food' &&
            variantServingSize &&
            targetUnit === 'serving'
          ) {
            quantityInActionUnit = targetVal * variantServingSize;
          } else {
            throw new Error(
              `Unsupported unit conversion for ${action.type}: ${targetUnit} -> ${action.unit}`
            );
          }
        }
        const qty = Math.min(
          ACTION_TAG_MAX_QUANTITY,
          Math.max(0.01, Number(quantityInActionUnit.toFixed(2)))
        );
        options.override =
          qty !== action.quantity ? { quantity_override: qty } : undefined;
        if (mealTypeOverrideId !== null && selectedMealTypeId) {
          options.mealTypeId = selectedMealTypeId;
        }
      }

      if (allowCustomTimestamp) {
        const validTime = normalizeHhMm(customTime);
        if (!validTime) {
          setTimeError(
            t('actionTags.scan.invalidTime', {
              defaultValue: 'Enter a valid time (e.g. 08:30 or 8:30 PM).',
            })
          );
          return null;
        }
        setTimeError(null);
        options.entryTime = validTime;
      }
      return options;
    },
    [
      action,
      allowCustomTimestamp,
      customTime,
      isWater,
      selectedMealTypeId,
      mealTypeOverrideId,
      selectedUnit,
      selectedValue,
      variantServingSize,
      t,
    ]
  );

  const handleSelectPreset = (value: number, unitOverride?: string) => {
    const effectiveUnit = unitOverride ?? selectedUnit;
    if (unitOverride) {
      setSelectedUnit(unitOverride);
    }
    setSelectedValue(value);
    setCustomInput(formatInputNumber(value));
    if (tapToLogEnabled) {
      triggerScanHaptic('medium');
      void saveLastUsedAmount(tag.id, { value, unit: effectiveUnit });
      const nextOptions = buildConfirmOptions(value, effectiveUnit);
      if (nextOptions) {
        onConfirm(nextOptions);
      }
    } else {
      triggerScanHaptic('light');
    }
  };

  const handleTimeChange = (text: string) => {
    setCustomTime(text);
    if (timeError) {
      setTimeError(null);
    }
  };

  const handleInputChange = (text: string) => {
    setCustomInput(text);
    const parsed = Number(text.replace(',', '.').trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    if (isWater && selectedUnit === 'drinks') {
      const drinks = Math.round(parsed);
      if (drinks >= 1 && drinks <= 20) setSelectedValue(drinks);
    } else if (parsed <= ACTION_TAG_MAX_QUANTITY) {
      setSelectedValue(parsed);
    }
  };

  return (
    <View className="flex-1 justify-between px-4 pb-5 pt-2">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between py-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            onPress={onCancel}
            className="w-10 h-10 rounded-full items-center justify-center bg-surface"
          >
            <Ionicons name="close" size={22} className="text-text-primary" />
          </Pressable>

          <View className="flex-row items-center gap-2 flex-1 justify-end ml-3">
            <Text
              numberOfLines={1}
              className="text-base font-semibold text-text-primary flex-shrink"
            >
              {tag.label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('actionTags.scan.configureTag', {
                defaultValue: 'Tag settings',
              })}
              onPress={onOpenSettings}
              className="w-10 h-10 rounded-full items-center justify-center bg-surface"
            >
              <Ionicons
                name="settings-outline"
                size={20}
                className="text-text-primary"
              />
            </Pressable>
          </View>
        </View>

        {/* Live preview card */}
        <View className="mt-3 rounded-2xl bg-surface p-4 border border-border">
          <View className="flex-row items-center gap-3">
            {livePreview.imageUri ? (
              <Image
                source={{ uri: livePreview.imageUri }}
                className="w-12 h-12 rounded-xl bg-background"
              />
            ) : (
              <View className="w-12 h-12 rounded-xl bg-background items-center justify-center">
                <Ionicons
                  name={isWater ? 'water' : 'nutrition'}
                  size={24}
                  className="text-primary"
                />
              </View>
            )}
            <View className="flex-1">
              <Text
                numberOfLines={1}
                className="text-base font-semibold text-text-primary"
              >
                {livePreview.title}
              </Text>
              <Text className="text-xs text-text-secondary mt-0.5">
                {formatDisplayNumber(selectedValue)} {selectedUnit} ?{' '}
                {formatDisplayNumber(livePreview.calories, 0)}{' '}
                {t('actionTags.scan.kcalUnit', { defaultValue: 'kcal' })}
                {livePreview.goalPercent !== null
                  ? ` ? ${formatDisplayNumber(livePreview.goalPercent, 0)}% ${t(
                      'actionTags.scan.ofGoal',
                      {
                        defaultValue: 'of daily goal',
                      }
                    )}`
                  : ''}
              </Text>
            </View>
          </View>

          {!isWater ? (
            <View className="flex-row justify-between mt-3 pt-3 border-t border-border">
              <Text className="text-xs text-text-secondary">
                {t('actionTags.scan.proteinShort', { defaultValue: 'P:' })}{' '}
                {formatDisplayNumber(livePreview.protein, 1)} g
              </Text>
              <Text className="text-xs text-text-secondary">
                {t('actionTags.scan.carbsShort', { defaultValue: 'C:' })}{' '}
                {formatDisplayNumber(livePreview.carbs, 1)} g
              </Text>
              <Text className="text-xs text-text-secondary">
                {t('actionTags.scan.fatShort', { defaultValue: 'F:' })}{' '}
                {formatDisplayNumber(livePreview.fat, 1)} g
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom thumb zone: everything from Meal builds directly above LOG */}
      <View className="pt-2">
        {!isWater && mealTypes.length > 0 ? (
          <View className="mb-3.5">
            <Text className="text-xs font-semibold text-text-secondary mb-2">
              {t('actionTags.scan.mealContext', { defaultValue: 'Meal' })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {mealTypes.map((mt) => {
                const active = selectedMealTypeId === mt.id;
                return (
                  <Pressable
                    key={mt.id}
                    accessibilityRole="button"
                    onPress={() => setMealTypeOverrideId(mt.id)}
                    className={`px-3.5 py-2 rounded-full border ${active ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
                  >
                    <Text
                      className={`text-xs font-semibold ${active ? 'text-white' : 'text-text-primary'}`}
                    >
                      {getMealTypeDisplayLabel(mt, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {allowCustomTimestamp ? (
          <View className="mb-3.5">
            <Text className="text-xs font-semibold text-text-secondary mb-1.5">
              {t('actionTags.scan.customTime', {
                defaultValue: 'Time (HH:MM)',
              })}
            </Text>
            <FormInput
              value={customTime}
              onChangeText={handleTimeChange}
              placeholder={t('actionTags.scan.timePlaceholder', {
                defaultValue: 'HH:MM',
              })}
              keyboardType="numbers-and-punctuation"
              maxLength={11}
            />
            {timeError ? (
              <Text className="text-xs text-red-500 mt-1">{timeError}</Text>
            ) : null}
          </View>
        ) : null}

        <View className="mb-3.5">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold text-text-secondary">
              {t('actionTags.scan.quickAmounts', {
                defaultValue: 'Quick amounts',
              })}
            </Text>
            {tapToLogEnabled ? (
              <Text className="text-xs text-primary font-medium">
                {t('actionTags.scan.tapToLogActive', {
                  defaultValue: 'Tap to log immediately',
                })}
              </Text>
            ) : null}
          </View>

          <View className="flex-row flex-wrap gap-2">
            {lastUsed && Math.abs(lastUsed.value - defaultValue) > 0.001 ? (
              <Button
                key="last-used"
                variant={
                  Math.abs(selectedValue - lastUsed.value) < 0.001 &&
                  selectedUnit === lastUsed.unit
                    ? 'primary'
                    : 'secondary'
                }
                className="py-2.5 px-4"
                onPress={() => {
                  handleSelectPreset(lastUsed.value, lastUsed.unit);
                }}
              >
                {t('actionTags.scan.lastUsedAmount', {
                  defaultValue: 'Last: {{value}} {{unit}}',
                  value: formatDisplayNumber(lastUsed.value),
                  unit: lastUsed.unit,
                })}
              </Button>
            ) : null}
            {presets.map((preset) => {
              const active = Math.abs(selectedValue - preset.value) < 0.001;
              return (
                <Button
                  key={preset.key}
                  variant={active ? 'primary' : 'secondary'}
                  className="py-2.5 px-4"
                  onPress={() => handleSelectPreset(preset.value)}
                >
                  {preset.label}
                </Button>
              );
            })}
          </View>
        </View>

        <View className="mb-3">
          <Text className="text-xs font-semibold text-text-secondary mb-1.5">
            {t('actionTags.scan.amountAndUnit', {
              defaultValue: 'Amount & unit',
            })}
          </Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <FormInput
                value={customInput}
                onChangeText={handleInputChange}
                keyboardType="decimal-pad"
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setUnitPickerOpen((prev) => !prev)}
              className="h-12 px-3.5 rounded-xl bg-surface border border-border flex-row items-center gap-1.5"
            >
              <Text className="text-sm font-semibold text-text-primary">
                {selectedUnit}
              </Text>
              <Ionicons
                name={unitPickerOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                className="text-text-secondary"
              />
            </Pressable>
          </View>

          {unitPickerOpen ? (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {availableUnits.map((unitOption) => {
                const chosen = selectedUnit === unitOption;
                return (
                  <Pressable
                    key={unitOption}
                    accessibilityRole="button"
                    onPress={() => handleSelectUnit(unitOption)}
                    className={`px-3 py-1.5 rounded-lg border ${chosen ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
                  >
                    <Text
                      className={`text-xs font-medium ${chosen ? 'text-white' : 'text-text-primary'}`}
                    >
                      {unitOption}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Primary button at the very bottom */}
        <View className="pt-1">
          <Button
            variant="primary"
            onPress={() => {
              const nextOptions = buildConfirmOptions();
              if (nextOptions) {
                onConfirm(nextOptions);
              }
            }}
          >
            {livePreview.calories > 0
              ? t('actionTags.scan.confirmWithCalories', {
                  defaultValue: 'Log (+{{calories}} kcal)',
                  calories: livePreview.calories,
                })
              : t('actionTags.scan.confirmAction', {
                  defaultValue: 'Log it',
                })}
          </Button>
        </View>
      </View>
    </View>
  );
};
