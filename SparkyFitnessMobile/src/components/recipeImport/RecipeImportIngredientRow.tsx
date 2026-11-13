import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  recipeImportNutritionGaps,
  recipeImportSavedSuggestion,
  recipeImportNoteNeedsReview,
  getConversionFactor,
} from '@workspace/shared';
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
  onConfirm?: (mapping: RecipeImportMapping) => void;
  onForgetSavedMapping?: (mappingId: string) => Promise<boolean>;
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
  onConfirm,
  onForgetSavedMapping,
}: Props) {
  const { t } = useTranslation();
  const [forgotten, setForgotten] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [forgetError, setForgetError] = useState<Error | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [scope, ingredient.ingredientId, ingredient.sourceFoodKey]
  );
  const savedChoice = forgotten
    ? null
    : recipeImportSavedSuggestion(ingredient);
  const choice = mapping ?? savedChoice;
  const noteNeedsReview =
    ingredient.noteNeedsReview ?? recipeImportNoteNeedsReview(ingredient.note);
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
      choice?.foodId,
      choice?.variantId,
    ],
    queryFn: async () => {
      if (!choice) throw new Error('MAPPING_REQUIRED');
      const [item, variants] = await Promise.all([
        fetchRecipeFood(choice.foodId),
        fetchFoodVariants(choice.foodId),
      ]);
      return {
        item,
        variant: variants.find((value) => value.id === choice.variantId),
      };
    },
    enabled: !!choice,
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
  async function forgetSavedChoice() {
    if (
      !ingredient.savedMappingId ||
      !onForgetSavedMapping ||
      disabled ||
      forgetting
    )
      return;
    const request = ++generation.current;
    setForgetting(true);
    setForgetError(null);
    try {
      const removed = await onForgetSavedMapping(ingredient.savedMappingId);
      if (removed && generation.current === request) setForgotten(true);
    } catch (error) {
      if (generation.current === request)
        setForgetError(
          error instanceof Error
            ? error
            : new Error(
                t('recipeImport.forgetFailed', {
                  defaultValue:
                    'The saved choice could not be forgotten. Try again.',
                })
              )
        );
    } finally {
      if (generation.current === request) setForgetting(false);
    }
  }
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
          ? t('recipeImport.confirmed', { defaultValue: 'Confirmed' })
          : savedChoice
            ? t('recipeImport.savedSuggestion', {
                defaultValue: 'Suggested from a previous import',
              })
            : t('recipeImport.unresolved', {
                defaultValue: 'Needs confirmation',
              })}
      </Text>
      {noteNeedsReview && (
        <Text
          accessibilityRole="alert"
          className="text-text-primary font-medium"
        >
          {t('recipeImport.noteNeedsReview', {
            defaultValue:
              'This note starts with an amount and may describe another ingredient. Review it separately before saving.',
          })}
        </Text>
      )}
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
      {choice && (
        <>
          <Text className="text-text-primary font-semibold">
            {t('recipeImport.selectedFoodAmount', {
              defaultValue: 'Selected food and amount',
            })}
          </Text>
          {!mapping && savedChoice && (
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
            {number(choice.quantity)} {choice.unit}
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
          {!mapping && savedChoice && onConfirm && (
            <Button
              variant="secondary"
              disabled={
                disabled ||
                forgetting ||
                !food.data?.variant ||
                missingCore ||
                getConversionFactor(
                  food.data.variant.serving_unit,
                  savedChoice.unit
                ) === null
              }
              onPress={() => onConfirm({ ...savedChoice, confirmed: true })}
            >
              {t('recipeImport.confirmSavedChoice', {
                defaultValue: 'Confirm saved choice',
              })}
            </Button>
          )}
          {savedChoice && ingredient.savedMappingId && onForgetSavedMapping && (
            <Button
              variant="ghost"
              disabled={disabled || forgetting}
              onPress={() => void forgetSavedChoice()}
            >
              {t('recipeImport.forgetSavedChoice', {
                defaultValue: 'Forget saved choice',
              })}
            </Button>
          )}
          {forgetError && (
            <Text accessibilityRole="alert" className="text-danger">
              {forgetError.message}
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
      {!choice && (
        <Text className="text-text-primary font-semibold">
          {t('recipeImport.selectedFoodAmount', {
            defaultValue: 'Selected food and amount',
          })}
        </Text>
      )}
      <Button
        variant="secondary"
        disabled={
          disabled || forgetting || ingredient.issues.includes('linked_recipe')
        }
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
      {!mapping && !forgetting && suggestion && (
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
