import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  CONFIDENCE_TONES,
  ESTIMATE_MACRO_KEYS,
  type ConfidenceTone,
  type EstimateMacros,
} from '@workspace/shared';
import Icon from './Icon';
import FormInput from './FormInput';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import type { IngredientDraftRow } from '../hooks/useFoodPhotoIngredientDraft';

const TONE_BG_CLASS: Record<ConfidenceTone, string> = {
  success: 'bg-bg-success',
  warning: 'bg-bg-warning',
  error: 'bg-bg-danger-subtle',
};

const TONE_TEXT_CLASS: Record<ConfidenceTone, string> = {
  success: 'text-text-success',
  warning: 'text-text-warning',
  error: 'text-text-danger-subtle',
};

/**
 * The editable macro fields, in display order.
 *
 * Each label is a literal `t()` call rather than an interpolated key, so the
 * i18n audit can statically find every key this component uses.
 */
const MACRO_FIELDS: {
  key: keyof EstimateMacros;
  label: (t: TFunction) => string;
}[] = [
  {
    key: 'calories_kcal',
    label: (t) =>
      t('foodPhotoEstimate.ingredients.calories', { defaultValue: 'Calories' }),
  },
  {
    key: 'protein_g',
    label: (t) =>
      t('foodPhotoEstimate.ingredients.protein', { defaultValue: 'Protein (g)' }),
  },
  {
    key: 'carbs_g',
    label: (t) =>
      t('foodPhotoEstimate.ingredients.carbs', { defaultValue: 'Carbs (g)' }),
  },
  {
    key: 'fat_g',
    label: (t) =>
      t('foodPhotoEstimate.ingredients.fat', { defaultValue: 'Fat (g)' }),
  },
  {
    key: 'fiber_g',
    label: (t) =>
      t('foodPhotoEstimate.ingredients.fiber', { defaultValue: 'Fiber (g)' }),
  },
  {
    key: 'sugar_g',
    label: (t) =>
      t('foodPhotoEstimate.ingredients.sugar', { defaultValue: 'Sugar (g)' }),
  },
];

function display(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100);
}

export interface FoodPhotoIngredientRowProps {
  row: IngredientDraftRow;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onChangeGrams: (grams: number) => void;
  onChangeName: (name: string) => void;
  onChangeMacro: (key: keyof EstimateMacros, value: number) => void;
  onApplyMatch: () => void;
  onClearMatch: () => void;
  onRecalcFromGrams: () => void;
}

/**
 * One detected ingredient, collapsed to a summary line and expanded to an
 * editor.
 *
 * Collapsed shows what the user needs to scan the list; expanded adds eight
 * inputs. Only one row is open at a time (enforced by the reducer), which keeps
 * the on-screen input count manageable inside the keyboard-aware scroll view.
 */
const FoodPhotoIngredientRow: React.FC<FoodPhotoIngredientRowProps> = ({
  row,
  expanded,
  onToggle,
  onRemove,
  onChangeGrams,
  onChangeName,
  onChangeMacro,
  onApplyMatch,
  onClearMatch,
  onRecalcFromGrams,
}) => {
  const { t } = useTranslation();
  const [textPrimary, textDanger] = useCSSVariable([
    '--color-text-primary',
    '--color-text-danger-subtle',
  ]) as [string, string];

  // A row the user picked from their foods is not a guess: it shows its own
  // amount in its own unit and has no AI numbers to second-guess, so it skips
  // the confidence chip and the estimate editors.
  const isPickedFood = row.logAs !== undefined;

  const tone = CONFIDENCE_TONES[row.confidence];
  const confidenceLabel =
    row.confidence === 'high'
      ? t('foodPhotoEstimate.confidence.likely', { defaultValue: 'Likely' })
      : row.confidence === 'medium'
        ? t('foodPhotoEstimate.confidence.possible', { defaultValue: 'Possible' })
        : t('foodPhotoEstimate.confidence.uncertain', { defaultValue: 'Uncertain' });

  // Only offer the swap when the matched variant actually has gram-scaled
  // nutrition; a variant measured in cups has nothing to apply.
  const canApplyMatch = Boolean(row.match?.scaled);

  const handleNumeric = (text: string, apply: (value: number) => void) => {
    if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
    apply(text === '' ? 0 : parseDecimalInput(text));
  };

  return (
    <View className="rounded-lg bg-raised mb-2 overflow-hidden">
      <View className="flex-row items-center p-3">
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.7}
          className="flex-1 pr-2"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={t('foodPhotoEstimate.ingredients.editRow', {
            defaultValue: 'Edit {{name}}',
            name: row.name,
          })}
        >
          <View className="flex-row items-center">
            <Text
              className="text-text-primary text-base font-medium flex-1 pr-2"
              numberOfLines={2}
            >
              {row.name}
              {row.preparation ? (
                <Text className="text-text-secondary font-normal">
                  {' '}
                  · {row.preparation}
                </Text>
              ) : null}
            </Text>
            {isPickedFood ? null : (
              <View className={`px-2 py-0.5 rounded-full ${TONE_BG_CLASS[tone]}`}>
                <Text
                  className={`text-xs font-semibold ${TONE_TEXT_CLASS[tone]}`}
                >
                  {confidenceLabel}
                </Text>
              </View>
            )}
          </View>
          <Text className="text-text-secondary text-sm mt-0.5">
            {row.logAs
              ? t('foodPhotoEstimate.ingredients.pickedRowSummary', {
                  defaultValue: '{{quantity}} {{unit}} · {{calories}} kcal',
                  quantity: row.logAs.quantity,
                  unit: row.logAs.unit,
                  calories: Math.round(row.macros.calories_kcal),
                })
              : t('foodPhotoEstimate.ingredients.rowSummary', {
                  defaultValue: '{{grams}} g · {{calories}} kcal',
                  grams: Math.round(row.grams),
                  calories: Math.round(row.macros.calories_kcal),
                })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('foodPhotoEstimate.ingredients.remove', {
            defaultValue: 'Remove {{name}}',
            name: row.name,
          })}
          className="px-2"
        >
          <Icon name="close" size={18} color={textDanger} />
        </TouchableOpacity>
        <Icon
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={textPrimary}
        />
      </View>

      {canApplyMatch ? (
        <TouchableOpacity
          onPress={row.matchApplied ? onClearMatch : onApplyMatch}
          activeOpacity={0.7}
          className="flex-row items-center px-3 pb-3"
          accessibilityRole="button"
        >
          <Icon
            name={row.matchApplied ? 'checkmark' : 'add'}
            size={14}
            color={textPrimary}
          />
          <Text className="text-text-secondary text-xs ml-1.5 flex-1">
            {row.matchApplied
              ? t('foodPhotoEstimate.match.usingYourFood', {
                  defaultValue: 'Using your food: {{name}} · tap to use the AI estimate',
                  name: row.match?.food_name ?? '',
                })
              : t('foodPhotoEstimate.match.useYourFood', {
                  defaultValue: 'From your foods: {{name}} · tap to use it',
                  name: row.match?.food_name ?? '',
                })}
          </Text>
        </TouchableOpacity>
      ) : null}

      {expanded && isPickedFood ? (
        <View className="px-3 pb-3 border-t border-border-subtle pt-3">
          {/* Nothing to edit: the numbers come from the saved food and the
              amount was chosen in the picker. Editing them here would detach
              the row from the food it logs against. */}
          <Text className="text-text-secondary text-xs">
            {t('foodPhotoEstimate.ingredients.pickedFoodNote', {
              defaultValue:
                'Added from your foods. Remove it and add it again to change the amount.',
            })}
          </Text>
        </View>
      ) : null}

      {expanded && !isPickedFood ? (
        <View className="px-3 pb-3 border-t border-border-subtle pt-3">
          <Text className="text-text-secondary text-xs mb-1">
            {t('foodPhotoEstimate.ingredients.name', { defaultValue: 'Name' })}
          </Text>
          <FormInput value={row.name} onChangeText={onChangeName} className="mb-3" />

          <Text className="text-text-secondary text-xs mb-1">
            {t('foodPhotoEstimate.ingredients.grams', { defaultValue: 'Weight (g)' })}
          </Text>
          <FormInput
            value={display(row.grams)}
            onChangeText={(text) => handleNumeric(text, onChangeGrams)}
            keyboardType="decimal-pad"
            className="mb-3"
          />

          {row.manualOverride ? (
            <TouchableOpacity
              onPress={onRecalcFromGrams}
              activeOpacity={0.7}
              className="mb-3"
              accessibilityRole="button"
            >
              <Text className="text-text-secondary text-xs">
                {t('foodPhotoEstimate.ingredients.recalcFromGrams', {
                  defaultValue:
                    'Nutrition was edited by hand, so it no longer follows the weight. Tap to recalculate from the weight.',
                })}
              </Text>
            </TouchableOpacity>
          ) : null}

          <View className="flex-row flex-wrap -mx-1">
            {MACRO_FIELDS.map((field) => (
              <View key={field.key} className="w-1/2 px-1 mb-3">
                <Text className="text-text-secondary text-xs mb-1">
                  {field.label(t)}
                </Text>
                <FormInput
                  value={display(row.macros[field.key])}
                  onChangeText={(text) =>
                    handleNumeric(text, (value) => onChangeMacro(field.key, value))
                  }
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </View>

          {row.assumptions.length > 0 ? (
            <Text className="text-text-secondary text-xs italic">
              {row.assumptions.join(' · ')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export { MACRO_FIELDS, ESTIMATE_MACRO_KEYS };
export default FoodPhotoIngredientRow;
