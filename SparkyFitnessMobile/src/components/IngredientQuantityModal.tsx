import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  type TextInput,
} from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from 'react-native-keyboard-controller';
import { useCSSVariable } from 'uniwind';
import { getConversionFactor } from '@workspace/shared';
import Button from './ui/Button';
import StepperInput from './StepperInput';
import Icon from './Icon';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel, roundedEnergy } from '../utils/energyUnit';
import { useFoodVariants } from '../hooks/useFoodVariants';
import {
  canAutoConvertToUnit,
  useUnitConversion,
} from '../hooks/useUnitConversion';
import { buildLocalUnitVariants } from '../utils/foodDetails';
import { localizeFoodUnit } from '../utils/foodUnitLocalization';
import type { FoodUnitVariant } from '../types/foodUnitVariants';
import type { MealFood } from '../types/meals';

export interface IngredientQuantityModalProps {
  visible: boolean;
  ingredient: MealFood | null;
  onClose: () => void;
  onSave: (updatedQuantity: number, updatedFood?: Partial<MealFood>) => void;
  onRemove?: () => void;
}

function ingredientToUnitVariant(ingredient: MealFood): FoodUnitVariant {
  return {
    id: ingredient.variant_id,
    serving_size: ingredient.serving_size > 0 ? ingredient.serving_size : 1,
    serving_unit: ingredient.serving_unit || ingredient.unit || 'serving',
    calories: ingredient.calories || 0,
    protein: ingredient.protein || 0,
    carbs: ingredient.carbs || 0,
    fat: ingredient.fat || 0,
    dietary_fiber: ingredient.dietary_fiber,
    saturated_fat: ingredient.saturated_fat,
    sodium: ingredient.sodium,
    sugars: ingredient.sugars,
    trans_fat: ingredient.trans_fat,
    potassium: ingredient.potassium,
    calcium: ingredient.calcium,
    iron: ingredient.iron,
    caffeine_mg: ingredient.caffeine_mg,
    water_ml: ingredient.water_ml,
    alcohol_g: ingredient.alcohol_g,
    cholesterol: ingredient.cholesterol,
    vitamin_a: ingredient.vitamin_a,
    vitamin_c: ingredient.vitamin_c,
    polyunsaturated_fat: ingredient.polyunsaturated_fat,
    monounsaturated_fat: ingredient.monounsaturated_fat,
    custom_nutrients: ingredient.custom_nutrients,
  };
}

export default function IngredientQuantityModal({
  visible,
  ingredient,
  onClose,
  onSave,
  onRemove,
}: IngredientQuantityModalProps) {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const inputRef = useRef<TextInput>(null);
  const [accentColorRaw, textSecondaryColorRaw] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]);
  const accentColor =
    typeof accentColorRaw === 'string' ? accentColorRaw : undefined;
  const textSecondaryColor =
    typeof textSecondaryColorRaw === 'string'
      ? textSecondaryColorRaw
      : undefined;

  const fallbackVariant = useMemo<FoodUnitVariant>(() => {
    return ingredient
      ? ingredientToUnitVariant(ingredient)
      : {
          serving_size: 1,
          serving_unit: 'serving',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        };
  }, [ingredient]);

  const signature =
    visible && ingredient ? `${ingredient.id}-${ingredient.quantity}` : '';
  const [prevSignature, setPrevSignature] = useState(signature);
  const [quantityText, setQuantityText] = useState(
    ingredient ? String(ingredient.quantity > 0 ? ingredient.quantity : 1) : ''
  );
  const [selectedVariant, setSelectedVariant] =
    useState<FoodUnitVariant>(fallbackVariant);
  const [selectedUnit, setSelectedUnit] = useState<string>(
    ingredient?.unit || 'serving'
  );
  const [isUnitPickerOpen, setIsUnitPickerOpen] = useState(false);

  // Sync state when active ingredient opens or changes
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    if (visible && ingredient) {
      setQuantityText(
        String(ingredient.quantity > 0 ? ingredient.quantity : 1)
      );
      setSelectedVariant(fallbackVariant);
      setSelectedUnit(ingredient.unit || fallbackVariant.serving_unit);
      setIsUnitPickerOpen(false);
    }
  }

  // Load database variants for the food if available
  const { variants: dbVariants } = useFoodVariants(ingredient?.food_id ?? '', {
    enabled: visible && Boolean(ingredient?.food_id),
  });

  const allVariants = useMemo<FoodUnitVariant[]>(() => {
    const loaded = buildLocalUnitVariants(dbVariants);
    if (loaded.length === 0) return [fallbackVariant];
    const hasCurrent = loaded.some(
      (v) =>
        (fallbackVariant.id && v.id === fallbackVariant.id) ||
        (v.serving_unit.toLowerCase() ===
          fallbackVariant.serving_unit.toLowerCase() &&
          v.serving_size === fallbackVariant.serving_size)
    );
    return hasCurrent ? loaded : [fallbackVariant, ...loaded];
  }, [dbVariants, fallbackVariant]);

  const { convertibleUnits, buildConvertedVariant } = useUnitConversion({
    variants: allVariants,
    selectedVariant,
  });

  const parsedQuantity = useMemo(() => {
    const val = parseDecimalInput(quantityText);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }, [quantityText]);

  const scale = useMemo(() => {
    if (selectedVariant.serving_size <= 0) return 0;
    return parsedQuantity / selectedVariant.serving_size;
  }, [selectedVariant.serving_size, parsedQuantity]);

  const previewCalories = useMemo(() => {
    return roundedEnergy((selectedVariant.calories || 0) * scale, energyUnit);
  }, [selectedVariant.calories, scale, energyUnit]);

  const previewProtein = useMemo(() => {
    return Math.round((selectedVariant.protein || 0) * scale);
  }, [selectedVariant.protein, scale]);

  const previewCarbs = useMemo(() => {
    return Math.round((selectedVariant.carbs || 0) * scale);
  }, [selectedVariant.carbs, scale]);

  const previewFat = useMemo(() => {
    return Math.round((selectedVariant.fat || 0) * scale);
  }, [selectedVariant.fat, scale]);

  const handleTextChange = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setQuantityText(text);
    }
  };

  const handleAdjust = (delta: number) => {
    const current = parsedQuantity;
    const next = Math.max(0, current + delta);
    setQuantityText(String(next));
  };

  const handleSelectVariant = (variant: FoodUnitVariant) => {
    const oldUnit = selectedUnit;
    const newUnit = variant.serving_unit;
    setSelectedVariant(variant);
    setSelectedUnit(newUnit);
    setIsUnitPickerOpen(false);

    const factor = getConversionFactor(oldUnit, newUnit);
    if (factor !== null && parsedQuantity > 0) {
      const newQty = Math.round(parsedQuantity * factor * 100) / 100;
      setQuantityText(String(newQty));
    } else if (variant.serving_size > 0) {
      setQuantityText(String(variant.serving_size));
    }
  };

  const handleSelectConvertibleUnit = (targetUnit: string) => {
    const converted = buildConvertedVariant(targetUnit);
    if (!converted) return;

    const oldUnit = selectedUnit;
    setSelectedVariant(converted);
    setSelectedUnit(targetUnit);
    setIsUnitPickerOpen(false);

    const factor = getConversionFactor(oldUnit, targetUnit);
    if (factor !== null && parsedQuantity > 0) {
      const newQty = Math.round(parsedQuantity * factor * 100) / 100;
      setQuantityText(String(newQty));
    } else {
      setQuantityText('1');
    }
  };

  const handleApply = () => {
    if (parsedQuantity > 0) {
      onSave(parsedQuantity, {
        quantity: parsedQuantity,
        unit: selectedUnit,
        serving_size: selectedVariant.serving_size,
        serving_unit: selectedVariant.serving_unit,
        variant_id: selectedVariant.id,
        calories: selectedVariant.calories,
        protein: selectedVariant.protein,
        carbs: selectedVariant.carbs,
        fat: selectedVariant.fat,
        dietary_fiber: selectedVariant.dietary_fiber,
        saturated_fat: selectedVariant.saturated_fat,
        sodium: selectedVariant.sodium,
        sugars: selectedVariant.sugars,
        trans_fat: selectedVariant.trans_fat,
        potassium: selectedVariant.potassium,
        calcium: selectedVariant.calcium,
        iron: selectedVariant.iron,
        caffeine_mg: selectedVariant.caffeine_mg,
        water_ml: selectedVariant.water_ml,
        alcohol_g: selectedVariant.alcohol_g,
        cholesterol: selectedVariant.cholesterol,
        vitamin_a: selectedVariant.vitamin_a,
        vitamin_c: selectedVariant.vitamin_c,
        polyunsaturated_fat: selectedVariant.polyunsaturated_fat,
        monounsaturated_fat: selectedVariant.monounsaturated_fat,
        custom_nutrients: selectedVariant.custom_nutrients ?? undefined,
      });
      onClose();
    }
  };

  const savedOptions = useMemo(() => {
    return allVariants.map((variant) => {
      const isSelected =
        selectedVariant.id != null && variant.id != null
          ? variant.id === selectedVariant.id
          : selectedUnit.toLowerCase() === variant.serving_unit.toLowerCase() &&
            selectedVariant.serving_size === variant.serving_size;
      const localized = localizeFoodUnit(variant.serving_unit, t);
      const label =
        variant.serving_size > 0 && variant.serving_unit
          ? `${variant.serving_size} ${localized}`
          : localized;
      return {
        key: `variant-${variant.id ?? variant.serving_unit}-${variant.serving_size}`,
        label,
        isSelected,
        variant,
      };
    });
  }, [allVariants, selectedVariant, selectedUnit, t]);

  const standardOptions = useMemo(() => {
    const compatible = convertibleUnits.filter((u) =>
      canAutoConvertToUnit(allVariants, selectedVariant, u)
    );
    return compatible.map((unit) => ({
      key: `standard-${unit}`,
      unit,
      label: localizeFoodUnit(unit, t),
      isSelected: selectedUnit.toLowerCase() === unit.toLowerCase(),
    }));
  }, [convertibleUnits, allVariants, selectedVariant, selectedUnit, t]);

  const hasMultipleUnitChoices =
    savedOptions.length > 1 || standardOptions.length > 0;

  if (!ingredient) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => inputRef.current?.focus()}
    >
      <KeyboardProvider>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable
            className="flex-1 justify-center px-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onPress={onClose}
            accessibilityLabel={t('common.cancel', { defaultValue: 'Cancel' })}
          >
            <Pressable
              className="bg-surface rounded-2xl p-5 shadow-lg border border-border-subtle gap-4"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="gap-1">
                <Text
                  className="text-text-primary text-lg font-bold"
                  numberOfLines={2}
                >
                  {ingredient.food_name ||
                    t('common.food', { defaultValue: 'Food' })}
                </Text>
                {ingredient.brand ? (
                  <Text
                    className="text-text-secondary text-sm"
                    numberOfLines={1}
                  >
                    {ingredient.brand}
                  </Text>
                ) : null}
              </View>

              <View className="bg-raised rounded-xl p-3 border border-border-subtle items-center gap-2">
                <View className="flex-row items-center justify-between w-full">
                  <Text className="text-text-secondary text-sm font-medium">
                    {t('mealDetail.quantity', { defaultValue: 'Quantity' })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (hasMultipleUnitChoices) {
                        setIsUnitPickerOpen((prev) => !prev);
                      }
                    }}
                    disabled={!hasMultipleUnitChoices}
                    className="flex-row items-center gap-1.5 bg-surface px-2.5 py-1 rounded-lg border border-border-subtle"
                    accessibilityRole="button"
                    accessibilityLabel={t('mealDetail.changeUnit', {
                      defaultValue: 'Change unit',
                    })}
                  >
                    <Text className="text-text-primary text-sm font-semibold">
                      {localizeFoodUnit(selectedUnit, t)}
                    </Text>
                    {hasMultipleUnitChoices ? (
                      <Icon
                        name={isUnitPickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={textSecondaryColor}
                      />
                    ) : null}
                  </TouchableOpacity>
                </View>

                {isUnitPickerOpen ? (
                  <View className="w-full max-h-52 bg-surface rounded-xl border border-border-subtle my-2 overflow-hidden">
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                      {savedOptions.length > 0 && (
                        <View className="p-2 border-b border-border-subtle">
                          <Text className="text-text-muted text-xs font-semibold px-2 py-1 uppercase">
                            {t('mealDetail.savedPortions', {
                              defaultValue: 'Saved Portions',
                            })}
                          </Text>
                          {savedOptions.map((opt) => (
                            <TouchableOpacity
                              key={opt.key}
                              onPress={() => handleSelectVariant(opt.variant)}
                              className={`flex-row items-center justify-between px-3 py-2 rounded-lg ${
                                opt.isSelected ? 'bg-raised' : ''
                              }`}
                            >
                              <Text
                                className={`text-sm ${
                                  opt.isSelected
                                    ? 'font-semibold text-accent-primary'
                                    : 'text-text-primary'
                                }`}
                              >
                                {opt.label}
                              </Text>
                              {opt.isSelected && (
                                <Icon
                                  name="checkmark"
                                  size={16}
                                  color={accentColor}
                                />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {standardOptions.length > 0 && (
                        <View className="p-2">
                          <Text className="text-text-muted text-xs font-semibold px-2 py-1 uppercase">
                            {t('mealDetail.standardUnits', {
                              defaultValue: 'Standard Units',
                            })}
                          </Text>
                          {standardOptions.map((opt) => (
                            <TouchableOpacity
                              key={opt.key}
                              onPress={() =>
                                handleSelectConvertibleUnit(opt.unit)
                              }
                              className={`flex-row items-center justify-between px-3 py-2 rounded-lg ${
                                opt.isSelected ? 'bg-raised' : ''
                              }`}
                            >
                              <Text
                                className={`text-sm ${
                                  opt.isSelected
                                    ? 'font-semibold text-accent-primary'
                                    : 'text-text-primary'
                                }`}
                              >
                                {opt.label}
                              </Text>
                              {opt.isSelected && (
                                <Icon
                                  name="checkmark"
                                  size={16}
                                  color={accentColor}
                                />
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </ScrollView>
                  </View>
                ) : (
                  <>
                    <View className="flex-row items-center justify-center my-1">
                      <StepperInput
                        inputRef={inputRef}
                        value={quantityText}
                        onChangeText={handleTextChange}
                        onDecrement={() => handleAdjust(-10)}
                        onIncrement={() => handleAdjust(10)}
                      />
                    </View>
                    <Text className="text-text-muted text-xs">
                      {previewCalories} {energyUnitLabel(energyUnit, t)} ·{' '}
                      {previewProtein}g{' '}
                      {t('mealDetail.protein', { defaultValue: 'protein' })} ·{' '}
                      {previewCarbs}g{' '}
                      {t('mealDetail.carbs', { defaultValue: 'carbs' })} ·{' '}
                      {previewFat}g{' '}
                      {t('mealDetail.fat', { defaultValue: 'fat' })}
                    </Text>
                  </>
                )}
              </View>

              <View className="gap-2 pt-1">
                <Button
                  variant="primary"
                  onPress={handleApply}
                  disabled={parsedQuantity <= 0}
                  accessibilityLabel={t('common.apply', {
                    defaultValue: 'Apply',
                  })}
                >
                  <Text className="text-white text-base font-semibold">
                    {t('common.apply', { defaultValue: 'Apply' })}
                  </Text>
                </Button>

                {onRemove ? (
                  <Button
                    variant="ghost"
                    onPress={() => {
                      onRemove();
                      onClose();
                    }}
                    accessibilityLabel={t('mealDetail.removeIngredient', {
                      defaultValue: 'Remove from Meal',
                    })}
                  >
                    <Text className="text-danger text-sm font-semibold">
                      {t('mealDetail.removeIngredient', {
                        defaultValue: 'Remove from Meal',
                      })}
                    </Text>
                  </Button>
                ) : null}

                <Button
                  variant="secondary"
                  onPress={onClose}
                  accessibilityLabel={t('common.cancel', {
                    defaultValue: 'Cancel',
                  })}
                >
                  <Text className="text-text-primary text-base font-medium">
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Text>
                </Button>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
