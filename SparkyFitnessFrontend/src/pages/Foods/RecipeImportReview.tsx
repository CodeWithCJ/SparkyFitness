import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecipeImportPreview } from '@workspace/shared';
import {
  isUncertainRecipeSave,
  useRecipeImport,
} from '@/hooks/Foods/useRecipeImport';
import { useRecipeImportNutrition } from '@/hooks/Foods/useRecipeImportQueries';
import { usePreferences } from '@/contexts/PreferencesContext';
import { NumericInput } from '@/components/NumericInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import RecipeImportIngredientRow from './RecipeImportIngredientRow';
import RecipeImportSourcePanel from './RecipeImportSourcePanel';
import RecipeImportNutritionPreview from './RecipeImportNutritionPreview';

export default function RecipeImportReview({
  preview,
  onBack,
  onOpenMeal,
}: {
  preview: RecipeImportPreview;
  onBack: () => void;
  onOpenMeal: (mealId: string) => void;
}) {
  const { t } = useTranslation();
  const flow = useRecipeImport(preview);
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const [name, setName] = useState(preview.name);
  const [servings, setServings] = useState<number | undefined>(
    preview.recipeServings ?? undefined
  );
  const [finishedWeight, setFinishedWeight] = useState<number | undefined>();
  const [servingsValid, setServingsValid] = useState(true);
  const [weightValid, setWeightValid] = useState(true);
  const submitting = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const mappings = preview.ingredients.flatMap((row) =>
    flow.mappings[row.ingredientId] ? [flow.mappings[row.ingredientId]!] : []
  );
  const { complete: nutritionComplete } = useRecipeImportNutrition(mappings);
  const ready =
    nutritionComplete &&
    mappings.length === preview.ingredients.length &&
    mappings.length > 0 &&
    !preview.ingredients.some((row) => row.issues.includes('linked_recipe')) &&
    !!servings &&
    servings > 0 &&
    servings <= 1e9 &&
    servingsValid &&
    weightValid &&
    (finishedWeight === undefined ||
      (finishedWeight > 0 && finishedWeight <= 1e9)) &&
    !!name.trim();

  async function save() {
    if (!ready || submitting.current || flow.save.data || uncertain) return;
    submitting.current = true;
    try {
      await flow.save.mutateAsync({
        providerId: preview.providerId,
        recipeSlug: preview.recipeSlug,
        sourceFingerprint: preview.sourceFingerprint,
        name: name.trim(),
        servings,
        ...(finishedWeight === undefined
          ? {}
          : { finishedWeightGrams: finishedWeight }),
        mappings,
      });
    } catch (error) {
      // Save creates a meal. An interrupted/ambiguous response must not offer a blind duplicate retry.
      if (isUncertainRecipeSave(error)) setUncertain(true);
    } finally {
      submitting.current = false;
    }
  }

  if (flow.save.data) {
    const saved = flow.save.data;
    return (
      <div className="space-y-4">
        <p role="status" className="font-medium">
          {t(
            'recipeImport.saved',
            'Meal saved. You can log portions from your diary.'
          )}
        </p>
        <p>
          {t(
            'recipeImport.savedEnergyNutrition',
            'Whole recipe: {{calories}} {{energyUnit}}. {{servings}} servings of {{size}} {{unit}}.',
            {
              calories:
                saved.nutrition['calories'] == null
                  ? '?'
                  : convertEnergy(
                      saved.nutrition['calories'],
                      'kcal',
                      energyUnit
                    ).toLocaleString(undefined, { maximumFractionDigits: 2 }),
              energyUnit: getEnergyUnitString(energyUnit),
              servings: saved.totalServings.toLocaleString(),
              size: saved.servingSize.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              }),
              unit: saved.servingUnit,
            }
          )}
        </p>
        <Button onClick={() => onOpenMeal(saved.mealId)}>
          {t('recipeImport.openSaved', 'Open saved meal')}
        </Button>
        <RecipeImportSourcePanel
          mealId={saved.mealId}
          initialSource={saved.source}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        onClick={onBack}
        disabled={flow.save.isPending || uncertain}
      >
        {t('recipeImport.back', 'Choose another recipe')}
      </Button>
      <p className="text-sm text-muted-foreground">
        {t(
          'recipeImport.batchAmounts',
          'All ingredient quantities are for the whole recipe. Confirm every food, variant, quantity and unit before saving.'
        )}
      </p>
      {preview.syncWarnings.some((warning) =>
        [
          'missing_quantity',
          'missing_unit',
          'incompatible_unit',
          'missing_servings',
        ].includes(warning)
      ) && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {t(
            'recipeImport.sourceReviewWarnings',
            'Review missing source amounts, units and servings below. Enter the whole-recipe amounts you will use for nutrition calculations.'
          )}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="recipe-import-name">
            {t('recipeImport.mealName', 'Meal name')}
          </Label>
          <Input
            id="recipe-import-name"
            value={name}
            maxLength={255}
            disabled={flow.save.isPending || uncertain}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="recipe-import-servings">
            {t('recipeImport.servings', 'Recipe servings')}
          </Label>
          <NumericInput
            id="recipe-import-servings"
            value={servings}
            decimals={2}
            min={0.01}
            max={1e9}
            allowExpressions
            onValidityChange={setServingsValid}
            onValueChange={setServings}
            disabled={flow.save.isPending || uncertain}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="recipe-import-weight">
            {t(
              'recipeImport.finishedWeight',
              'Finished cooked weight (g, optional)'
            )}
          </Label>
          <NumericInput
            id="recipe-import-weight"
            value={finishedWeight}
            decimals={2}
            min={0.01}
            max={1e9}
            allowExpressions
            onValidityChange={setWeightValid}
            onValueChange={setFinishedWeight}
            disabled={flow.save.isPending || uncertain}
          />
          <p className="text-sm text-muted-foreground">
            {t(
              'recipeImport.weightHelp',
              'Weigh the entire cooked dish without the pot. This only sets portion size; enter the grams you actually eat later in your diary.'
            )}
          </p>
        </div>
      </div>
      {!preview.recipeServings && (
        <p role="status">
          {t(
            'recipeImport.missingSourceServingsReview',
            'Enter servings for the saved meal. To sync nutrition later, set a positive serving count in Mealie and refresh the nutrition preview.'
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={flow.suggesting || flow.save.isPending || uncertain}
          onClick={() => void flow.suggest(false)}
        >
          {t('recipeImport.findCandidates', 'Find food candidates')}
        </Button>
        <Button
          variant="outline"
          disabled={flow.suggesting || flow.save.isPending || uncertain}
          onClick={() => void flow.suggest(true)}
        >
          {t('recipeImport.suggestAi', 'Suggest with AI')}
        </Button>
      </div>
      {flow.progress && (
        <p role="status">
          {t(
            'recipeImport.progress',
            'Suggestions reviewed: {{done}} / {{total}}',
            flow.progress
          )}
        </p>
      )}
      {flow.suggestionError && (
        <p role="alert" className="text-destructive">
          {flow.suggestionError.message}
        </p>
      )}
      {flow.warnings.map((warning) => (
        <p key={warning} className="text-sm">
          {warning}
        </p>
      ))}
      {preview.ingredients.map((ingredient, index) => (
        <RecipeImportIngredientRow
          key={ingredient.ingredientId}
          ingredient={ingredient}
          position={index + 1}
          mapping={flow.mappings[ingredient.ingredientId]}
          suggestion={flow.suggestions.find(
            (row) => row.ingredientId === ingredient.ingredientId
          )}
          onConfirm={flow.confirm}
          disabled={flow.save.isPending || uncertain}
        />
      ))}
      <p role="status">
        {t(
          'recipeImport.confirmedCount',
          '{{count}} / {{total}} ingredients confirmed',
          { count: mappings.length, total: preview.ingredients.length }
        )}
      </p>
      <RecipeImportNutritionPreview
        mappings={mappings}
        ingredientCount={preview.ingredients.length}
      />
      {flow.save.error && (
        <p role="alert" className="text-destructive">
          {flow.save.error.message}
        </p>
      )}
      {uncertain && (
        <p role="alert">
          {t(
            'recipeImport.uncertainSave',
            'The save result could not be confirmed. Check your meals library before starting another import; the meal may already exist.'
          )}
        </p>
      )}
      <Button
        disabled={!ready || flow.save.isPending || uncertain}
        onClick={() => void save()}
      >
        {flow.save.isPending
          ? t('recipeImport.saving', 'Saving meal…')
          : t('recipeImport.save', 'Save meal')}
      </Button>
    </div>
  );
}
