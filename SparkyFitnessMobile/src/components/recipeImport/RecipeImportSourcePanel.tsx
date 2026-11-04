import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import { useRecipeSource } from '../../hooks/useRecipeImport';
import { useAppLocale } from '../../localization';

type SourcePanelProps = { mealId: string; scope: string };
export default function RecipeImportSourcePanel(props: SourcePanelProps) {
  return (
    <ScopedSourcePanel key={`${props.scope}:${props.mealId}`} {...props} />
  );
}
function ScopedSourcePanel({ mealId, scope }: SourcePanelProps) {
  const { t } = useTranslation();
  const locale = useAppLocale();
  const { source, sync } = useRecipeSource(mealId, scope);
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
        {t('recipeImport.syncExplanation', {
          defaultValue:
            'Send the unchanged base recipe nutrition per original serving. Source ingredients and unrelated fields are preserved.',
        })}
      </Text>
      {!source.data.syncEligible && (
        <Text className="text-text-secondary">
          {t('recipeImport.syncUnavailable', {
            defaultValue:
              'This meal is for tracking only. Reimport the original recipe with complete, unchanged amounts to enable nutrition sync.',
          })}
        </Text>
      )}
      {source.data.syncWarnings.map((warning) => (
        <Text key={warning} className="text-text-secondary">
          {warning === 'missing_servings'
            ? t('recipeImport.missingServings', {
                defaultValue:
                  'The source has no recipe servings. Enter servings to save for tracking; nutrition sync remains unavailable.',
              })
            : warning}
        </Text>
      ))}
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
      {sync.error && (
        <Text accessibilityRole="alert" className="text-danger">
          {sync.error.message}
        </Text>
      )}
      <Button
        variant="secondary"
        disabled={!source.data.syncEligible || sync.isPending}
        loading={sync.isPending}
        onPress={() => sync.mutate()}
      >
        {t('recipeImport.sync', { defaultValue: 'Sync nutrition to Mealie' })}
      </Button>
    </View>
  );
}
