import RecipeImportSourcePanel from '../components/recipeImport/RecipeImportSourcePanel';
import { useRecipeImportAccess } from '../hooks/useRecipeImport';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import { NoteMarkdown } from '../components/NoteMarkdown';
import { usableFoodImages } from '../utils/foodImages';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import ServerGate from '../components/ServerGate';
import IngredientQuantityModal from '../components/IngredientQuantityModal';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useDeleteMeal,
  useFavorites,
  useMeal,
  useProfile,
  useServerConnection,
  usePreferences,
  useToggleFavorite,
  useUpdateMeal,
} from '../hooks';
import { mealToFoodInfo } from '../types/foodInfo';
import type { FoodDisplayValues } from '../utils/foodDetails';
import type { Meal, MealFood } from '../types/meals';
import type { RootStackScreenProps } from '../types/navigation';
import AddNfcTagRow from '../components/AddNfcTagRow';
import { useActionTagsQuery } from '../hooks/useActionTags';
import { useNfcSupport } from '../hooks/useNfcSupport';
import { useScreenHeader, type HeaderItem } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatLocalizedNumber } from '../localization';
import { energyUnitLabel, roundedEnergy } from '../utils/energyUnit';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import {
  buildMealDisplayValuesFromFoods,
  draftToMealFood,
  ingredientScale,
} from '../utils/mealNutrition';
export type { MealFoodNumericField } from '../utils/mealNutrition';

type MealDetailScreenProps = RootStackScreenProps<'MealDetail'>;

type ViewMode = 'perServing' | 'total';

function buildMealDisplayValues(
  meal: Meal,
  mode: 'total' | 'perServing' = 'total',
  overrideFoods?: MealFood[]
): FoodDisplayValues {
  return buildMealDisplayValuesFromFoods(
    overrideFoods ?? meal.foods,
    meal,
    mode
  );
}

const MealDetailScreen: React.FC<MealDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const recipeScope = useRecipeImportAccess();
  const energyUnit = useEnergyUnit();
  const { mealId, initialMeal } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [textMuted, accentColor] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];
  const [viewMode, setViewMode] = useState<ViewMode>('perServing');
  const [stagedFoods, setStagedFoods] = useState<MealFood[] | null>(null);
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<
    number | null
  >(null);

  const { isConnected } = useServerConnection();
  const { profile } = useProfile();
  const { preferences } = usePreferences({ enabled: isConnected });
  const showNetCarbs = preferences?.show_net_carbs === true;
  const { meal, isLoading, isError, refetch } = useMeal(mealId, {
    enabled: isConnected,
    initialMeal,
  });

  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingMealIngredientSelection();
      if (!selection) return;
      setStagedFoods((current) => {
        const base = current ?? meal?.foods ?? [];
        const next = [...base];
        if (
          selection.ingredientIndex != null &&
          selection.ingredientIndex >= 0 &&
          selection.ingredientIndex < next.length
        ) {
          next[selection.ingredientIndex] = draftToMealFood(
            selection.ingredient,
            next[selection.ingredientIndex]?.id
          );
          return next;
        }
        next.push(draftToMealFood(selection.ingredient));
        return next;
      });
    }, [meal?.foods])
  );

  const effectiveFoods = useMemo(
    () => stagedFoods ?? meal?.foods ?? [],
    [stagedFoods, meal?.foods]
  );

  const openIngredientPicker = useCallback(() => {
    navigation.push('FoodSearch', { pickerMode: 'meal-builder' });
  }, [navigation]);
  const { confirmAndDelete, isPending: isDeletePending } = useDeleteMeal({
    mealId,
    onSuccess: () => navigation.goBack(),
  });

  const canManageMeal = !!(isConnected && meal && profile?.id === meal.user_id);

  // NFC tags that log this meal (#941), offered on a phone with NFC.
  const { supported: nfcSupported } = useNfcSupport();
  const canAddNfcTag = isConnected && nfcSupported;
  const { tags: actionTags } = useActionTagsQuery({ enabled: canAddNfcTag });
  const tagsForMeal = actionTags.filter(
    (tag) =>
      tag.action.type === 'meal' && tag.action.meal_template_id === mealId
  ).length;

  const isPublic = !!meal?.is_public;
  const { updateMeal, isPending: isSharePending } = useUpdateMeal({
    mealId,
    onSuccess: (updated) => {
      Toast.show({
        type: 'success',
        text1: updated.is_public
          ? t('mealDetail.sharedPublicly', {
              defaultValue: 'Meal shared publicly',
            })
          : t('mealDetail.madePrivate', { defaultValue: 'Meal made private' }),
      });
    },
  });

  const handleToggleShare = useCallback(() => {
    if (!meal) return;
    const nextIsPublic = !meal.is_public;
    if (nextIsPublic) {
      Alert.alert(
        t('mealDetail.makePublicTitle', { defaultValue: 'Make public?' }),
        t('mealDetail.makePublicMessage', {
          defaultValue:
            'This meal and all of its ingredient foods will become visible to all users on this server.',
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('mealDetail.makePublic', { defaultValue: 'Make Public' }),
            onPress: () => updateMeal({ is_public: true }),
          },
        ]
      );
    } else {
      updateMeal({ is_public: false });
    }
  }, [meal, updateMeal, t]);

  // Favorites: a saved meal can be starred from its detail screen, so the
  // library is no longer edit-only via search. Access is verified server-side
  // on add, so ownership is not required — only a loaded meal and a connection.
  const canFavorite = isConnected && !!meal;
  const { favoriteMeals } = useFavorites({ enabled: isConnected });
  const isFavorite = useMemo(
    () => !!meal && favoriteMeals.some((m) => m.id === meal.id),
    [favoriteMeals, meal]
  );
  const { toggleFavorite, isPending: isFavoritePending } = useToggleFavorite();
  const handleToggleFavorite = useCallback(() => {
    if (!meal) return;
    // Full Meal in hand, so the optimistic insert flips the star instantly.
    toggleFavorite({ type: 'meal', id: meal.id, isFavorite, meal });
  }, [toggleFavorite, meal, isFavorite]);
  const totalValues = useMemo(
    () => (meal ? buildMealDisplayValues(meal, 'total', effectiveFoods) : null),
    [meal, effectiveFoods]
  );
  const perServingValues = useMemo(
    () =>
      meal ? buildMealDisplayValues(meal, 'perServing', effectiveFoods) : null,
    [meal, effectiveFoods]
  );
  const displayValues =
    viewMode === 'perServing' ? perServingValues : totalValues;

  // The title stays blank on both paths — the meal name is shown in the body's
  // nutrition card, so a bar title would just duplicate it; the header only
  // carries back plus the owner-gated Edit action once the meal loads.
  // Favorite star (accent-tinted, reads as a button) sits before the neutral
  // Edit action, matching the meal-log screen's header order.
  const rightItems: HeaderItem[] = [
    ...(canFavorite
      ? [
          {
            kind: 'icon',
            sfSymbol: isFavorite ? 'star.fill' : 'star',
            ionicon: isFavorite ? 'star' : 'star-outline',
            role: 'primary',
            // Gated on the toggle's own mutation so a double tap before settle
            // can't send the opposite op and land the two writes out of order.
            disabled: isFavoritePending,
            onPress: handleToggleFavorite,
            accessibilityLabel: isFavorite
              ? t('mealDetail.removeFavorite', {
                  defaultValue: 'Remove from favorites',
                })
              : t('mealDetail.addFavorite', {
                  defaultValue: 'Add to favorites',
                }),
            identifier: 'meal-detail-favorite',
          } as const,
        ]
      : []),
    ...(canManageMeal
      ? [
          {
            kind: 'icon',
            sfSymbol: isPublic ? 'lock.fill' : 'square.and.arrow.up',
            ionicon: isPublic ? 'lock-closed-outline' : 'share-social-outline',
            role: 'secondary',
            useIoniconOnIOS: !isPublic,
            disabled: isSharePending,
            onPress: handleToggleShare,
            accessibilityLabel: isPublic
              ? t('mealDetail.makePrivate', { defaultValue: 'Make private' })
              : t('mealDetail.shareWithPublic', {
                  defaultValue: 'Share with public',
                }),
            identifier: 'meal-detail-share',
          } as const,
          {
            kind: 'text',
            label: t('common.edit', { defaultValue: 'Edit' }),
            role: 'secondary',
            onPress: () =>
              navigation.navigate('MealAdd', {
                mode: 'edit',
                mealId: meal!.id,
                initialMeal: meal,
              }),
            accessibilityLabel: t('mealDetail.editMeal', {
              defaultValue: 'Edit meal',
            }),
            identifier: 'meal-detail-edit',
          } as const,
        ]
      : []),
  ];
  const header = useScreenHeader({
    borderless: true,
    left: { kind: 'back' },
    right: rightItems.length > 0 ? rightItems : null,
  });

  const renderContent = () => {
    if (isLoading && !meal) {
      return (
        <StatusView
          loading
          title={t('mealDetail.loading', { defaultValue: 'Loading meal...' })}
        />
      );
    }

    if (isError || !meal || !displayValues) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('mealDetail.loadFailed', {
            defaultValue: 'Failed to load meal',
          })}
          subtitle={t('common.connectionRetry', {
            defaultValue: 'Please check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }

    const foodCount = effectiveFoods.length;

    return (
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="px-4 py-4 gap-4"
        contentContainerStyle={{
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : undefined
        }
      >
        <View className="gap-2">
          <SegmentedControl
            segments={[
              {
                key: 'perServing',
                label: t('mealDetail.perServing', {
                  defaultValue: 'Per serving',
                }),
              },
              {
                key: 'total',
                label: t('mealDetail.total', { defaultValue: 'Total' }),
              },
            ]}
            activeKey={viewMode}
            onSelect={setViewMode}
          />
          <Text className="text-text-muted text-xs text-center">
            {t('mealDetail.makesSummary', {
              defaultValue:
                'Makes {{servings}} {{servingLabel}} · {{count}} {{ingredientLabel}}',
              servings: meal.total_servings || 1,
              servingLabel: t('mealDetail.servingsLabel', {
                defaultValue: 'servings',
                count: meal.total_servings || 1,
              }),
              count: foodCount,
              ingredientLabel: t('mealDetail.ingredientsLabel', {
                defaultValue: 'ingredients',
                count: foodCount,
              }),
            })}
          </Text>
        </View>

        <FoodNutritionSummary
          name={meal.name}
          brand={meal.description}
          values={displayValues}
          showNetCarbs={showNetCarbs}
        />

        <View className="bg-surface rounded-xl p-4 shadow-sm">
          <View className="flex-row items-center mb-3">
            <Text className="text-base font-bold text-text-secondary flex-1">
              {t('mealDetail.foodsInMeal', { defaultValue: 'Foods in Meal' })}
            </Text>
            {stagedFoods !== null ? (
              <TouchableOpacity
                onPress={() => setStagedFoods(null)}
                className="mr-3"
                accessibilityRole="button"
                accessibilityLabel={t('mealDetail.resetToTemplate', {
                  defaultValue: 'Reset to template',
                })}
              >
                <Text className="text-accent-primary text-xs font-semibold">
                  {t('common.reset', { defaultValue: 'Reset' })}
                </Text>
              </TouchableOpacity>
            ) : null}
            <Text className="text-xs text-text-muted font-medium">
              {t('mealDetail.items', {
                defaultValue: '{{formattedCount}} items',
                count: foodCount,
                formattedCount: formatLocalizedNumber(foodCount),
              })}
            </Text>
          </View>
          {effectiveFoods.map((food, index) => {
            const scale = ingredientScale(food);
            const calories = roundedEnergy(food.calories * scale, energyUnit);
            const protein = Math.round(food.protein * scale);
            const carbs = Math.round(food.carbs * scale);
            const fat = Math.round(food.fat * scale);
            const isLinkedMeal = food.item_type === 'meal';

            const row = (
              <View
                className={`flex-row items-start justify-between gap-3 py-3 ${
                  index === 0 ? '' : 'border-t border-border-subtle'
                }`}
              >
                <View className="flex-1">
                  <Text
                    className={`text-base font-semibold ${
                      isLinkedMeal ? 'text-accent-primary' : 'text-text-primary'
                    }`}
                    numberOfLines={1}
                  >
                    {isLinkedMeal
                      ? food.child_meal_name || food.food_name
                      : food.food_name ||
                        t('common.food', { defaultValue: 'Food' })}
                    {food.brand ? (
                      <Text className="text-text-secondary font-normal">
                        {' · '}
                        {food.brand}
                      </Text>
                    ) : null}
                  </Text>
                  {isLinkedMeal ? (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Icon name="link" size={12} color={textMuted} />
                      <Text className="text-text-muted text-xs font-medium">
                        {t('mealDetail.linkedMeal', {
                          defaultValue: 'Linked meal',
                        })}
                      </Text>
                    </View>
                  ) : null}
                  <Text className="text-text-muted text-sm mt-1">
                    {protein}g{' '}
                    {t('mealDetail.protein', { defaultValue: 'protein' })}
                    {' · '}
                    {carbs}g {t('mealDetail.carbs', { defaultValue: 'carbs' })}
                    {' · '}
                    {fat}g {t('mealDetail.fat', { defaultValue: 'fat' })}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-text-primary text-base font-semibold">
                    {calories} {energyUnitLabel(energyUnit, t)}
                  </Text>
                  <Text className="text-text-muted text-sm mt-1">
                    {food.quantity} {food.unit}
                  </Text>
                </View>
              </View>
            );

            if (isLinkedMeal && food.child_meal_id) {
              return (
                <TouchableOpacity
                  key={food.id || index}
                  activeOpacity={0.7}
                  onPress={() =>
                    navigation.push('MealDetail', {
                      mealId: food.child_meal_id!,
                    })
                  }
                  accessibilityLabel={t('mealDetail.viewLinkedMeal', {
                    defaultValue: 'View linked meal {{name}}',
                    name: food.child_meal_name || '',
                  })}
                  accessibilityRole="button"
                >
                  {row}
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={`${food.id ?? food.food_id ?? index}-${index}`}
                activeOpacity={0.7}
                onPress={() => setEditingIngredientIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={t('mealDetail.editIngredientQuantity', {
                  defaultValue: 'Edit {{name}} quantity: {{quantity}} {{unit}}',
                  name:
                    food.food_name ||
                    t('common.food', { defaultValue: 'Food' }),
                  quantity: food.quantity,
                  unit: food.unit,
                })}
              >
                {row}
              </TouchableOpacity>
            );
          })}

          <View className="items-center pt-3 border-t border-border-subtle mt-1">
            <Button
              variant="ghost"
              onPress={openIngredientPicker}
              className="min-h-11 flex-row items-center gap-1.5 rounded-xl px-3 py-2"
              accessibilityLabel={t('mealDetail.addFood', {
                defaultValue: 'Add Food',
              })}
            >
              <Icon name="add" size={16} color={accentColor} />
              <Text className="text-accent-primary text-sm font-semibold">
                {t('mealDetail.addFood', {
                  defaultValue: 'Add Food',
                })}
              </Text>
            </Button>
          </View>
        </View>

        {/* After the ingredients: the nutrition and the food list are what this
            screen is opened to check. */}
        {meal.notes ? (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <Text className="text-text-secondary text-sm mb-2">
              {t('mealDetail.notes', { defaultValue: 'Notes' })}
            </Text>
            <NoteMarkdown
              text={meal.notes}
              fontSize={14}
              images={usableFoodImages(meal.images)}
            />
          </View>
        ) : null}

        <Button
          variant="primary"
          onPress={() => {
            const customFoods = stagedFoods;
            const targetMeal = customFoods
              ? { ...meal, foods: customFoods }
              : meal;
            navigation.navigate('FoodEntryAdd', {
              item: mealToFoodInfo(targetMeal),
              ...(customFoods ? { customizedFoods: customFoods } : {}),
            });
          }}
        >
          <Text className="text-white text-base font-semibold">
            {t('mealDetail.logMeal', { defaultValue: 'Log Meal' })}
          </Text>
        </Button>

        <Button
          variant="secondary"
          textClassName="text-text-primary"
          onPress={() =>
            navigation.navigate('MealPlanForm', { initialMeal: meal })
          }
        >
          {t('mealDetail.planMeal', { defaultValue: 'Plan Meal' })}
        </Button>

        {canManageMeal && recipeScope ? (
          <RecipeImportSourcePanel
            key={recipeScope}
            mealId={mealId}
            scope={recipeScope}
          />
        ) : null}

        {canAddNfcTag ? (
          <AddNfcTagRow
            className=""
            onPress={() =>
              navigation.navigate('ActionTagForm', {
                presetAction: {
                  type: 'meal',
                  meal_template_id: meal.id,
                  quantity: meal.serving_size || 1,
                  unit: meal.serving_unit || 'serving',
                  meal: { mode: 'auto' },
                },
              })
            }
            subtitle={
              tagsForMeal > 0
                ? t('actionTags.meal.count', {
                    count: tagsForMeal,
                    formattedCount: formatLocalizedNumber(tagsForMeal),
                    defaultValue: '{{formattedCount}} tags log this meal',
                    defaultValue_one: '{{formattedCount}} tag logs this meal',
                    defaultValue_other: '{{formattedCount}} tags log this meal',
                  })
                : t('actionTags.meal.hint', {
                    defaultValue: 'Tap a sticker to log this meal',
                  })
            }
          />
        ) : null}

        {canManageMeal ? (
          <Button
            variant="destructive"
            onPress={() => {
              void confirmAndDelete();
            }}
            disabled={isDeletePending}
          >
            {isDeletePending
              ? t('mealDetail.deleting', { defaultValue: 'Deleting...' })
              : t('mealDetail.deleteMeal', { defaultValue: 'Delete Meal' })}
          </Button>
        ) : null}

        <IngredientQuantityModal
          visible={editingIngredientIndex !== null}
          ingredient={
            editingIngredientIndex !== null
              ? (effectiveFoods[editingIngredientIndex] ?? null)
              : null
          }
          onClose={() => setEditingIngredientIndex(null)}
          onSave={(newQty, updatedFood) => {
            if (editingIngredientIndex === null) return;
            setStagedFoods((current) => {
              const base = current ?? meal.foods;
              const next = [...base];
              next[editingIngredientIndex] = {
                ...next[editingIngredientIndex],
                quantity: newQty,
                ...(updatedFood ?? {}),
              };
              return next;
            });
            setEditingIngredientIndex(null);
          }}
          // The last ingredient stays: an empty list would log the template.
          onRemove={
            effectiveFoods.length > 1
              ? () => {
                  if (editingIngredientIndex === null) return;
                  setStagedFoods((current) => {
                    const base = current ?? meal.foods;
                    return base.filter((_, i) => i !== editingIngredientIndex);
                  });
                  setEditingIngredientIndex(null);
                }
              : undefined
          }
        />
      </ScrollView>
    );
  };

  // iOS: the native glass header replaces the custom header entirely. Return the
  // content (a ScrollView in the loaded state) as the screen root — UIKit only
  // attaches the large-title collapse to a scroll view it finds at the top of
  // the screen, so wrapping it in another View breaks the inset + collapse.
  if (usesNativeHeader) {
    return <ServerGate>{renderContent()}</ServerGate>;
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {header}
      <ServerGate>{renderContent()}</ServerGate>
    </View>
  );
};

export default MealDetailScreen;
