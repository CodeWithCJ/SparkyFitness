import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

const number = (value: number) =>
  formatLocalizedNumber(value, { maximumFractionDigits: 3 });
interface Props {
  ingredient: RecipeImportIngredient;
  mapping?: RecipeImportMapping;
  suggestion?: RecipeImportSuggestionResponse['ingredients'][number];
  scope: string;
  disabled: boolean;
  onChoose: () => void;
  onCandidate: (candidate: RecipeImportCandidate) => void;
}
export default function RecipeImportIngredientRow({
  ingredient,
  mapping,
  suggestion,
  scope,
  disabled,
  onChoose,
  onCandidate,
}: Props) {
  const { t } = useTranslation();
  function issueLabel(issue: RecipeImportIngredient['issues'][number]): string {
    switch (issue) {
      case 'missing_quantity':
        return t('recipeImport.issues.missing_quantity', {
          defaultValue:
            'Source quantity is missing. Enter the whole-recipe amount.',
        });
      case 'missing_unit':
        return t('recipeImport.issues.missing_unit', {
          defaultValue:
            'Source unit is missing. Select an explicit compatible unit.',
        });
      case 'unstructured_food':
        return t('recipeImport.issues.unstructured_food', {
          defaultValue: 'Source food identity needs manual review.',
        });
      case 'linked_recipe':
        return t('recipeImport.issues.linked_recipe', {
          defaultValue:
            'Linked recipes cannot be imported here. Use a recipe with explicit ingredients.',
        });
      case 'mapping_unavailable':
        return t('recipeImport.issues.mapping_unavailable', {
          defaultValue:
            'The saved food mapping is unavailable. Choose a food again.',
        });
      case 'incomplete_nutrition':
        return t('recipeImport.issues.incomplete_nutrition', {
          defaultValue:
            'Core nutrition is incomplete. Choose a complete food variant.',
        });
      case 'incompatible_unit':
        return t('recipeImport.issues.incompatible_unit', {
          defaultValue:
            'Review the quantity in the selected food unit. Volume is never treated as mass.',
        });
    }
  }
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
  return (
    <View
      className="bg-surface rounded-xl p-4 gap-2"
      accessibilityLabel={ingredient.name}
    >
      <Text className="text-text-primary font-semibold text-base">
        {ingredient.name}
      </Text>
      <Text className="text-text-secondary">{ingredient.originalText}</Text>
      <Text className="text-text-secondary">
        {t('recipeImport.sourceAmount', {
          defaultValue: 'Original whole-recipe amount: {{quantity}} {{unit}}',
          quantity:
            ingredient.quantity === null
              ? t('recipeImport.notProvided', { defaultValue: 'not provided' })
              : number(ingredient.quantity),
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
          ? t('recipeImport.confirmed', { defaultValue: 'Confirmed' })
          : t('recipeImport.unresolved', {
              defaultValue: 'Needs confirmation',
            })}
      </Text>
      {ingredient.issues.map((issue) => (
        <Text key={issue} className="text-text-secondary">
          {issueLabel(issue)}
        </Text>
      ))}
      {ingredient.missingNutrients.length > 0 && (
        <Text className="text-text-secondary">
          {t('recipeImport.missingNutrients', {
            defaultValue: 'Missing nutrients: {{nutrients}}',
            nutrients: ingredient.missingNutrients.join(', '),
          })}
        </Text>
      )}
      {mapping && (
        <>
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
              {t('recipeImport.variantNutrition', {
                defaultValue:
                  '{{size}} {{unit}}: {{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
                size: number(food.data.variant.serving_size),
                unit: food.data.variant.serving_unit,
                calories: number(food.data.variant.calories),
                protein: number(food.data.variant.protein),
                carbs: number(food.data.variant.carbs),
                fat: number(food.data.variant.fat),
              })}
            </Text>
          )}
          {food.error && (
            <Text accessibilityRole="alert" className="text-danger">
              {t('recipeImport.foodUnavailable', {
                defaultValue:
                  'Food details could not be loaded. Choose the food again.',
              })}
            </Text>
          )}
        </>
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
            {t('recipeImport.reviewSuggestions', {
              defaultValue:
                'Review candidates, then confirm the food, variant and whole-recipe amount.',
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
              className="gap-2 p-3 bg-raised rounded-lg"
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
                {t('recipeImport.candidateNutrition', {
                  defaultValue:
                    '{{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g per serving',
                  ...Object.fromEntries(
                    ['calories', 'protein', 'carbs', 'fat'].map((key) => [
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
                  {t('recipeImport.issues.incomplete_nutrition', {
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
