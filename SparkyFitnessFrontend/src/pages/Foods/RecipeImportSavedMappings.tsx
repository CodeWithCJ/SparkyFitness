import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecipeImportSavedMappings } from '@/hooks/Foods/useRecipeImportQueries';
import { Button } from '@/components/ui/button';

export default function RecipeImportSavedMappings({
  providerId,
  ownerId,
}: {
  providerId: string;
  ownerId: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { choices, forget } = useRecipeImportSavedMappings(
    ownerId,
    providerId,
    page,
    open
  );
  return (
    <section className="space-y-3 border rounded-md p-3">
      <Button
        type="button"
        variant="outline"
        disabled={forget.isPending}
        onClick={() => {
          setOpen(!open);
          setPage(1);
        }}
      >
        {open
          ? t('recipeImport.hideSavedChoices', 'Hide saved choices')
          : t('recipeImport.manageSavedChoices', 'Manage saved choices')}
      </Button>
      {open && (
        <>
          <p className="text-sm text-muted-foreground">
            {t(
              'recipeImport.manageSavedChoicesHelp',
              'Saved choices are suggestions for future imports. Forgetting one keeps your saved meals and diary entries.'
            )}
          </p>
          {choices.isPending && (
            <p role="status">
              {t('recipeImport.loadingSavedChoices', 'Loading saved choices…')}
            </p>
          )}
          {choices.error && (
            <div role="alert">
              <p>{choices.error.message}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void choices.refetch()}
              >
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          )}
          {forget.error && (
            <p role="alert" className="text-destructive">
              {forget.error.message}
            </p>
          )}
          {choices.data?.items.map((choice) => {
            const ingredient =
              choice.ingredientName ||
              t('recipeImport.savedSourceIngredient', 'Source ingredient');
            const food =
              choice.foodName ||
              t('recipeImport.savedFoodUnavailable', 'Unavailable food');
            return (
              <div
                key={choice.id}
                className="flex flex-wrap justify-between items-center gap-2 border-t pt-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {t(
                      'recipeImport.savedMappingPair',
                      '{{ingredient}} → {{food}}',
                      { ingredient, food }
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'recipeImport.savedMappingRatio',
                      '{{quantity}} {{unit}} / 1 {{sourceUnit}}',
                      {
                        quantity: choice.quantityPerSourceUnit.toLocaleString(
                          i18n?.resolvedLanguage ?? i18n?.language,
                          { maximumSignificantDigits: 12 }
                        ),
                        unit: choice.unit,
                        sourceUnit:
                          choice.sourceUnit ||
                          t('recipeImport.sourceUnit', 'source unit'),
                      }
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={forget.isPending}
                  aria-label={t(
                    'recipeImport.forgetSavedChoiceFor',
                    'Forget saved choice for {{name}}',
                    { name: ingredient }
                  )}
                  onClick={() =>
                    void forget.mutateAsync(choice.id).catch(() => {})
                  }
                >
                  {t('recipeImport.forgetSavedChoice', 'Forget saved choice')}
                </Button>
              </div>
            );
          })}
          {choices.data?.items.length === 0 && (
            <p>
              {t(
                'recipeImport.noSavedChoices',
                'No saved choices for this provider.'
              )}
            </p>
          )}
          {choices.data && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page === 1 || forget.isPending || choices.isFetching}
                onClick={() => setPage(page - 1)}
              >
                {t('common.previous', 'Previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !choices.data.pagination.hasMore ||
                  forget.isPending ||
                  choices.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                {t('common.next', 'Next')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
