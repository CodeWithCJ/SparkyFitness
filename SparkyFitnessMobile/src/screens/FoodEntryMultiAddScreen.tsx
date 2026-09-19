import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StackActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMealTypes } from '../hooks/useMealTypes';
import { useAddFoodEntriesBatch } from '../hooks/useAddFoodEntriesBatch';
import { useFoodVariants } from '../hooks/useFoodVariants';
import type { TFunction } from 'i18next';
import { useFoodSearchSelection } from '../hooks/useFoodSearchSelection';
import type { BasketRow } from '../hooks/useFoodSearchSelection';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { formatDateLabel } from '../utils/dateUtils';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { formatServingUnit } from '../utils/foodDetails';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import type {
  DraftVariantServing,
  MultiAddDraft,
} from '../utils/multiAddFoodEntries';
import type { FoodDefaultVariant, FoodVariantDetail } from '../types/foods';
import { useFoodSearchSelectionStore } from '../stores/foodSearchSelectionStore';
import type { RootStackScreenProps } from '../types/navigation';
import type { MealType } from '../types/mealTypes';

type FoodEntryMultiAddScreenProps = RootStackScreenProps<'FoodEntryMultiAdd'>;

function rowQuantity(row: BasketRow): number {
  return parseDecimalInput(row.quantityText);
}

/**
 * The row's serving-size basis for recovery paths (blur reset, stepper
 * fallback): the chosen variant's serving, else the food's default.
 */
function rowServingSize(row: BasketRow): number {
  const serving =
    row.variant?.serving_size ?? row.food.default_variant?.serving_size;
  return serving != null && Number.isFinite(serving) ? serving : 1;
}

function isRowQuantityValid(row: BasketRow): boolean {
  const quantity = rowQuantity(row);
  return Number.isFinite(quantity) && quantity > 0;
}

/**
 * Per-row variant selector (maintainer review, request 1): swaps the row's
 * serving basis — unit and quantity reseed — among the food's variants. A
 * child component because useFoodVariants is per-food and rows render in a
 * map; React Query caches per foodId so every row fetches once.
 */
const VariantPicker: React.FC<{
  food: BasketRow['food'];
  variantId: string;
  /** Draft's serving snapshot — the display source of truth when the
   * variants query is empty or still loading (e.g. reopened screen). */
  snapshot?: DraftVariantServing;
  disabled: boolean;
  onSelect: (
    variant: FoodVariantDetail | FoodDefaultVariant | DraftVariantServing
  ) => void;
  textMuted: string;
  t: TFunction;
}> = ({ food, variantId, snapshot, disabled, onSelect, textMuted, t }) => {
  const { variants } = useFoodVariants(food.id);
  const options = useMemo(() => {
    const all: (
      FoodVariantDetail | FoodDefaultVariant | DraftVariantServing
    )[] = [food.default_variant, ...(variants ?? [])];
    // Keep the chosen snapshot selectable even when the fetched list does
    // not (yet) contain it — otherwise a cache-empty reopen would show it
    // nowhere and flip the label back to the default serving.
    if (snapshot?.id && !all.some((v) => v.id === snapshot.id)) {
      all.push(snapshot);
    }
    const seen = new Set<string>();
    return all.filter((variant) => {
      // Dedupe by id, treating a missing id as its own bucket so two
      // id-less entries (default variants) cannot render twice either.
      const id = variant.id ?? '';
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [food.default_variant, variants, snapshot]);
  const selected =
    options.find((variant) => (variant.id ?? '') === variantId) ??
    snapshot ??
    food.default_variant;
  const servingLabel = `${selected.serving_size} ${formatServingUnit(
    selected.serving_unit
  )}`;

  // Single-variant foods have nothing to switch — render the plain serving.
  if (options.length <= 1) {
    return (
      // i18n-audit-ignore-next-line hardcoded-ui-text -- quantity and unit are literal data values.
      <Text className="text-xs text-text-secondary mt-1">{servingLabel}</Text>
    );
  }
  return (
    <BottomSheetPicker
      value={selected.id ?? ''}
      options={options.map((variant) => ({
        label: `${variant.serving_size} ${formatServingUnit(
          variant.serving_unit
        )}`,
        value: variant.id ?? '',
      }))}
      onSelect={(value: string) => {
        const variant = options.find((v) => (v.id ?? '') === value);
        if (variant) onSelect(variant);
      }}
      title={t('foodEntryMultiAdd.pickers.selectServing', {
        defaultValue: 'Select Serving',
      })}
      renderTrigger={({ onPress }) => (
        <TouchableOpacity
          onPress={onPress}
          disabled={disabled}
          activeOpacity={0.7}
          className="flex-row items-center mt-1"
          accessibilityRole="button"
          accessibilityLabel={t(
            'foodEntryMultiAdd.accessibility.changeServing',
            {
              name: food.name,
              defaultValue: 'Change serving for {{name}}',
            }
          )}
        >
          {/* i18n-audit-ignore-next-line hardcoded-ui-text -- quantity and unit are literal data values. */}
          <Text className="text-xs text-text-secondary font-medium">
            {servingLabel}
          </Text>
          <Icon name="chevron-down" size={12} color={textMuted} />
        </TouchableOpacity>
      )}
    />
  );
};

/**
 * Multi-add review screen (#1980): the last stop for a food-search basket
 * before it becomes N diary entries. Reads/writes the shared basket store
 * through useFoodSearchSelection rather than route params, per the plan's
 * batch milestone design requirements — the basket must stay live if the
 * user backs out mid-review, and "Add anyway" on an unknown-outcome row must
 * survive a screen remount without resurrecting stale local state.
 */
const FoodEntryMultiAddScreen: React.FC<FoodEntryMultiAddScreenProps> = ({
  navigation,
  route,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n?.resolvedLanguage ?? i18n?.language ?? 'en-US';
  const insets = useSafeAreaInsets();
  const [accentColor, textMuted, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-icon-danger',
  ]) as [string, string, string];

  const date = route.params?.date ?? useDiaryDateStore.getState().selectedDate;
  const routeMealTypeId = route.params?.mealTypeId;

  const selection = useFoodSearchSelection(undefined, routeMealTypeId);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const resolvedDefaultMealTypeId = routeMealTypeId ?? defaultMealTypeId ?? '';
  // The bulk picker's own selection. Bound separately from the route/app
  // default: choosing Dinner must show Dinner on the trigger, not snap back
  // to the default the screen opened with.
  const [bulkMealTypeId, setBulkMealTypeId] = useState<string | null>(null);
  const effectiveBulkMealTypeId = bulkMealTypeId ?? resolvedDefaultMealTypeId;

  // Backfill rows seeded without a meal type (opened generically, with no
  // route mealTypeId context) once the app default resolves. Guarded so it
  // never overwrites a per-row choice made after this runs once, and run as
  // an effect rather than during render — it writes into a store other
  // components (FoodSearchScreen) are also subscribed to.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current || !resolvedDefaultMealTypeId) return;
    backfilledRef.current = true;
    for (const row of selection.basketRows) {
      if (!row.mealTypeId) {
        selection.updateDraft(row.key, {
          mealTypeId: resolvedDefaultMealTypeId,
        });
      }
    }
  }, [resolvedDefaultMealTypeId, selection]);

  const mealTypeById = useMemo(
    () => new Map(mealTypes.map((mealType) => [mealType.id, mealType])),
    [mealTypes]
  );
  const mealTypeLabel = useCallback(
    (mealTypeId: string) => {
      const mealType = mealTypeById.get(mealTypeId);
      return mealType
        ? getMealTypeDisplayLabel(mealType, t)
        : t('foodEntryMultiAdd.labels.chooseMeal', {
            defaultValue: 'Choose meal',
          });
    },
    [mealTypeById, t]
  );
  const mealTypeOptions = useMemo(
    () =>
      mealTypes.map((mealType: MealType) => ({
        label: getMealTypeDisplayLabel(mealType, t),
        value: mealType.id,
      })),
    [mealTypes, t]
  );

  const { submitBatch, isSubmitting } = useAddFoodEntriesBatch();

  // Rows excluded from a plain "Add all": a confirmed rejection is safe to
  // retry (the server told us it did not commit), but an unknown outcome may
  // already be in the diary — resubmitting it needs the explicit per-row
  // "Add anyway" consent instead.
  const retryableRows = useMemo(
    () => selection.basketRows.filter((row) => row.outcome !== 'unknown'),
    [selection.basketRows]
  );
  const hasUnknownRows = selection.basketRows.some(
    (row) => row.outcome === 'unknown'
  );
  const hasInvalidRetryableRow = retryableRows.some(
    (row) =>
      !isRowQuantityValid(row) ||
      // An unresolved meal type submits meal_type_id: '' and burns a
      // round-trip to come back as a confirmed rejection — block the submit
      // until the row (or the resolved default) provides one.
      !(row.mealTypeId || resolvedDefaultMealTypeId)
  );

  const draftFor = useCallback(
    (row: BasketRow): MultiAddDraft => ({
      food: row.food,
      // The draft carries the chosen serving basis as a snapshot taken at
      // selection time — the variants cache can expire while this screen
      // is unmounted, so submit must not re-resolve variantId against it
      // (a miss would silently log the selected quantity against the
      // default variant).
      variant: row.variant ?? row.food.default_variant,
      quantityText: row.quantityText,
      mealTypeId: row.mealTypeId || resolvedDefaultMealTypeId,
      entryDate: date,
    }),
    [date, resolvedDefaultMealTypeId]
  );

  const runBatch = useCallback(
    async (rows: BasketRow[]) => {
      if (rows.length === 0) return;
      const result = await submitBatch(rows.map(draftFor));
      if (!result) return; // in-flight guard rejected a duplicate press

      if (result.succeededKeys.length > 0) {
        selection.removeKeys(result.succeededKeys);
      }
      if (result.outcomes.length > 0) {
        selection.setOutcomes(result.outcomes);
      }

      // Pop only when the basket is actually empty, read from the live
      // store: the render-scoped selection.count is the pre-batch value,
      // and rows removed through another surface during the flight change
      // the real remainder. Invalid-quantity and unstarted rows keep the
      // review open for the user to fix.
      if (useFoodSearchSelectionStore.getState().selectedByKey.size === 0) {
        navigation.dispatch(StackActions.popToTop());
      }
    },
    [submitBatch, draftFor, selection, navigation]
  );

  const handleAddAll = useCallback(() => {
    void runBatch(retryableRows);
  }, [runBatch, retryableRows]);

  const handleAddAnyway = useCallback(
    (row: BasketRow) => {
      void runBatch([row]);
    },
    [runBatch]
  );

  // Back gesture disabled while a batch is in flight (§4): an unknown
  // request from it may still commit, so leaving mid-submit risks the user
  // not seeing that outcome recorded on the row at all. gestureEnabled only
  // covers swipe navigation — Android's hardware back needs beforeRemove.
  useLayoutEffect(() => {
    navigation.setOptions({ gestureEnabled: !isSubmitting });
  }, [navigation, isSubmitting]);

  useEffect(() => {
    if (!isSubmitting) return;
    // preventDefault on beforeRemove blocks every removal route — hardware
    // back, gestures, and header back alike — for the flight's duration.
    // The empty-basket exception: the success path pops to the diary the
    // moment the batch reconciles, while this listener is still attached
    // (the isSubmitting re-render that unsubscribes it hasn't committed
    // yet). Without the exception the guard swallows its own success
    // navigation and the review screen sits on its empty state.
    return navigation.addListener('beforeRemove', (event) => {
      if (useFoodSearchSelectionStore.getState().selectedByKey.size === 0) {
        return;
      }
      event.preventDefault();
    });
  }, [navigation, isSubmitting]);

  const header = useScreenHeader({
    title: t('foodEntryMultiAdd.title', { defaultValue: 'Review' }),
    nativeTitle: t('foodEntryMultiAdd.title', { defaultValue: 'Review' }),
    left: { kind: 'back', disabled: isSubmitting },
  });

  const addAllLabel = t('foodEntryMultiAdd.actions.addAll', {
    defaultValue: 'Add all ({{count}})',
    defaultValue_one: 'Add all ({{count}})',
    defaultValue_other: 'Add all ({{count}})',
    count: retryableRows.length,
  });

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {selection.basketRows.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-text-secondary text-base text-center">
              {t('foodEntryMultiAdd.states.empty', {
                defaultValue: 'No foods selected',
              })}
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 pt-4 gap-3"
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-sm text-text-secondary">
              {t('foodEntryMultiAdd.addingToDate', {
                date: formatDateLabel(date, t, locale),
                defaultValue: 'Adding to {{date}}',
              })}
            </Text>

            <View className="flex-row items-center mt-1">
              <Text className="text-text-secondary text-base mr-2">
                {t('foodEntryMultiAdd.labels.meal', { defaultValue: 'Meal' })}
              </Text>
              <BottomSheetPicker
                value={effectiveBulkMealTypeId}
                options={mealTypeOptions}
                onSelect={(mealTypeId: string) => {
                  // The store already refuses draft changes mid-batch; guard
                  // the local label too so the trigger cannot drift from the
                  // locked drafts while a submission is in flight.
                  if (isSubmitting) return;
                  setBulkMealTypeId(mealTypeId);
                  selection.applyMealTypeToAll(mealTypeId);
                }}
                title={t('foodEntryMultiAdd.pickers.selectMeal', {
                  defaultValue: 'Select Meal',
                })}
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}

                    disabled={isSubmitting}
                    activeOpacity={0.7}
                    className="flex-row items-center"
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'foodEntryMultiAdd.accessibility.mealForAll',
                      {
                        meal: mealTypeLabel(effectiveBulkMealTypeId),
                        defaultValue: 'Meal for all items: {{meal}}',
                      }
                    )}
                  >
                    <Text className="text-text-primary text-base font-medium mr-1">
                      {mealTypeLabel(effectiveBulkMealTypeId)}
                    </Text>
                    <Icon
                      name="chevron-down"
                      size={12}
                      color={textMuted}
                      weight="medium"
                    />
                  </TouchableOpacity>
                )}
              />
            </View>

            {hasUnknownRows && (
              <View className="mt-2 rounded-xl bg-raised border border-border-subtle p-3">
                <Text
                  className="text-sm text-text-secondary"
                  accessibilityRole="alert"
                >
                  {t('foodEntryMultiAdd.banners.unknownOutcome', {
                    defaultValue:
                      "Some items couldn't be added and may already be in your diary",
                  })}
                </Text>
              </View>
            )}

            <View className="mt-2 gap-3">
              {selection.basketRows.map((row) => {
                const quantityValid = isRowQuantityValid(row);
                return (
                  <View
                    key={row.key}
                    className="rounded-xl bg-surface p-4"
                    accessibilityLabel={row.food.name}
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-3">
                        <Text className="text-base font-semibold text-text-primary">
                          {row.food.name}
                        </Text>
                        {row.food.brand ? (
                          <Text className="text-sm text-text-secondary mt-0.5">
                            {row.food.brand}
                          </Text>
                        ) : null}
                        <VariantPicker
                          food={row.food}
                          variantId={row.variantId}
                          snapshot={row.variant}
                          disabled={isSubmitting}
                          onSelect={(variant) =>
                            selection.setDraftVariant(row.key, variant)
                          }
                          textMuted={textMuted}
                          t={t}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => selection.removeKeys([row.key])}
                        disabled={isSubmitting}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t(
                          'foodEntryMultiAdd.actions.remove',
                          {
                            name: row.food.name,
                            defaultValue: 'Remove {{name}}',
                          }
                        )}
                      >
                        <Icon name="trash" size={20} color={dangerColor} />
                      </TouchableOpacity>
                    </View>

                    <View className="mt-3 flex-row items-center justify-between">
                      <StepperInput
                        accessibilityLabels={{
                          decrement: t(
                            'foodEntryMultiAdd.accessibility.decreaseQuantity',
                            { defaultValue: 'Decrease quantity' }
                          ),
                          increment: t(
                            'foodEntryMultiAdd.accessibility.increaseQuantity',
                            { defaultValue: 'Increase quantity' }
                          ),
                        }}
                        value={row.quantityText}
                        onChangeText={(text) => {
                          if (DECIMAL_INPUT_REGEX.test(text)) {
                            selection.updateDraft(row.key, {
                              quantityText: text,
                            });
                          }
                        }}
                        onBlur={() => {
                          if (!isRowQuantityValid(row)) {
                            // Reset in the ROW's serving unit — the chosen
                            // variant when selected, else the food's default.
                            selection.updateDraft(row.key, {
                              quantityText: String(rowServingSize(row)),
                            });
                          }
                        }}
                        onIncrement={() => {
                          // Invalid text parses to NaN — fall back to the
                          // seed quantity so a tap never writes "NaN".
                          const base = isRowQuantityValid(row)
                            ? rowQuantity(row)
                            : rowServingSize(row);
                          selection.updateDraft(row.key, {
                            quantityText: String(base + 1),
                          });
                        }}
                        onDecrement={() => {
                          const base = isRowQuantityValid(row)
                            ? rowQuantity(row)
                            : rowServingSize(row);
                          selection.updateDraft(row.key, {
                            quantityText: String(Math.max(0, base - 1)),
                          });
                        }}
                      />
                      <BottomSheetPicker
                        value={row.mealTypeId}
                        options={mealTypeOptions}
                        onSelect={(mealTypeId: string) =>
                          selection.updateDraft(row.key, { mealTypeId })
                        }
                        title={t('foodEntryMultiAdd.pickers.selectMeal', {
                          defaultValue: 'Select Meal',
                        })}
                        renderTrigger={({ onPress }) => (
                          <TouchableOpacity
                            onPress={onPress}
                            activeOpacity={0.7}
                            className="flex-row items-center rounded-full bg-raised px-3 py-1.5"
                            accessibilityRole="button"
                            accessibilityLabel={t(
                              'foodEntryMultiAdd.accessibility.mealForRow',
                              {
                                food: row.food.name,
                                meal: mealTypeLabel(row.mealTypeId),
                                defaultValue: 'Meal for {{food}}: {{meal}}',
                              }
                            )}
                          >
                            <Text className="text-text-primary text-sm mr-1">
                              {mealTypeLabel(row.mealTypeId)}
                            </Text>
                            <Icon
                              name="chevron-down"
                              size={10}
                              color={textMuted}
                              weight="medium"
                            />
                          </TouchableOpacity>
                        )}
                      />
                    </View>

                    {!quantityValid && (
                      <Text
                        className="mt-2 text-sm text-icon-danger"
                        accessibilityRole="alert"
                      >
                        {t('foodEntryMultiAdd.errors.invalidQuantity', {
                          defaultValue: 'Enter a quantity greater than zero.',
                        })}
                      </Text>
                    )}
                    {row.outcome === 'confirmed_rejected' && (
                      <Text
                        className="mt-2 text-sm text-icon-danger"
                        accessibilityRole="alert"
                      >
                        {t('foodEntryMultiAdd.errors.rowRejected', {
                          defaultValue:
                            "Couldn't add this item. Check it and try again.",
                        })}
                      </Text>
                    )}
                    {row.outcome === 'unknown' && (
                      <TouchableOpacity
                        className="mt-2 self-start"
                        onPress={() => handleAddAnyway(row)}
                        disabled={isSubmitting}
                        accessibilityRole="button"
                        accessibilityLabel={t(
                          'foodEntryMultiAdd.actions.addAnywayFor',
                          {
                            name: row.food.name,
                            defaultValue: 'Add {{name}} anyway',
                          }
                        )}
                      >
                        <Text
                          className="text-sm font-semibold"
                          style={{ color: accentColor }}
                        >
                          {t('foodEntryMultiAdd.actions.addAnyway', {
                            defaultValue: 'Add anyway',
                          })}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        <FooterSaveBar
          label={addAllLabel}
          busy={isSubmitting}
          disabled={
            isSubmitting || retryableRows.length === 0 || hasInvalidRetryableRow
          }
          onPress={handleAddAll}
        />
      </KeyboardAvoidingView>
    </View>
  );
};

export default FoodEntryMultiAddScreen;
