import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { recipeImportNutritionGaps } from '@workspace/shared';
import type {
  RecipeImportIngredient,
  RecipeImportMapping,
  RecipeImportCandidate,
  RecipeImportSuggestionResponse,
} from '@workspace/shared';
import { fetchRecipeFood } from '../../services/api/recipeImportApi';
import { fetchFoodVariants } from '../../services/api/foodsApi';
import { formatLocalizedNumber } from '../../localization';
import Button from '../ui/Button';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';
import { formatEnergyNumber, energyUnitLabel } from '../../utils/energyUnit';
import { recipeImportIssueLabel } from '../../utils/recipeImportIssueLabel';

const number = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? formatLocalizedNumber(value, { maximumFractionDigits: 3 })
    : '?';
interface Props {
  ingredient: RecipeImportIngredient;
  mapping?: RecipeImportMapping;
  suggestion?: RecipeImportSuggestionResponse['ingredients'][number];
  scope: string;
  disabled: boolean;
  position?: number;
  onReadinessChange?: (ingredientId: string, selection: string | null) => void;
  onChoose: () => void;
  onCandidate: (candidate: RecipeImportCandidate) => void;
}
export default function RecipeImportIngredientRow({
  ingredient,
  mapping,
  suggestion,
  scope,
  disabled,
  position,
  onReadinessChange,
  onChoose,
  onCandidate,
}: Props) {
  const { t } = useTranslation();
  const originalQuantity =
    ingredient.originalQuantity === undefined
      ? ingredient.quantity
      : ingredient.originalQuantity;
  const energyUnit = useEnergyUnit();
  const energy = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? formatEnergyNumber(value, energyUnit)
      : '?';
  const food = useQuery({
    queryKey: [
      'foods',
      'recipeImportFood',
      scope,
      mapping?.foodId,
      mapping?.variantId,
    ],
    queryFn: async () => {
      if (!mapping) throw new Error('MAPPING_REQUIRED');
      const [item, variants] = await Promise.all([
        fetchRecipeFood(mapping.foodId),
        fetchFoodVariants(mapping.foodId),
      ]);
      return {
        item,
        variant: variants.find((value) => value.id === mapping.variantId),
      };
    },
    enabled: !!mapping,
    retry: false,
  });
  const { missingCore, missingNutrients } = recipeImportNutritionGaps(
    food.data?.variant,
    ingredient.missingNutrients
  );
  const readySelection =
    mapping && food.data?.variant && !missingCore && !food.error
      ? `${mapping.foodId}:${mapping.variantId}`
      : null;
  useEffect(() => {
    onReadinessChange?.(ingredient.ingredientId, readySelection);
  }, [ingredient.ingredientId, readySelection, onReadinessChange]);
  return (
    <View
      className="border-b border-border-subtle py-4 gap-2"
      accessibilityLabel={ingredient.name}
    >
      <Text className="text-text-secondary text-xs">
        {t('recipeImport.sourceIngredient', {
          defaultValue: 'Mealie ingredient',
        })}
      </Text>
      <View className="flex-row items-center gap-2">
        {position !== undefined && (
          <Text className="text-text-secondary" accessible={false}>
            {position}.
          </Text>
        )}
        <Text className="text-text-primary font-semibold text-base">
          {ingredient.name}
        </Text>
      </View>
      <Text className="text-text-secondary">{ingredient.originalText}</Text>
      <Text className="text-text-secondary">
        {t('recipeImport.sourceAmount', {
          defaultValue: 'Original whole-recipe amount: {{quantity}} {{unit}}',
          quantity:
            originalQuantity === null
              ? t('recipeImport.notProvided', { defaultValue: 'not provided' })
              : number(originalQuantity),
          unit:
            ingredient.originalUnit ||
            ingredient.unit ||
            t('recipeImport.notProvided', { defaultValue: 'not provided' }),
        })}
      </Text>
      {!!ingredient.note && (
        <Text className="text-text-secondary">{ingredient.note}</Text>
      )}
      <Text className="text-text-primary">
        {mapping
          ? ingredient.mappingOrigin === 'saved'
            ? t('recipeImport.savedChoice', { defaultValue: 'Saved choice' })
            : t('recipeImport.confirmed', { defaultValue: 'Confirmed' })
          : t('recipeImport.unresolved', {
              defaultValue: 'Needs confirmation',
            })}
      </Text>
      {ingredient.issues
        .filter((issue) => issue !== 'incomplete_nutrition')
        .map((issue) => (
          <Text key={issue} className="text-text-secondary">
            {recipeImportIssueLabel(issue, t)}
          </Text>
        ))}
      {missingCore && (
        <Text accessibilityRole="alert" className="text-danger">
          {t('recipeImport.incompleteCoreNutrition', {
            defaultValue:
              'Core nutrition is incomplete. Choose a complete food variant.',
          })}
        </Text>
      )}
      {!missingCore &&
        (missingNutrients.length > 0 ||
          (!food.data?.variant &&
            ingredient.issues.includes('incomplete_nutrition'))) && (
          <Text className="text-text-secondary">
            {recipeImportIssueLabel('incomplete_nutrition', t)}
          </Text>
        )}
      {missingNutrients.length > 0 && (
        <Text className="text-text-secondary">
          {t('recipeImport.missingNutrients', {
            defaultValue: 'Missing nutrients: {{nutrients}}',
            nutrients: missingNutrients.join(', '),
          })}
        </Text>
      )}
      {mapping && (
        <>
          <Text className="text-text-primary font-semibold">
            {t('recipeImport.selectedFoodAmount', {
              defaultValue: 'Selected food and amount',
            })}
          </Text>
          {ingredient.mappingOrigin === 'saved' && (
            <Text className="text-text-secondary">
              {t('recipeImport.savedChoiceHelp', {
                defaultValue:
                  'Check this saved choice and its whole-recipe amount before saving.',
              })}
            </Text>
          )}
          <Text className="text-text-primary">
            {food.data
              ? `${food.data.item.name}${food.data.item.brand ? ` · ${food.data.item.brand}` : ''}`
              : t('recipeImport.loadingFood', {
                  defaultValue: 'Loading selected food…',
                })}
          </Text>
          <Text className="text-text-secondary">
            {number(mapping.quantity)} {mapping.unit}
          </Text>
          {food.data?.variant && (
            <Text className="text-text-secondary">
              {t('recipeImport.variantNutritionEnergy', {
                defaultValue:
                  '{{size}} {{unit}}: {{calories}} {{energyUnit}} · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
                size: number(food.data.variant.serving_size),
                unit: food.data.variant.serving_unit,
                calories: energy(food.data.variant.calories),
                energyUnit: energyUnitLabel(energyUnit, t),
                protein: number(food.data.variant.protein),
                carbs: number(food.data.variant.carbs),
                fat: number(food.data.variant.fat),
              })}
            </Text>
          )}
          {food.error && (
            <>
              <Text accessibilityRole="alert" className="text-danger">
                {t('recipeImport.foodUnavailable', {
                  defaultValue: 'Food details could not be loaded. Try again.',
                })}
              </Text>
              <Button
                variant="secondary"
                disabled={disabled || food.isFetching}
                onPress={() => void food.refetch()}
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            </>
          )}
        </>
      )}
      {!mapping && (
        <Text className="text-text-primary font-semibold">
          {t('recipeImport.selectedFoodAmount', {
            defaultValue: 'Selected food and amount',
          })}
        </Text>
      )}
      <Button
        variant="secondary"
        disabled={disabled || ingredient.issues.includes('linked_recipe')}
        accessibilityLabel={t('recipeImport.chooseFoodFor', {
          defaultValue: 'Choose food for {{name}}',
          name: ingredient.name,
        })}
        onPress={onChoose}
      >
        {t('recipeImport.chooseFood', {
          defaultValue: 'Choose food or amount',
        })}
      </Button>
      {!mapping && suggestion && (
        <>
          <Text className="text-text-secondary">
            {t('recipeImport.matchesFor', {
              defaultValue:
                'Matches for {{name}} — choose one and review its amount.',
              name: ingredient.name,
            })}
          </Text>
          {suggestion.candidates.length === 0 && (
            <Text className="text-text-secondary">
              {t('recipeImport.noCandidates', {
                defaultValue: 'No candidates found. Choose a food manually.',
              })}
            </Text>
          )}
          {suggestion.candidates.map((candidate) => (
            <View
              key={candidate.candidateId}
              className="gap-2 py-3 border-b border-border-subtle"
            >
              <Text className="text-text-primary">
                {candidate.name}
                {candidate.brand ? ` · ${candidate.brand}` : ''}
              </Text>
              <Text className="text-text-secondary">
                {number(candidate.servingSize)} {candidate.servingUnit}
              </Text>
              {candidate.candidateId === suggestion.suggestedCandidateId && (
                <Text className="text-text-secondary">
                  {t('recipeImport.suggested', {
                    defaultValue: 'Suggested — review required',
                  })}
                </Text>
              )}
              <Text className="text-text-secondary">
                {t('recipeImport.candidateNutritionEnergy', {
                  defaultValue:
                    '{{calories}} {{energyUnit}} · P {{protein}} g · C {{carbs}} g · F {{fat}} g per serving',
                  energyUnit: energyUnitLabel(energyUnit, t),
                  calories: energy(candidate.nutrition.calories),
                  ...Object.fromEntries(
                    ['protein', 'carbs', 'fat'].map((key) => [
                      key,
                      candidate.nutrition[key] == null
                        ? '?'
                        : number(candidate.nutrition[key]),
                    ])
                  ),
                })}
              </Text>
              {!candidate.unitCompatible && (
                <Text className="text-text-secondary">
                  {t('recipeImport.issues.incompatible_unit', {
                    defaultValue:
                      'Review the quantity in the selected food unit. Volume is never treated as mass.',
                  })}
                </Text>
              )}
              {!candidate.nutritionComplete && (
                <Text className="text-text-secondary">
                  {t('recipeImport.incompleteCoreNutrition', {
                    defaultValue:
                      'Core nutrition is incomplete. Choose a complete food variant.',
                  })}
                </Text>
              )}
              <Button
                variant="secondary"
                disabled={disabled || !candidate.nutritionComplete}
                onPress={() => onCandidate(candidate)}
              >
                {t('recipeImport.reviewCandidate', {
                  defaultValue: 'Review {{name}}',
                  name: candidate.name,
                })}
              </Button>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
