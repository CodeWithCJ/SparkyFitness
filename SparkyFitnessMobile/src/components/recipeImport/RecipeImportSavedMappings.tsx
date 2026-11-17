import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRecipeImportSavedMappings } from '../../hooks/useRecipeImport';
import { formatLocalizedNumber } from '../../localization';
import Button from '../ui/Button';

export default function RecipeImportSavedMappings({
  providerId,
  scope,
}: {
  providerId: string;
  scope: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { choices, forget } = useRecipeImportSavedMappings(
    providerId,
    scope,
    page,
    open
  );
  return (
    <View className="gap-3 rounded-xl border border-border-subtle p-3">
      <Button
        variant="secondary"
        disabled={forget.isPending}
        onPress={() => {
          setOpen(!open);
          setPage(1);
        }}
      >
        {open
          ? t('recipeImport.hideSavedChoices', {
              defaultValue: 'Hide saved choices',
            })
          : t('recipeImport.manageSavedChoices', {
              defaultValue: 'Manage saved choices',
            })}
      </Button>
      {open && (
        <>
          <Text className="text-text-secondary">
            {t('recipeImport.manageSavedChoicesHelp', {
              defaultValue:
                'Saved choices are suggestions for future imports. Forgetting one keeps your saved meals and diary entries.',
            })}
          </Text>
          {choices.isPending && (
            <Text className="text-text-secondary">
              {t('recipeImport.loadingSavedChoices', {
                defaultValue: 'Loading saved choices…',
              })}
            </Text>
          )}
          {choices.error && (
            <View className="gap-2">
              <Text accessibilityRole="alert" className="text-danger">
                {choices.error.message}
              </Text>
              <Button
                variant="secondary"
                onPress={() => void choices.refetch()}
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            </View>
          )}
          {forget.error && (
            <Text accessibilityRole="alert" className="text-danger">
              {forget.error.message}
            </Text>
          )}
          {choices.data?.items.map((choice) => {
            const ingredient =
              choice.ingredientName ||
              t('recipeImport.savedSourceIngredient', {
                defaultValue: 'Source ingredient',
              });
            const food =
              choice.foodName ||
              t('recipeImport.savedFoodUnavailable', {
                defaultValue: 'Unavailable food',
              });
            return (
              <View
                key={choice.id}
                className="gap-2 border-t border-border-subtle pt-3"
              >
                <Text className="text-text-primary font-medium">
                  {t('recipeImport.savedMappingPair', {
                    defaultValue: '{{ingredient}} → {{food}}',
                    ingredient,
                    food,
                  })}
                </Text>
                <Text className="text-text-secondary">
                  {t('recipeImport.savedMappingRatio', {
                    defaultValue: '{{quantity}} {{unit}} / 1 {{sourceUnit}}',
                    quantity: formatLocalizedNumber(
                      choice.quantityPerSourceUnit,
                      { maximumSignificantDigits: 12 }
                    ),
                    unit: choice.unit,
                    sourceUnit:
                      choice.sourceUnit ||
                      t('recipeImport.sourceUnit', {
                        defaultValue: 'source unit',
                      }),
                  })}
                </Text>
                <Button
                  variant="ghost"
                  disabled={forget.isPending}
                  accessibilityLabel={t('recipeImport.forgetSavedChoiceFor', {
                    defaultValue: 'Forget saved choice for {{name}}',
                    name: ingredient,
                  })}
                  onPress={() =>
                    void forget.mutateAsync(choice.id).catch(() => {})
                  }
                >
                  {t('recipeImport.forgetSavedChoice', {
                    defaultValue: 'Forget saved choice',
                  })}
                </Button>
              </View>
            );
          })}
          {choices.data?.items.length === 0 && (
            <Text className="text-text-secondary">
              {t('recipeImport.noSavedChoices', {
                defaultValue: 'No saved choices for this provider.',
              })}
            </Text>
          )}
          {choices.data && (
            <View className="flex-row gap-2">
              <Button
                variant="secondary"
                disabled={page === 1 || forget.isPending || choices.isFetching}
                onPress={() => setPage(page - 1)}
              >
                {t('recipeImport.previous', { defaultValue: 'Previous page' })}
              </Button>
              <Button
                variant="secondary"
                disabled={
                  !choices.data.pagination.hasMore ||
                  forget.isPending ||
                  choices.isFetching
                }
                onPress={() => setPage(page + 1)}
              >
                {t('recipeImport.next', { defaultValue: 'Next page' })}
              </Button>
            </View>
          )}
        </>
      )}
    </View>
  );
}
