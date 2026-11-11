import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type {
  RecipeImportPreview,
  RecipeImportCandidate,
  RecipeImportIngredient,
} from '@workspace/shared';
import { recipeImportMappingSchema } from '@workspace/shared';
import { useRecipeImport } from '../../hooks/useRecipeImport';
import { consumePendingRecipeImportSelection } from '../../services/recipeImportSelection';
import { fetchRecipeFood } from '../../services/api/recipeImportApi';
import { fetchFoodVariants } from '../../services/api/foodsApi';
import { fetchExternalFoodDetails } from '../../services/api/externalFoodSearchApi';
import {
  foodItemToFoodInfo,
  externalFoodItemToFoodInfo,
} from '../../types/foodInfo';
import type { RootStackScreenProps } from '../../types/navigation';
import {
  DECIMAL_INPUT_REGEX,
  parseDecimalInput,
} from '../../utils/numericInput';
import { formatLocalizedNumber } from '../../localization';
import FormInput from '../FormInput';
import Button from '../ui/Button';
import { recipeImportIssueLabel } from '../../utils/recipeImportIssueLabel';
import RecipeImportIngredientRow from './RecipeImportIngredientRow';
import RecipeImportSourcePanel from './RecipeImportSourcePanel';

export default function RecipeImportReview({
  preview,
  scope,
  navigation,
  onBack,
}: {
  preview: RecipeImportPreview;
  scope: string;
  navigation: RootStackScreenProps<'RecipeImport'>['navigation'];
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const draft = useRecipeImport(preview, scope);
  const [name, setName] = useState(preview.name);
  const [weight, setWeight] = useState('');
  const [servings, setServings] = useState(
    preview.recipeServings === null ? '' : String(preview.recipeServings)
  );
  const [mode, setMode] = useState<'grams' | 'servings'>('grams');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readySelections, setReadySelections] = useState<
    Record<string, string | null>
  >({});
  const onReadinessChange = useCallback(
    (id: string, selection: string | null) => {
      setReadySelections((current) =>
        current[id] === selection ? current : { ...current, [id]: selection }
      );
    },
    []
  );
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const { confirm } = draft;
  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingRecipeImportSelection();
      if (!selection || selection.target.draftKey !== draft.key) return;
      const { ingredient, target } = selection;
      const parsed = recipeImportMappingSchema.safeParse({
        ingredientId: target.ingredientId,
        foodId: ingredient.food_id,
        variantId: ingredient.variant_id,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        confirmed: true,
      });
      if (parsed.success) confirm(parsed.data);
    }, [draft.key, confirm])
  );
  function target(row: RecipeImportIngredient) {
    const mapping = draft.mappings[row.ingredientId];
    return {
      draftKey: draft.key,
      ingredientId: row.ingredientId,
      quantity: mapping?.quantity ?? row.quantity,
      unit: mapping?.unit ?? row.unit,
    };
  }
  async function candidate(
    row: RecipeImportIngredient,
    selected: RecipeImportCandidate
  ) {
    const request = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const item =
        selected.source === 'local' && selected.foodId
          ? foodItemToFoodInfo(await fetchRecipeFood(selected.foodId))
          : selected.providerType && selected.providerExternalId
            ? externalFoodItemToFoodInfo(
                await fetchExternalFoodDetails(
                  selected.providerType,
                  selected.providerExternalId,
                  selected.providerId,
                  {
                    serving_size: selected.servingSize,
                    serving_unit: selected.servingUnit,
                  }
                )
              )
            : null;
      if (!item || generation.current !== request) return;
      const variants =
        selected.source === 'local' && selected.foodId
          ? await fetchFoodVariants(selected.foodId)
          : undefined;
      if (generation.current !== request) return;
      const variant = variants?.find(
        (value) => value.id === selected.variantId
      );
      if (selected.source === 'local' && !variant)
        throw new Error(
          t('recipeImport.foodUnavailable', {
            defaultValue: 'Food details could not be loaded. Try again.',
          })
        );
      navigation.navigate('FoodEntryAdd', {
        item: variant
          ? {
              ...item,
              variantId: variant.id,
              servingSize: variant.serving_size,
              servingUnit: variant.serving_unit,
              calories: variant.calories,
              protein: variant.protein,
              carbs: variant.carbs,
              fat: variant.fat,
            }
          : item,
        ...(variant ? { selectedVariantOverride: variant } : {}),
        pickerMode: 'meal-builder',
        recipeImportTarget: target(row),
        returnDepth: 1,
      });
    } catch (failure) {
      if (generation.current === request)
        setError(
          failure instanceof Error
            ? failure.message
            : t('recipeImport.foodUnavailable', {
                defaultValue: 'Food details could not be loaded. Try again.',
              })
        );
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }
  async function save() {
    setError(null);
    const cooked = parseDecimalInput(weight);
    const yieldCount = parseDecimalInput(servings);
    if (
      !name.trim() ||
      !yieldCount ||
      yieldCount <= 0 ||
      (mode === 'grams' && weight.trim() !== '' && (!cooked || cooked <= 0))
    ) {
      setError(
        t('recipeImport.invalidAmounts', {
          defaultValue: 'Enter a name and positive servings or cooked grams.',
        })
      );
      return;
    }
    try {
      await draft.save({
        name: name.trim(),
        servings: yieldCount,
        ...(mode === 'grams' && cooked ? { finishedWeightGrams: cooked } : {}),
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t('recipeImport.saveFailed', {
              defaultValue: 'Recipe could not be saved.',
            })
      );
    }
  }
  if (draft.saved)
    return (
      <View className="gap-4">
        <Text className="text-text-primary font-semibold">
          {t('recipeImport.saved', {
            defaultValue:
              'Meal saved. Log your portion through the normal meal flow.',
          })}
        </Text>
        <RecipeImportSourcePanel mealId={draft.saved.mealId} scope={scope} />
        <Button
          onPress={() =>
            navigation.replace('MealDetail', { mealId: draft.saved!.mealId })
          }
        >
          {t('recipeImport.openMeal', { defaultValue: 'Open saved meal' })}
        </Button>
      </View>
    );
  const unresolved = preview.ingredients.filter(
    (row) => !draft.mappings[row.ingredientId]
  ).length;
  const yieldValue = parseDecimalInput(servings);
  const yieldValid =
    Number.isFinite(yieldValue) && yieldValue > 0 && yieldValue <= 1e9;
  return (
    <View className="gap-4">
      <Text className="text-text-primary text-xl font-semibold">
        {preview.name}
      </Text>
      <Button variant="secondary" disabled={draft.saving} onPress={onBack}>
        {t('recipeImport.chooseRecipe', {
          defaultValue: 'Choose another recipe',
        })}
      </Button>
      <Text className="text-text-secondary">
        {t('recipeImport.batchExplanation', {
          defaultValue:
            'Ingredient amounts are for the whole recipe. The cooked weight only sets the portion denominator; enter consumed grams when logging later.',
        })}
      </Text>
      <FormInput
        accessibilityLabel={t('recipeImport.mealName', {
          defaultValue: 'Meal name',
        })}
        value={name}
        onChangeText={setName}
      />
      <Text className="text-text-secondary">
        {t('recipeImport.servings', { defaultValue: 'Recipe servings' })}
      </Text>
      <FormInput
        accessibilityLabel={t('recipeImport.servings', {
          defaultValue: 'Recipe servings',
        })}
        keyboardType="decimal-pad"
        value={servings}
        onChangeText={(text) => {
          if (DECIMAL_INPUT_REGEX.test(text)) setServings(text);
        }}
      />
      <View className="flex-row gap-2">
        <Button
          variant={mode === 'grams' ? 'primary' : 'secondary'}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'grams' }}
          onPress={() => setMode('grams')}
        >
          {t('recipeImport.grams', { defaultValue: 'Cooked grams' })}
        </Button>
        <Button
          variant={mode === 'servings' ? 'primary' : 'secondary'}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'servings' }}
          onPress={() => setMode('servings')}
        >
          {t('recipeImport.servingsOnly', { defaultValue: 'Servings only' })}
        </Button>
      </View>
      {mode === 'grams' && (
        <>
          <Text className="text-text-secondary">
            {t('recipeImport.finishedWeight', {
              defaultValue:
                'Cooked whole dish without the pot, in grams (optional)',
            })}
          </Text>
          <FormInput
            accessibilityLabel={t('recipeImport.finishedWeight', {
              defaultValue:
                'Cooked whole dish without the pot, in grams (optional)',
            })}
            value={weight}
            keyboardType="decimal-pad"
            onChangeText={(text) => {
              if (DECIMAL_INPUT_REGEX.test(text)) setWeight(text);
            }}
          />
        </>
      )}
      {preview.recipeServings === null && (
        <Text className="text-text-secondary">
          {t('recipeImport.missingSourceServingsReview', {
            defaultValue:
              'Enter servings for the saved meal. To sync nutrition later, set a positive serving count in Mealie and refresh the nutrition preview.',
          })}
        </Text>
      )}
      {preview.syncWarnings
        .filter(
          (warning) =>
            warning !== 'missing_servings' && warning !== 'incomplete_nutrition'
        )
        .map((warning) => (
          <Text key={warning} className="text-text-secondary">
            {recipeImportIssueLabel(warning, t)}
          </Text>
        ))}
      <Text className="text-text-secondary">
        {t('recipeImport.unresolvedRows', {
          defaultValue: 'Ingredients still to confirm: {{amount}}',
          amount: formatLocalizedNumber(unresolved),
        })}
      </Text>
      <Button
        variant="secondary"
        disabled={draft.suggesting || draft.saving || !unresolved}
        onPress={() => void draft.suggest(false)}
      >
        {t('recipeImport.match', { defaultValue: 'Find food candidates' })}
      </Button>
      <Button
        variant="secondary"
        disabled={draft.suggesting || draft.saving || !unresolved}
        onPress={() => void draft.suggest(true)}
      >
        {t('recipeImport.matchAi', { defaultValue: 'Suggest matches with AI' })}
      </Button>
      {draft.progress && (
        <Text className="text-text-secondary">
          {t('recipeImport.progress', {
            defaultValue: 'Matching {{done}} / {{total}} ingredients',
            done: formatLocalizedNumber(draft.progress.done),
            total: formatLocalizedNumber(draft.progress.total),
          })}
        </Text>
      )}
      {draft.warnings.map((warning) => (
        <Text key={warning} className="text-text-secondary">
          {warning}
        </Text>
      ))}
      {preview.ingredients.map((row, index) => (
        <RecipeImportIngredientRow
          key={row.ingredientId}
          ingredient={row}
          position={index + 1}
          mapping={draft.mappings[row.ingredientId]}
          suggestion={draft.suggestions.find(
            (value) => value.ingredientId === row.ingredientId
          )}
          scope={scope}
          onReadinessChange={onReadinessChange}
          disabled={draft.saving || busy}
          onChoose={() => {
            generation.current += 1;
            setBusy(false);
            navigation.navigate('FoodSearch', {
              pickerMode: 'meal-builder',
              recipeImportTarget: target(row),
            });
          }}
          onCandidate={(selected) => void candidate(row, selected)}
        />
      ))}
      {(error || draft.error) && (
        <Text accessibilityRole="alert" className="text-danger">
          {error || draft.error?.message}
        </Text>
      )}
      {draft.uncertain && (
        <Text accessibilityRole="alert" className="text-danger">
          {t('recipeImport.checkLibrary', {
            defaultValue:
              'Check your meals library before trying again. The save outcome is uncertain.',
          })}
        </Text>
      )}
      <Button
        disabled={
          draft.saving ||
          draft.uncertain ||
          !yieldValid ||
          !name.trim() ||
          unresolved > 0 ||
          preview.ingredients.some((row) => {
            const mapping = draft.mappings[row.ingredientId];
            return (
              !mapping ||
              readySelections[row.ingredientId] !==
                `${mapping.foodId}:${mapping.variantId}`
            );
          }) ||
          !preview.ingredients.length ||
          preview.ingredients.some((row) =>
            row.issues.includes('linked_recipe')
          )
        }
        loading={draft.saving}
        onPress={() => void save()}
      >
        {t('recipeImport.save', { defaultValue: 'Save reusable meal' })}
      </Button>
    </View>
  );
}
