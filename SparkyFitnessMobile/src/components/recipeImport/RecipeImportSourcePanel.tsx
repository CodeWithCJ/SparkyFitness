import { Text, View } from 'react-native';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { useRecipeSource } from '../../hooks/useRecipeImport';
import { useAppLocale } from '../../localization';
import RecipeImportSyncConfirmation from './RecipeImportSyncConfirmation';

type SourcePanelProps = { mealId: string; scope: string };
export default function RecipeImportSourcePanel(props: SourcePanelProps) {
  return (
    <ScopedSourcePanel key={`${props.scope}:${props.mealId}`} {...props} />
  );
}
function ScopedSourcePanel({ mealId, scope }: SourcePanelProps) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const [reviewGeneration, setReviewGeneration] = useState<number | null>(null);
  const confirming = useRef(false);
  const { source, sync, previewSync, sourceGeneration } = useRecipeSource(
    mealId,
    scope
  );
  const reviewOpen = reviewGeneration === sourceGeneration;
  function loadPreview() {
    if (sync.isPending) return;
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
      confirming.current
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
  if (source.isLoading) return null;
  if (source.error)
    return (
      <Text accessibilityRole="alert" className="text-danger">
        {source.error.message}
      </Text>
    );
  if (!source.data) return null;
  return (
    <View className="gap-3 bg-surface rounded-xl p-4">
      <Text className="text-text-primary font-semibold">
        {t('recipeImport.sourceTitle', { defaultValue: 'Mealie source' })}
      </Text>
      <Text className="text-text-secondary">{source.data.name}</Text>
      <Text className="text-text-secondary">
        {t('recipeImport.syncReviewHelp', {
          defaultValue:
            'Review and confirm the current saved meal nutrition before updating Mealie. Diary changes are separate.',
        })}
      </Text>
      {!source.data.syncEligible && (
        <Text className="text-text-secondary">
          {t('recipeImport.syncNeedsCompleteMeal', {
            defaultValue:
              'Review the saved meal ingredients and complete their nutrition before syncing.',
          })}
        </Text>
      )}
      {source.data.lastSyncedAt && (
        <Text className="text-text-secondary">
          {t('recipeImport.lastSynced', {
            defaultValue: 'Last synced: {{date}}',
            date: new Date(source.data.lastSyncedAt).toLocaleString(locale),
          })}
        </Text>
      )}
      {sync.isSuccess && (
        <Text className="text-text-primary">
          {t('recipeImport.synced', {
            defaultValue: 'Nutrition synced to Mealie.',
          })}
        </Text>
      )}
      {sync.error && !reviewOpen && (
        <Text accessibilityRole="alert" className="text-danger">
          {sync.error.message}
        </Text>
      )}
      <Button
        variant="secondary"
        disabled={
          !source.data.syncEligible || sync.isPending || previewSync.isPending
        }
        loading={sync.isPending}
        onPress={loadPreview}
      >
        {t('recipeImport.sync', { defaultValue: 'Sync nutrition to Mealie' })}
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
    </View>
  );
}
