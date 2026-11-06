import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recipeImportNutritionGaps } from '@workspace/shared';
import type {
  RecipeImportCandidate,
  RecipeImportIngredient,
  RecipeImportMapping,
  RecipeImportSuggestionResponse,
} from '@workspace/shared';
import type { Food, FoodVariant } from '@/types/food';
import { useRecipeImportFoodAccess } from '@/hooks/Foods/useRecipeImportQueries';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import { FoodFormDialog } from '@/components/FoodSearch/FoodFormDialog';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const issueCopy: Record<RecipeImportIngredient['issues'][number], string> = {
  missing_quantity:
    'Source quantity is missing. Enter the whole-recipe amount.',
  missing_unit: 'Source unit is missing. Select an explicit compatible unit.',
  unstructured_food: 'Source food identity needs manual review.',
  linked_recipe:
    'Linked recipes cannot be imported here. Use a recipe with explicit ingredients.',
  mapping_unavailable:
    'The saved food mapping is unavailable. Choose a food again.',
  incomplete_nutrition:
    'Some optional nutrients are unknown. Known nutrition can still be used.',
  incompatible_unit:
    'Review the quantity in the selected food unit. Volume is never treated as mass.',
};

interface Props {
  ingredient: RecipeImportIngredient;
  mapping?: RecipeImportMapping;
  suggestion?: RecipeImportSuggestionResponse['ingredients'][number];
  onConfirm: (mapping: RecipeImportMapping) => void;
  disabled?: boolean;
}

export default function RecipeImportIngredientRow({
  ingredient,
  mapping,
  suggestion,
  onConfirm,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<{
    food: Food;
    variantId?: string;
  } | null>(null);
  const [external, setExternal] = useState<Food | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const { details, loadFood, loadExternalFood, cacheFood } =
    useRecipeImportFoodAccess(mapping?.foodId);
  const variant = mapping
    ? (details.data?.variants?.find((item) => item.id === mapping.variantId) ??
      (details.data?.default_variant?.id === mapping.variantId
        ? details.data?.default_variant
        : undefined))
    : undefined;
  const number = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : '?';
  const { missingCore, missingNutrients } = recipeImportNutritionGaps(
    variant,
    ingredient.missingNutrients
  );
  const issues = ingredient.issues.filter(
    (issue) => issue !== 'incomplete_nutrition'
  );
  const blocked =
    disabled ||
    busy ||
    isActingOnBehalf ||
    ingredient.issues.includes('linked_recipe');

  async function selectLocalFood(foodId: string, variantId?: string) {
    const request = ++generation.current;
    setBusy(true);
    setFailure(null);
    try {
      const food = await loadFood(foodId);
      if (generation.current !== request) return;
      setSelected({ food, variantId });
    } catch (error) {
      if (generation.current === request)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                t(
                  'recipeImport.foodUnavailable',
                  'Food details could not be loaded. Choose the food again.'
                )
              )
        );
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }

  async function chooseCandidate(candidate: RecipeImportCandidate) {
    if (blocked) return;
    if (candidate.source === 'local' && candidate.foodId) {
      await selectLocalFood(candidate.foodId, candidate.variantId);
      return;
    }
    if (!candidate.providerType || !candidate.providerExternalId) return;
    const request = ++generation.current;
    setBusy(true);
    setFailure(null);
    try {
      // Fetch the exact chosen provider identity; the existing form persists it before unit selection.
      const food = await loadExternalFood(
        candidate.providerType,
        candidate.providerExternalId,
        candidate.providerId
      );
      if (generation.current === request) setExternal(food);
    } catch (error) {
      if (generation.current === request)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                t(
                  'recipeImport.foodUnavailable',
                  'Food details could not be loaded. Choose the food again.'
                )
              )
        );
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }

  function confirm(
    food: Food,
    quantity: number,
    unit: string,
    chosenVariant: FoodVariant
  ) {
    if (
      !chosenVariant.id ||
      !(quantity > 0) ||
      !Number.isFinite(quantity) ||
      quantity > 1e9 ||
      isActingOnBehalf ||
      disabled
    )
      return;
    onConfirm({
      ingredientId: ingredient.ingredientId,
      foodId: food.id,
      variantId: chosenVariant.id,
      quantity,
      unit,
      confirmed: true,
    });
    cacheFood(food);
    setSelected(null);
  }

  return (
    <article
      className="space-y-3 rounded-md border p-4"
      aria-label={ingredient.name}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{ingredient.name}</h3>
          <p className="text-sm">{ingredient.originalText}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              'recipeImport.sourceAmount',
              'Original whole-recipe amount: {{quantity}} {{unit}}',
              {
                quantity:
                  ingredient.quantity === null
                    ? t('recipeImport.notProvided', 'not provided')
                    : number(ingredient.quantity),
                unit:
                  ingredient.originalUnit ||
                  ingredient.unit ||
                  t('recipeImport.notProvided', 'not provided'),
              }
            )}
          </p>
          {ingredient.note && (
            <p className="text-sm text-muted-foreground">{ingredient.note}</p>
          )}
        </div>
        <Badge variant={mapping ? 'secondary' : 'outline'}>
          {mapping
            ? t('recipeImport.confirmed', 'Confirmed')
            : t('recipeImport.unresolved', 'Needs confirmation')}
        </Badge>
      </div>
      {issues.map((issue) => (
        <p key={issue} className="text-sm text-amber-700 dark:text-amber-300">
          {t(`recipeImport.issues.${issue}`, issueCopy[issue])}
        </p>
      ))}
      {missingCore && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {t(
            'recipeImport.incompleteCoreNutrition',
            'Core nutrition is incomplete. Choose a complete food variant.'
          )}
        </p>
      )}
      {!missingCore &&
        (missingNutrients.length > 0 ||
          (!variant && ingredient.issues.includes('incomplete_nutrition'))) && (
          <p className="text-sm">
            {t(
              'recipeImport.issues.incomplete_nutrition',
              issueCopy.incomplete_nutrition
            )}
          </p>
        )}
      {missingNutrients.length > 0 && (
        <p className="text-sm">
          {t(
            'recipeImport.missingNutrients',
            'Missing nutrients: {{nutrients}}',
            { nutrients: missingNutrients.join(', ') }
          )}
        </p>
      )}
      {mapping && (
        <div className="text-sm space-y-1">
          <p>
            {details.data
              ? `${details.data.name}${details.data.brand ? ` · ${details.data.brand}` : ''}`
              : t('recipeImport.loadingFood', 'Loading selected food…')}
          </p>
          <p>
            {number(mapping.quantity)} {mapping.unit}
            {variant?.serving_description
              ? ` · ${variant.serving_description}`
              : ''}
          </p>
          {variant && (
            <p>
              {t(
                'recipeImport.variantNutrition',
                '{{size}} {{unit}}: {{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g',
                {
                  size: number(variant.serving_size),
                  unit: variant.serving_unit,
                  calories: number(variant.calories),
                  protein: number(variant.protein),
                  carbs: number(variant.carbs),
                  fat: number(variant.fat),
                }
              )}
            </p>
          )}
          {details.error && (
            <p role="alert">
              {t(
                'recipeImport.foodUnavailable',
                'Food details could not be loaded. Choose the food again.'
              )}
            </p>
          )}
        </div>
      )}
      <Button
        variant="outline"
        disabled={blocked}
        aria-label={t(
          'recipeImport.chooseFoodFor',
          'Choose food for {{name}}',
          { name: ingredient.name }
        )}
        onClick={() => {
          setFailure(null);
          setSearchOpen(true);
        }}
      >
        {busy
          ? t('recipeImport.loadingFood', 'Loading selected food…')
          : mapping
            ? t('recipeImport.changeFood', 'Change food or amount')
            : t('recipeImport.chooseFood', 'Choose food')}
      </Button>
      {!mapping && suggestion && (
        <div className="space-y-2">
          <p className="text-sm">
            {t(
              'recipeImport.reviewSuggestions',
              'Review candidates, then confirm the food, variant and whole-recipe amount.'
            )}
          </p>
          {suggestion.candidates.length === 0 && (
            <p>
              {t(
                'recipeImport.noCandidates',
                'No candidates found. Choose a food manually.'
              )}
            </p>
          )}
          {suggestion.candidates.map((candidate) => (
            <div
              key={candidate.candidateId}
              className="rounded border p-2 text-sm space-y-1"
            >
              <p>
                {candidate.name}
                {candidate.brand ? ` · ${candidate.brand}` : ''} ·{' '}
                {number(candidate.servingSize)} {candidate.servingUnit}
              </p>
              {candidate.candidateId === suggestion.suggestedCandidateId && (
                <Badge variant="outline">
                  {t('recipeImport.suggested', 'Suggested — review required')}
                </Badge>
              )}
              <p>
                {t(
                  'recipeImport.candidateNutrition',
                  '{{calories}} kcal · P {{protein}} g · C {{carbs}} g · F {{fat}} g per serving',
                  {
                    calories:
                      candidate.nutrition['calories'] == null
                        ? '?'
                        : number(candidate.nutrition['calories']),
                    protein:
                      candidate.nutrition['protein'] == null
                        ? '?'
                        : number(candidate.nutrition['protein']),
                    carbs:
                      candidate.nutrition['carbs'] == null
                        ? '?'
                        : number(candidate.nutrition['carbs']),
                    fat:
                      candidate.nutrition['fat'] == null
                        ? '?'
                        : number(candidate.nutrition['fat']),
                  }
                )}
              </p>
              {!candidate.unitCompatible && (
                <p>
                  {t(
                    'recipeImport.issues.incompatible_unit',
                    issueCopy.incompatible_unit
                  )}
                </p>
              )}
              {!candidate.nutritionComplete && (
                <p>
                  {t(
                    'recipeImport.incompleteCoreNutrition',
                    'Core nutrition is incomplete. Choose a complete food variant.'
                  )}
                </p>
              )}
              <Button
                variant="outline"
                disabled={blocked || !candidate.nutritionComplete}
                onClick={() => void chooseCandidate(candidate)}
              >
                {t('recipeImport.reviewCandidate', 'Review {{name}}', {
                  name: candidate.name,
                })}
              </Button>
            </div>
          ))}
        </div>
      )}
      {failure && (
        <p role="alert" className="text-destructive">
          {failure.message}
        </p>
      )}
      {searchOpen && (
        <FoodSearchDialog
          open
          onOpenChange={setSearchOpen}
          hideMealTab
          onFoodSelect={(item, type) => {
            if (type !== 'food' || !item.id) return;
            setSearchOpen(false);
            void selectLocalFood(item.id);
          }}
        />
      )}
      {selected && (
        <FoodUnitSelector
          food={selected.food}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onSelect={confirm}
          initialQuantity={
            mapping?.quantity ?? ingredient.quantity ?? undefined
          }
          initialUnit={mapping?.unit ?? ingredient.unit ?? undefined}
          initialVariantId={selected.variantId ?? mapping?.variantId}
          preserveInitialAmountUnit
          showTimeInput={false}
          showMealTypeSelect={false}
        />
      )}
      {external && (
        <FoodFormDialog
          isOpen
          mode="edit"
          editingProduct={external}
          onOpenChange={(open) => {
            if (!open) setExternal(null);
          }}
          onSave={(food) => {
            setExternal(null);
            void selectLocalFood(food.id);
          }}
        />
      )}
    </article>
  );
}
