import { useTranslation } from 'react-i18next';
import type { RecipeImportSource } from '@workspace/shared';
import { useRecipeImportSource } from '@/hooks/Foods/useRecipeImportQueries';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { Button } from '@/components/ui/button';

export default function RecipeImportSourcePanel(props: {
  mealId: string;
  initialSource?: RecipeImportSource;
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
  ownerId,
}: {
  mealId: string;
  initialSource?: RecipeImportSource;
  ownerId: string;
}) {
  const { t } = useTranslation();
  const { source, sync } = useRecipeImportSource(
    mealId,
    ownerId,
    initialSource
  );
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
          'recipeImport.syncExplanation',
          'Explicitly update nutrition in the original Mealie recipe, per original recipe serving. Ingredient amounts and recipe content are preserved.'
        )}
      </p>
      {!source.data.syncEligible && (
        <p role="status">
          {t(
            'recipeImport.syncUnavailable',
            'This meal is available for tracking. Source amounts, units, servings or mappings do not support safe sync; correct the source and import a new base meal.'
          )}
        </p>
      )}
      <Button
        variant="outline"
        disabled={!source.data.syncEligible || sync.isPending}
        onClick={() => sync.mutate()}
      >
        {sync.isPending
          ? t('recipeImport.syncing', 'Syncing nutrition…')
          : t('recipeImport.sync', 'Sync nutrition to Mealie')}
      </Button>
      {sync.error && (
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
