import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecipeImportPreview } from '@workspace/shared';
import { useRecipeImportBrowserQueries } from '@/hooks/Foods/useRecipeImportQueries';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import RecipeImportReview from './RecipeImportReview';
import RecipeImportSavedMappings from './RecipeImportSavedMappings';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenMeal: (mealId: string) => void;
}

export default function RecipeImportDialog({
  open,
  onOpenChange,
  onOpenMeal,
}: Props) {
  const { t } = useTranslation();
  const { isActingOnBehalf, activeUserId } = useActiveUser();
  if (!open || isActingOnBehalf || !activeUserId) return null;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {t('recipeImport.title', 'Import Mealie ingredients')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'recipeImport.description',
              'Create a reusable meal from a Mealie recipe using nutrient-backed foods. Nutrition sync is a separate action after saving.'
            )}
          </DialogDescription>
        </DialogHeader>
        <RecipeImportBrowser
          key={activeUserId}
          ownerId={activeUserId}
          onOpenMeal={onOpenMeal}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecipeImportBrowser({
  ownerId,
  onOpenMeal,
}: {
  ownerId: string;
  onOpenMeal: (mealId: string) => void;
}) {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState('');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<RecipeImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );
  const { providers, recipes, previewRecipe } = useRecipeImportBrowserQueries(
    ownerId,
    providerId,
    submittedSearch,
    page
  );
  const mealieProviders = (providers.data ?? []).filter(
    (provider) =>
      provider.provider_type === 'mealie' &&
      provider.is_active &&
      'user_id' in provider &&
      provider.user_id === ownerId
  );

  async function choose(recipeSlug: string) {
    const request = ++generation.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await previewRecipe({ providerId, recipeSlug });
      if (generation.current === request) setPreview(result);
    } catch (error) {
      if (generation.current === request)
        setFailure(
          error instanceof Error
            ? error
            : new Error(
                t(
                  'recipeImport.previewFailed',
                  'The recipe could not be loaded. Try again.'
                )
              )
        );
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }

  if (preview)
    return (
      <RecipeImportReview
        key={`${preview.providerId}:${preview.recipeSlug}:${preview.sourceFingerprint}`}
        preview={preview}
        onBack={() => setPreview(null)}
        onOpenMeal={onOpenMeal}
      />
    );
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="recipe-import-provider">
          {t('recipeImport.provider', 'Mealie provider')}
        </Label>
        <select
          id="recipe-import-provider"
          className="w-full rounded-md border border-input bg-background p-2"
          value={providerId}
          onChange={(event) => {
            generation.current += 1;
            setProviderId(event.target.value);
            setPage(1);
            setBusy(false);
            setFailure(null);
          }}
        >
          <option value="">
            {t('recipeImport.selectProvider', 'Choose a Mealie provider')}
          </option>
          {mealieProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.provider_name}
            </option>
          ))}
        </select>
      </div>
      {providers.isPending && (
        <p role="status">
          {t('recipeImport.loadingProviders', 'Loading providers…')}
        </p>
      )}
      {providers.error && <p role="alert">{providers.error.message}</p>}
      {providers.isSuccess && mealieProviders.length === 0 && (
        <p>
          {t(
            'recipeImport.configureProvider',
            'Add an active personal Mealie provider in Settings → External Providers first.'
          )}
        </p>
      )}
      {providerId && (
        <>
          <RecipeImportSavedMappings
            key={providerId}
            providerId={providerId}
            ownerId={ownerId}
          />
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmittedSearch(search.trim());
              setPage(1);
            }}
          >
            <Input
              aria-label={t(
                'recipeImport.searchRecipes',
                'Search Mealie recipes'
              )}
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="submit">{t('recipeImport.search', 'Search')}</Button>
          </form>
          {(recipes.isPending || busy) && (
            <p role="status">
              {t('recipeImport.loadingRecipes', 'Loading recipes…')}
            </p>
          )}
          {recipes.error && <p role="alert">{recipes.error.message}</p>}
          {failure && <p role="alert">{failure.message}</p>}
          <ul className="space-y-2">
            {recipes.data?.items.map((recipe) => (
              <li key={recipe.slug}>
                <Button
                  className="w-full justify-start"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void choose(recipe.slug)}
                >
                  {recipe.name}
                </Button>
              </li>
            ))}
          </ul>
          {recipes.isSuccess && recipes.data.items.length === 0 && (
            <p>{t('recipeImport.noRecipes', 'No recipes found.')}</p>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={page === 1 || busy || recipes.isFetching}
              onClick={() => setPage((previous) => previous - 1)}
            >
              {t('common.previous', 'Previous')}
            </Button>
            <span>{t('recipeImport.page', 'Page {{page}}', { page })}</span>
            <Button
              variant="outline"
              disabled={
                !recipes.data?.pagination.hasMore || busy || recipes.isFetching
              }
              onClick={() => setPage((previous) => previous + 1)}
            >
              {t('common.next', 'Next')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
