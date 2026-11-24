import * as Haptics from 'expo-haptics';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import {
  ACTION_TAG_MAX_QUANTITY,
  type ActionTagResponse,
} from '@workspace/shared';
import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useServerConnection } from '../hooks';
import { useAdjustedDailyGoal, useGoalsQuery } from '../hooks/useGoals';
import { useFood } from '../hooks/useFoods';
import { useFoodVariants } from '../hooks/useFoodVariants';
import { useMeal } from '../hooks/useMeals';
import { useMealTypes } from '../hooks/useMealTypes';
import { useWaterContainersQuery } from '../hooks/useWaterContainers';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { ApiError } from '../services/api/errors';
import { scanActionTag } from '../services/api/actionTagsApi';
import { refreshAfterTagAction, undoTagAction } from '../services/tagActions';
import type { RootStackScreenProps } from '../types/navigation';
import { formatLocalizedNumber } from '../localization';
import { toLocalDateString } from '../utils/dateUtils';
import {
  buildMealDisplayValuesFromFoods,
  getMealTypeDisplayLabel,
} from '../utils/mealNutrition';

type ActionTagScanScreenProps = RootStackScreenProps<'ActionTagScan'>;

type ScanOverride =
  | { drinks_override: number }
  | { water_ml_override: number }
  | { quantity_override: number };

type ScanConfirmOptions = {
  override?: ScanOverride;
  mealTypeId?: string;
  entryTime?: string;
};

type Phase =
  | { kind: 'running' }
  | { kind: 'confirm'; tag: ActionTagResponse }
  | { kind: 'unknown' }
  | { kind: 'missing'; tag: ActionTagResponse }
  | { kind: 'failed'; serverTooOld: boolean };

const UNDO_VISIBLE_MS = 7000;
const MULTIPLIER_PRESETS = [0.5, 1, 1.5, 2] as const;
const WATER_ML_PRESETS = [250, 500, 750] as const;
const WATER_DRINK_PRESETS = [1, 2, 3] as const;

function formatInputNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function formatDisplayNumber(value: number, maximumFractionDigits = 2): string {
  return formatLocalizedNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function normalizeHhMm(raw: string): string | undefined {
  const trimmed = raw.trim();
  const amPmMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (amPmMatch) {
    const rawHours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2]);
    const period = amPmMatch[3].toUpperCase();
    if (rawHours < 1 || rawHours > 12 || minutes < 0 || minutes > 59) {
      return undefined;
    }
    let hours = rawHours % 12;
    if (period === 'PM') {
      hours += 12;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function triggerScanHaptic(style: 'light' | 'medium' = 'light'): void {
  try {
    const level =
      style === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
    void Haptics.impactAsync(level);
  } catch {
    // Haptics module unavailable -> ignore silently
  }
}

const LAST_AMOUNT_KEY_PREFIX = '@SparkyFitness/action-tag-last-amount:';

type LastUsedAmount = {
  value: number;
  unit: string;
};

async function loadLastUsedAmount(
  tagId: string
): Promise<LastUsedAmount | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LAST_AMOUNT_KEY_PREFIX}${tagId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastUsedAmount>;
    if (
      typeof parsed.value === 'number' &&
      Number.isFinite(parsed.value) &&
      parsed.value > 0 &&
      typeof parsed.unit === 'string' &&
      parsed.unit.length > 0
    ) {
      return { value: parsed.value, unit: parsed.unit };
    }
    return null;
  } catch {
    return null;
  }
}

async function saveLastUsedAmount(
  tagId: string,
  entry: LastUsedAmount
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${LAST_AMOUNT_KEY_PREFIX}${tagId}`,
      JSON.stringify(entry)
    );
  } catch {
    // Treat storage errors as non-blocking
  }
}

function formatCurrentTimeHhMm(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function parseContainerMl(volume: unknown, unit: unknown): number {
  const num = Number(volume);
  if (!Number.isFinite(num) || num <= 0) return 250;
  const u = String(unit ?? 'ml')
    .trim()
    .toLowerCase();
  if (u === 'l' || u === 'liter' || u === 'litre') return num * 1000;
  return num;
}

const ConfirmAmountPicker: React.FC<{
  tag: ActionTagResponse;
  entryDate: string;
  onOpenSettings: () => void;
  onConfirm: (options?: ScanConfirmOptions) => void;
  onCancel: () => void;
}> = ({
  tag,
  entryDate,
  doubleScanNotice,
  onOpenSettings,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const action = tag.action;
  const isWater = action.type === 'water';
  const advancedEnabled = Boolean(tag.advanced_mode);
  const tapToLogEnabled = Boolean(tag.advanced_mode && tag.tap_to_log);
  const allowCustomTimestamp = Boolean(tag.allow_custom_timestamp);

  const { containers } = useWaterContainersQuery({ enabled: isWater });
  const waterContainer = useMemo(
    () =>
      isWater
        ? containers.find((c) => c.id === action.container_id)
        : undefined,
    [action, containers, isWater]
  );
  const containerMl = useMemo(
    () =>
      waterContainer
        ? parseContainerMl(waterContainer.volume, waterContainer.unit)
        : 250,
    [waterContainer]
  );

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

  const waterUsesMl = useMemo(
    () =>
      isWater &&
      (advancedEnabled ||
        String(waterContainer?.unit ?? '')
          .trim()
          .toLowerCase() === 'ml' ||
        (Array.isArray(tag.preset_amounts) && tag.preset_amounts.length > 0)),
    [advancedEnabled, isWater, tag.preset_amounts, waterContainer?.unit]
  );

  const defaultValue = useMemo(() => {
    if (isWater) {
      return waterUsesMl
        ? Math.max(50, Math.round(action.drinks * containerMl))
        : action.drinks;
    }
    return action.quantity;
  }, [action, containerMl, isWater, waterUsesMl]);

  const baseUnit = useMemo(() => {
    if (isWater) return waterUsesMl ? 'ml' : 'drinks';
    return action.unit;
  }, [action, isWater, waterUsesMl]);

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
    if (isWater) return ['ml', 'drinks'];
    if (
      action.type === 'food' &&
      variantServingSize &&
      action.unit !== 'serving'
    ) {
      return [action.unit, 'serving'];
    }
    return [action.unit];
  }, [action, isWater, variantServingSize]);

  const [selectedUnit, setSelectedUnit] = useState<string>(baseUnit);
  const [unitPickerOpen, setUnitPickerOpen] = useState<boolean>(false);
  const [selectedValue, setSelectedValue] = useState<number>(defaultValue);
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
      if (selectedUnit === 'ml' && nextUnit === 'drinks') {
        nextValue = Math.max(
          1,
          Math.round(selectedValue / Math.max(1, containerMl))
        );
      } else if (selectedUnit === 'drinks' && nextUnit === 'ml') {
        nextValue = Math.max(
          1,
          Math.round(selectedValue * Math.max(1, containerMl))
        );
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
  const [customInput, setCustomInput] = useState<string>(
    formatInputNumber(defaultValue)
  );

  const presets = useMemo(() => {
    if (Array.isArray(tag.preset_amounts) && tag.preset_amounts.length > 0) {
      return tag.preset_amounts.map((val, idx) => ({
        key: `custom-preset-${idx}-${val}`,
        label:
          selectedUnit === 'ml'
            ? `${formatDisplayNumber(val)} ml`
            : isWater
              ? `${formatDisplayNumber(val)}\u00d7`
              : `${formatDisplayNumber(val)} ${selectedUnit}`,
        value: val,
      }));
    }
    if (isWater) {
      if (selectedUnit === 'ml') {
        return WATER_ML_PRESETS.map((ml) => ({
          key: `ml-${ml}`,
          label: `${ml} ml`,
          value: ml,
        }));
      }
      return WATER_DRINK_PRESETS.map((drinks) => ({
        key: `drinks-${drinks}`,
        label: `${drinks}\u00d7`,
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
      label: `${mult}\u00d7`,
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
      const mlAmount =
        selectedUnit === 'ml' ? selectedValue : selectedValue * containerMl;
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
        if (targetUnit === 'ml') {
          const ml = Math.min(10000, Math.max(1, Math.round(targetVal)));
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
            quantityInActionUnit = action.quantity;
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

        {/* Live-Vorschau-Karte */}
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
                {formatDisplayNumber(selectedValue)} {selectedUnit} ·{' '}
                {formatDisplayNumber(livePreview.calories, 0)}{' '}
                {t('actionTags.scan.kcalUnit', { defaultValue: 'kcal' })}
                {livePreview.goalPercent !== null
                  ? ` · ${formatDisplayNumber(livePreview.goalPercent, 0)}% ${t(
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

      {/* Daumen-Zone unten: alles ab Meal baut sich direkt über LOG auf */}
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

        {/* Primär-Button ganz unten */}
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

const ActionTagScanScreen: React.FC<ActionTagScanScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { code } = route.params;
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const [phase, setPhase] = useState<Phase>({ kind: 'running' });
  const lastTagRef = useRef<ActionTagResponse | null>(null);
  const startedRef = useRef(false);

  const entryDate = useMemo(() => toLocalDateString(new Date()), []);

  const leave = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Tabs', { screen: 'Dashboard' });
    }
  }, [navigation]);

  const run = useCallback(
    async (confirmed: boolean, options?: ScanConfirmOptions) => {
      try {
        const result = await scanActionTag({
          tag_code: code,
          entry_date: entryDate,
          confirmed: confirmed || undefined,
          ...(confirmed && options?.override ? options.override : undefined),
          ...(confirmed && options?.mealTypeId
            ? { meal_type_id: options.mealTypeId }
            : undefined),
          ...(confirmed && options?.entryTime
            ? { entry_time: options.entryTime }
            : undefined),
        });
        switch (result.status) {
          case 'done': {
            const tag = result.tag;
            if (tag) refreshAfterTagAction(queryClient, tag.action, entryDate);
            Toast.show({
              type: 'success',
              text1: t('actionTags.scan.logged', {
                defaultValue: 'Logged {{summary}}',
                summary: result.summary ?? tag?.label ?? '',
              }),
              text2: t('actionTags.scan.tapToUndo', {
                defaultValue: 'Tap to undo',
              }),
              visibilityTime: UNDO_VISIBLE_MS,
              onPress: () => {
                Toast.hide();
                if (!tag) return;
                undoTagAction(tag.action, entryDate, result.logged)
                  .then(() =>
                    refreshAfterTagAction(queryClient, tag.action, entryDate)
                  )
                  .catch(() =>
                    Toast.show({
                      type: 'error',
                      text1: t('actionTags.scan.undoFailed', {
                        defaultValue: 'Could not undo that',
                      }),
                    })
                  );
              },
            });
            leave();
            return;
          }
          case 'too_soon': {
            Toast.show({
              type: 'info',
              text1: t('actionTags.scan.tooSoon', {
                defaultValue: 'Already logged a moment ago',
              }),
            });
            leave();
            return;
          }
          case 'needs_confirmation':
            if (result.tag) {
              lastTagRef.current = result.tag;
              setPhase({ kind: 'confirm', tag: result.tag });
            }
            return;
          case 'target_missing':
            if (result.tag) setPhase({ kind: 'missing', tag: result.tag });
            return;
          case 'unknown_tag':
            setPhase({ kind: 'unknown' });
            return;
        }
      } catch (error) {
        setPhase({
          kind: 'failed',
          serverTooOld: error instanceof ApiError && error.statusCode === 404,
        });
      }
    },
    [code, entryDate, leave, queryClient, t]
  );

  const retry = useCallback(
    (confirmed: boolean, options?: ScanConfirmOptions) => {
      setPhase({ kind: 'running' });
      void run(confirmed, options);
    },
    [run]
  );

  useEffect(() => {
    if (!isConnected || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void run(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isConnected, run]);

  const header = useScreenHeader({
    title: t('actionTags.scan.title', { defaultValue: 'NFC tag' }),
    left: { kind: 'dismiss', onPress: leave, identifier: 'action-tag-close' },
  });

  const content = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          title={t('actionTags.scan.noServer', {
            defaultValue: 'Could not reach your server',
          })}
          subtitle={t('actionTags.scan.noServerSubtitle', {
            defaultValue: 'Check your connection, then tap the tag again.',
          })}
        />
      );
    }
    switch (phase.kind) {
      case 'running':
        return (
          <StatusView
            loading
            title={t('actionTags.scan.running', {
              defaultValue: 'Logging\u2026',
            })}
          />
        );
      case 'confirm': {
        const showPicker = Boolean(
          phase.tag.allow_amount_adjustment ||
          phase.tag.advanced_mode ||
          phase.tag.allow_custom_timestamp ||
          phase.doubleScanNotice
        );
        if (showPicker) {
          return (
            <ConfirmAmountPicker
              tag={phase.tag}
              entryDate={entryDate}
              doubleScanNotice={phase.doubleScanNotice}
              onOpenSettings={() =>
                navigation.navigate('ActionTagForm', { tagId: phase.tag.id })
              }
              onConfirm={(options) => retry(true, options)}
              onCancel={leave}
            />
          );
        }
        return (
          <StatusView
            icon="nfc"
            title={t('actionTags.scan.confirmTitle', {
              defaultValue: 'Log {{label}}?',
              label: phase.tag.label,
            })}
            action={{
              label: t('actionTags.scan.confirmAction', {
                defaultValue: 'Log it',
              }),
              onPress: () => retry(true),
              variant: 'primary',
            }}
          />
        );
      }
      case 'unknown':
        return (
          <StatusView
            icon="nfc"
            iconTone="muted"
            title={t('actionTags.scan.unknownTitle', {
              defaultValue: 'This tag is not set up on your account',
            })}
            subtitle={t('actionTags.scan.unknownSubtitle', {
              defaultValue:
                'Nothing was logged. Set it up to choose what a tap does.',
            })}
            action={{
              label: t('actionTags.scan.setUp', {
                defaultValue: 'Set up this tag',
              }),
              onPress: () =>
                navigation.replace('ActionTagForm', { tagCode: code }),
              variant: 'primary',
            }}
          />
        );
      case 'missing':
        return (
          <StatusView
            icon="alert-circle"
            iconTone="danger"
            title={t('actionTags.scan.missingTitle', {
              defaultValue: 'This tag points to something that was deleted',
            })}
            subtitle={t('actionTags.scan.missingSubtitle', {
              defaultValue:
                'Nothing was logged. Choose what the tag should do.',
            })}
            action={{
              label: t('actionTags.scan.fix', { defaultValue: 'Fix this tag' }),
              onPress: () =>
                navigation.replace('ActionTagForm', { tagId: phase.tag.id }),
              variant: 'primary',
            }}
          />
        );
      case 'failed':
        return (
          <StatusView
            icon="alert-circle"
            iconTone="danger"
            title={
              phase.serverTooOld
                ? t('actionTags.scan.serverTooOld', {
                    defaultValue: 'Your server does not support NFC tags yet',
                  })
                : t('actionTags.scan.failed', {
                    defaultValue: 'Could not log that',
                  })
            }
            subtitle={
              phase.serverTooOld
                ? t('actionTags.scan.serverTooOldSubtitle', {
                    defaultValue:
                      'Update your SparkyFitness server, then try again.',
                  })
                : t('actionTags.scan.failedSubtitle', {
                    defaultValue:
                      'Nothing was logged. Check your connection and try again.',
                  })
            }
            action={
              phase.serverTooOld
                ? undefined
                : {
                    label: t('common.retry', { defaultValue: 'Retry' }),
                    onPress: () => retry(false),
                    variant: 'primary',
                  }
            }
          />
        );
    }
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      {content()}
    </View>
  );
};

export default ActionTagScanScreen;
