import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecipeImportSource } from '@workspace/shared';
import { useRecipeImportSource } from '@/hooks/Foods/useRecipeImportQueries';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { Button } from '@/components/ui/button';
import RecipeImportSyncConfirmation from './RecipeImportSyncConfirmation';

export default function RecipeImportSourcePanel(props: {
  mealId: string;
  initialSource?: RecipeImportSource;
  ingredientsDirty?: boolean;
  ingredientsLoaded?: boolean;
}) {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  // Unmount both private cache observers and pending mutation messages on profile switches.
  if (isActingOnBehalf || !activeUserId) return null;
  return (
    <OwnerSourcePanel
      key={`${activeUserId}:${props.mealId}`}
      {...props}
      ownerId={activeUserId}
    />
  );
}

function OwnerSourcePanel({
  mealId,
  initialSource,
  ingredientsDirty,
  ingredientsLoaded = true,
  ownerId,
}: {
  mealId: string;
  initialSource?: RecipeImportSource;
  ingredientsDirty?: boolean;
  ingredientsLoaded?: boolean;
  ownerId: string;
}) {
  const { t } = useTranslation();
  const [reviewGeneration, setReviewGeneration] = useState<number | null>(null);
  const confirming = useRef(false);
  const { source, sync, previewSync, sourceGeneration } = useRecipeImportSource(
    mealId,
    ownerId,
    initialSource
  );
  const reviewOpen = reviewGeneration === sourceGeneration;
  function loadPreview() {
    if (!ingredientsLoaded || ingredientsDirty || sync.isPending) return;
    sync.reset();
    previewSync.reset();
    setReviewGeneration(sourceGeneration);
    previewSync.mutate();
  }
  function confirm() {
    if (
      !previewSync.data ||
      previewSync.isPending ||
      previewSync.error ||
      confirming.current ||
      !ingredientsLoaded ||
      ingredientsDirty
    )
      return;
    confirming.current = true;
    void sync
      .mutateAsync(previewSync.data.confirmationFingerprint, {
        onSuccess: () => setReviewGeneration(null),
      })
      .catch(() => {})
      .finally(() => {
        confirming.current = false;
      });
  }
  if (source.isPending)
    return (
      <p role="status">
        {t('recipeImport.checkingSource', 'Checking recipe source…')}
      </p>
    );
  if (source.error) return <p role="alert">{source.error.message}</p>;
  if (!source.data) return null;
  return (
    <section
      className="space-y-3 rounded-md border p-3"
      aria-label={t('recipeImport.source', 'Mealie recipe source')}
    >
      <p className="font-medium">{source.data.name}</p>
      <p className="text-sm text-muted-foreground">
        {t(
          'recipeImport.syncReviewHelp',
          'Review and confirm the current saved meal nutrition before updating Mealie. Diary changes are separate.'
        )}
      </p>
      {!source.data.syncEligible && (
        <p role="status">
          {t(
            'recipeImport.syncNeedsCompleteMeal',
            'Review the saved meal ingredients and complete their nutrition before syncing.'
          )}
        </p>
      )}
      {ingredientsLoaded && ingredientsDirty && (
        <p role="status">
          {t(
            'recipeImport.unsavedIngredients',
            'Save or discard ingredient changes before syncing nutrition to Mealie.'
          )}
        </p>
      )}
      <Button
        variant="outline"
        disabled={
          !ingredientsLoaded ||
          ingredientsDirty ||
          !source.data.syncEligible ||
          sync.isPending ||
          previewSync.isPending
        }
        onClick={loadPreview}
      >
        {sync.isPending
          ? t('recipeImport.syncing', 'Syncing nutrition…')
          : t('recipeImport.sync', 'Sync nutrition to Mealie')}
      </Button>
      {reviewOpen && (
        <RecipeImportSyncConfirmation
          preview={previewSync.data}
          loading={previewSync.isPending}
          busy={sync.isPending}
          error={previewSync.error || sync.error}
          onCancel={() => setReviewGeneration(null)}
          onRefresh={loadPreview}
          onConfirm={confirm}
        />
      )}
      {sync.error && !reviewOpen && (
        <p role="alert" className="text-destructive">
          {sync.error.message}
        </p>
      )}
      {sync.isSuccess && (
        <p role="status">
          {t('recipeImport.synced', 'Nutrition synced to Mealie.')}
        </p>
      )}
      {source.data.lastSyncedAt && (
        <p className="text-sm">
          {t('recipeImport.lastSynced', 'Last confirmed sync: {{time}}', {
            time: new Date(source.data.lastSyncedAt).toLocaleString(),
          })}
        </p>
      )}
    </section>
  );
}
