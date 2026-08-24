import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Platform, Text } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import FoodForm, { type FoodFormData } from '../../components/FoodForm';
import Switch from '../../components/ui/Switch';
import { usePreferences } from '../../hooks';
import { useCreateFoodVariant, useFoodVariants } from '../../hooks/useFoodVariants';
import { parseOptional } from '../../types/foodInfo';
import {
  createFoodVariant,
  deleteFoodVariant,
  updateFoodVariant,
  type CreateFoodVariantPayload,
  type UpdateFoodVariantPayload,
} from '../../services/api/foodsApi';
import type { FoodFormScreenProps } from '../FoodFormScreen';
import type { FoodVariantDetail } from '../../types/foods';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
} from '../../types/foodUnitVariants';
import {
  buildCreateFoodVariantPayload,
  diffSiblingRows,
  formatServingSizeForDisplay,
  groupEquivalentVariants,
  toEquivalentUnit,
} from '../../utils/foodDetails';
import { localizeFoodUnit } from '../../utils/foodUnitLocalization';
import { parseDecimalInput } from '../../utils/numericInput';
import { useNativeIOSHeadersActive } from '../../services/nativeTabBarPreference';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL } from '../../hooks/useScreenHeader';
import {
  FOOD_VARIANT_FIELDS,
  buildFormValuesFromVariant,
  buildVariantFromFormData,
  confirmDiscardEquivalents,
  confirmVariantOverwrite,
  equivalentsDiffer,
  hasFoodFormChanges,
  invalidateFoodCaches,
  isBlankEquivalent,
  persistFoodEdits,
  persistFoodMetadataEdits,
  validateFoodForm,
} from './persistence';

type AdjustNutritionParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'adjust-entry-nutrition' }>;

export function AdjustNutritionMode({ params, navigation }: { params: AdjustNutritionParams; navigation: FoodFormScreenProps['navigation'] }) {
  const {
    initialValues,
    returnKey,
    foodId,
    variantId,
    customNutrients,
    availableUnitVariants,
    selectedUnitSelection,
  } = params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createVariant } = useCreateFoodVariant();
  const { preferences } = usePreferences();
  const initialAutoScaleNutritionEnabled =
    preferences?.auto_scale_online_imports ?? false;

  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(selectedUnitSelection ?? null);
  const [currentVariantId, setCurrentVariantId] = useState(variantId);
  // Allow saving a new variant even when no currentVariantId exists yet —
  // the user may be creating a variant for the first time from an unsaved entry.
  const canUpdateVariant = !!(foodId && customNutrients !== undefined);
  const [updateFoodToggle, setUpdateFoodToggle] = useState(false);
  // Editable custom-nutrient values for this entry, seeded from the entry's
  // snapshot. Mirrors EditFoodMode so the fields populate and edits round-trip.
  const [currentCustomNutrients, setCurrentCustomNutrients] = useState<
    Record<string, string | number> | null | undefined
  >(customNutrients);

  // Equivalent units — only fetched/shown when we have a real saved food.
  const { variants } = useFoodVariants(foodId ?? '', { enabled: !!foodId });
  const groups = useMemo(
    () => groupEquivalentVariants(variants),
    [variants],
  );
  const activeGroup = useMemo(
    () =>
      groups.find(
        (g) =>
          g.base.id === currentVariantId ||
          g.equivalents.some((eq) => eq.id === currentVariantId),
      ),
    [groups, currentVariantId],
  );
  const otherSiblings = useMemo<EquivalentUnit[]>(() => {
    if (!activeGroup) return [];
    const all: EquivalentUnit[] = [
      toEquivalentUnit(activeGroup.base),
      ...activeGroup.equivalents,
    ];
    return all.filter((eq) => eq.id !== currentVariantId);
  }, [activeGroup, currentVariantId]);

  const [equivalentDraft, setEquivalentDraft] = useState<EquivalentUnit[]>([]);
  const [equivalentBaseline, setEquivalentBaseline] = useState<EquivalentUnit[]>([]);

  // Seed the editable equivalents from the current variant's siblings whenever
  // the source signature changes. Done during render (instead of in an effect)
  // so the draft matches the active variant on the first render after a switch.
  const seedKey = `${currentVariantId}|${otherSiblings
    .map((eq) => `${eq.id ?? ''}:${eq.serving_size}:${eq.serving_unit}`)
    .join(',')}`;
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (seededKey !== seedKey) {
    setSeededKey(seedKey);
    setEquivalentDraft(otherSiblings);
    setEquivalentBaseline(otherSiblings);
  }

  const isSavingRef = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (!equivalentsDiffer(equivalentDraft, equivalentBaseline)) return;
      e.preventDefault();
      void confirmDiscardEquivalents().then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, equivalentDraft, equivalentBaseline]);

  const buildGroupNutrition = useCallback(
    (
      data: FoodFormData,
      snapshot: FoodVariantDetail | undefined,
    ): Partial<FoodVariantDetail> => ({
      calories: parseDecimalInput(data.calories) || 0,
      protein: parseDecimalInput(data.protein) || 0,
      carbs: parseDecimalInput(data.carbs) || 0,
      fat: parseDecimalInput(data.fat) || 0,
      dietary_fiber: parseOptional(data.fiber),
      saturated_fat: parseOptional(data.saturatedFat),
      sodium: parseOptional(data.sodium),
      sugars: parseOptional(data.sugars),
      trans_fat: parseOptional(data.transFat),
      potassium: parseOptional(data.potassium),
      calcium: parseOptional(data.calcium),
      iron: parseOptional(data.iron),
      cholesterol: parseOptional(data.cholesterol),
      vitamin_a: parseOptional(data.vitaminA),
      vitamin_c: parseOptional(data.vitaminC),
      polyunsaturated_fat: snapshot?.polyunsaturated_fat,
      monounsaturated_fat: snapshot?.monounsaturated_fat,
      glycemic_index: snapshot?.glycemic_index,
      custom_nutrients: currentCustomNutrients ?? snapshot?.custom_nutrients ?? undefined,
    }),
    [currentCustomNutrients],
  );

  const handleUnitSelectionChange = useCallback(
    async (
      selection: FoodUnitSelectionResult,
    ): Promise<FoodUnitSelectionResult> => {
      if (selection.kind === 'existing') {
        setPendingUnitSelection(selection);
        setCurrentVariantId(selection.variant.id ?? variantId);
        return selection;
      }
      setPendingUnitSelection(selection);
      return selection;
    },
    [variantId],
  );

  const isDraftSelection = pendingUnitSelection?.kind === 'draft';
  // Show equivalents for local foods (canUpdateVariant) and also when navigating
  // from FoodEntryAdd for external foods — equivalents get deferred to onSuccess
  // of addEntry once the food has a real food_id.
  const showEquivalents = canUpdateVariant || params.returnTo === 'FoodEntryAdd';

  const handleSubmit = async (data: FoodFormData) => {
    if (isSubmitting) return;
    if (!validateFoodForm(data)) {
      return;
    }

    // If the user wants to save equivalents we need the full variant list to
    // diff sibling rows. Guard the same way EditFoodMode does.
    const draftSelectionEarly =
      pendingUnitSelection?.kind === 'draft' ? pendingUnitSelection : null;
    if (
      updateFoodToggle &&
      canUpdateVariant &&
      !draftSelectionEarly &&
      equivalentsDiffer(equivalentDraft, equivalentBaseline) &&
      !variants
    ) {
      Toast.show({
        type: 'error',
        text1: t('foodForm.loadingDetails', { defaultValue: 'Still loading food details. Try again in a moment.' }),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let nextUnitSelection = pendingUnitSelection ?? undefined;
      let nextVariantId = currentVariantId;
      const draftSelection =
        pendingUnitSelection?.kind === 'draft' ? pendingUnitSelection : null;

      // Adjust-entry-nutrition mode: the food entry itself always saves with
      // the chosen unit + nutrition inline (food_entries has inline columns).
      // The food's saved-variants list only gains the new draft variant when
      // the user opts to "save for future use" via updateFoodToggle. Without
      // this gate, every cross-unit estimate (AI or manual) would pollute the
      // user's saved-unit picker even when they didn't ask for it.
      if (draftSelection && foodId && updateFoodToggle) {
        try {
          const createdVariant = await createVariant(
            buildCreateFoodVariantPayload(
              foodId,
              buildVariantFromFormData(data, draftSelection),
            ),
          );
          nextUnitSelection = {
            kind: 'existing',
            variant: createdVariant,
          };
          nextVariantId = createdVariant.id;
          setPendingUnitSelection(nextUnitSelection);
          setCurrentVariantId(createdVariant.id);
        } catch {
          Toast.show({ type: 'error', text1: t('foodForm.saveNewUnitFailed', { defaultValue: 'Could not save new unit' }) });
          return;
        }
      }

      // Snapshot the variant ID before any create inside the toggle block so the
      // equivalent diff can tell whether the variant pre-existed or was just created.
      // equivDiffVariantId tracks which variant the diff should target — it follows
      // "Save as new" creates but stays undefined when the variant was brand-new.
      const variantIdBeforeToggle = nextVariantId;
      let equivDiffVariantId = nextVariantId;

      if (updateFoodToggle && canUpdateVariant) {
        try {
          if (!nextVariantId && foodId) {
            // No saved variant exists for this food yet (e.g. entry was created
            // from an external search that stored nutrition inline). Create a new
            // variant from the current form values so future uses see this unit.
            const createdVariant = await createVariant(
              buildCreateFoodVariantPayload(
                foodId,
                buildVariantFromFormData(data),
              ),
            );
            nextUnitSelection = { kind: 'existing', variant: createdVariant };
            nextVariantId = createdVariant.id;
            setPendingUnitSelection(nextUnitSelection);
            setCurrentVariantId(createdVariant.id);
            // First-ever variant — no existing siblings to diff against, so create
            // draft equivalents directly (same pattern as "Save as new" above).
            const cleanEqFirst = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));
            if (cleanEqFirst.length > 0) {
              const groupNutrFirst = buildGroupNutrition(data, undefined);
              await Promise.all(
                cleanEqFirst.map((eq) =>
                  createFoodVariant({
                    food_id: foodId,
                    serving_size: eq.serving_size,
                    serving_unit: eq.serving_unit,
                    ...groupNutrFirst,
                  } as CreateFoodVariantPayload),
                ),
              ).catch(() => {
                Toast.show({ type: 'error', text1: t('foodForm.equivalentUnitsFailed', { defaultValue: 'Some equivalent units could not be saved' }) });
              }).finally(() => {
                invalidateFoodCaches(queryClient, foodId);
              });
              setEquivalentBaseline(equivalentDraft);
            }
          } else if (draftSelection && foodId) {
            // Variant was created above — update name/brand if changed, then
            // warm the cache with the correct nutrition via persistFoodEdits.
            await persistFoodMetadataEdits({
              queryClient,
              foodId,
              data,
              initialValues,
            });
            if (nextVariantId) {
              await persistFoodEdits({
                queryClient,
                foodId,
                variantId: nextVariantId,
                customNutrients: currentCustomNutrients,
                data,
                variantInitialValues: initialValues,
                foodInitialValues: initialValues,
              });
            }
          } else if (nextVariantId) {
            // When the user has an existing saved variant selected and their
            // form values differ from what's stored, ask whether they want to
            // overwrite that variant or save the edited values as a new one.
            const existingSelection =
              pendingUnitSelection?.kind === 'existing' ? pendingUnitSelection : null;
            const variantValues = existingSelection
              ? buildFormValuesFromVariant(existingSelection.variant)
              : null;
            const nutritionChanged = variantValues
              ? hasFoodFormChanges(variantValues, data, FOOD_VARIANT_FIELDS)
              : false;

            let saveVariantId = nextVariantId;
            if (existingSelection && nutritionChanged && foodId) {
              const choice = await confirmVariantOverwrite(
                `${formatServingSizeForDisplay(existingSelection.variant.serving_size)} ${localizeFoodUnit(existingSelection.variant.serving_unit, t)}`,
              );
              if (choice === 'cancel') return;
              if (choice === 'new') {
                try {
                  const createdVariant = await createVariant(
                    buildCreateFoodVariantPayload(
                      foodId,
                      buildVariantFromFormData(data, existingSelection),
                    ),
                  );
                  nextUnitSelection = { kind: 'existing', variant: createdVariant };
                  saveVariantId = createdVariant.id;
                  equivDiffVariantId = createdVariant.id;
                  setPendingUnitSelection(nextUnitSelection);
                  setCurrentVariantId(createdVariant.id);
                  // New variant has no existing siblings — create draft equivalents
                  // directly rather than diffing against a stale snapshot.
                  const cleanEq = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));
                  if (cleanEq.length > 0) {
                    const groupNutr = buildGroupNutrition(data, undefined);
                    await Promise.all(
                      cleanEq.map((eq) =>
                        createFoodVariant({
                          food_id: foodId,
                          serving_size: eq.serving_size,
                          serving_unit: eq.serving_unit,
                          ...groupNutr,
                        } as CreateFoodVariantPayload),
                      ),
                    ).catch(() => {
                      Toast.show({ type: 'error', text1: t('foodForm.equivalentUnitsFailed', { defaultValue: 'Some equivalent units could not be saved' }) });
                    }).finally(() => {
                      invalidateFoodCaches(queryClient, foodId);
                    });
                    setEquivalentBaseline(equivalentDraft);
                  }
                } catch {
                  Toast.show({ type: 'error', text1: t('foodForm.saveNewVariantFailed', { defaultValue: 'Could not save new variant' }) });
                  return;
                }
                // Fall through to persistFoodEdits with the new variant ID so the
                // cache is populated with the correct nutrition values.
              }
            }

            // Check whether the form's serving size/unit matches an existing DB
            // variant. If not, save as new directly — no dialog needed since the
            // user explicitly toggled save ON and the variant doesn't exist yet.
            if (saveVariantId && foodId) {
              const formServingSize = parseDecimalInput(data.servingSize) || 0;
              const formServingUnit = data.servingUnit || 'serving';
              const matchingDbVariant = (variants ?? []).find(
                (v) =>
                  Number(v.serving_size) === formServingSize &&
                  v.serving_unit === formServingUnit,
              );

              if (!matchingDbVariant) {
                // No DB variant matches these serving values — create a new one.
                const createdVariant = await createVariant(
                  buildCreateFoodVariantPayload(
                    foodId,
                    buildVariantFromFormData(data, existingSelection),
                  ),
                );
                nextUnitSelection = { kind: 'existing', variant: createdVariant };
                saveVariantId = createdVariant.id;
                equivDiffVariantId = createdVariant.id;
                setPendingUnitSelection(nextUnitSelection);
                setCurrentVariantId(createdVariant.id);
                invalidateFoodCaches(queryClient, foodId);
              } else {
                // Matching variant exists — update it if nutrition changed.
                const dbVariantValues = buildFormValuesFromVariant(matchingDbVariant);
                const saved = await persistFoodEdits({
                  queryClient,
                  foodId,
                  variantId: matchingDbVariant.id,
                  customNutrients: currentCustomNutrients,
                  data,
                  variantInitialValues: dbVariantValues,
                  foodInitialValues: initialValues,
                });
                if (!saved) {
                  invalidateFoodCaches(queryClient, foodId);
                }
              }
            }
          }

          // Persist any equivalent-unit edits using the same diff approach as
          // EditFoodMode. Only runs when a pre-existing variant is in play —
          // skipped when nextVariantId was just created above (variants snapshot
          // would be stale and diffSiblingRows would duplicate the new variant).
          // Only diff equivalents when the active variant pre-existed in the
          // snapshot. If "Save as new" just created a fresh variant, it isn't in
          // the stale variants list yet — diffing would collapse currentRows to []
          // and duplicate every sibling. Skip it; the user can add equivalents on
          // a subsequent edit once the new variant is persisted and loaded.
          if (
            equivDiffVariantId &&
            equivDiffVariantId === variantIdBeforeToggle &&
            variants &&
            equivalentsDiffer(equivalentDraft, equivalentBaseline)
          ) {
            const activeSnapshot = variants.find((v) => v.id === equivDiffVariantId);
            const groupNutrition = buildGroupNutrition(data, activeSnapshot);

            const activeRow: Partial<FoodVariantDetail> & { id?: string } = {
              id: equivDiffVariantId,
              food_id: foodId,
              serving_size: parseDecimalInput(data.servingSize) || 0,
              serving_unit: data.servingUnit || 'serving',
              ...groupNutrition,
            };

            const cleanEquivalents = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));
            const siblingRows = cleanEquivalents.map((eq) => ({
              id: eq.id,
              food_id: foodId,
              serving_size: eq.serving_size,
              serving_unit: eq.serving_unit,
              ...groupNutrition,
            }));
            const desired = [activeRow, ...siblingRows];

            const diffGroups = groupEquivalentVariants(variants);
            const diffGroup = diffGroups.find(
              (g) =>
                g.base.id === equivDiffVariantId ||
                g.equivalents.some((eq) => eq.id === equivDiffVariantId),
            );
            const activeGroupIds = new Set<string>();
            if (diffGroup) {
              activeGroupIds.add(diffGroup.base.id);
              diffGroup.equivalents.forEach((eq) => {
                if (eq.id) activeGroupIds.add(eq.id);
              });
            }
            const currentRows: FoodVariantDetail[] = variants.filter((v) =>
              activeGroupIds.has(v.id),
            );

            const diff = diffSiblingRows(currentRows, desired);
            const writes: Promise<unknown>[] = [];
            for (const row of diff.creates) {
              writes.push(createFoodVariant(row as CreateFoodVariantPayload));
            }
            for (const row of diff.updates) {
              const { id, ...payload } = row;
              writes.push(updateFoodVariant(id, payload as UpdateFoodVariantPayload));
            }
            for (const delId of diff.deletes) {
              writes.push(deleteFoodVariant(delId));
            }
            if (writes.length > 0) {
              await Promise.all(writes);
              invalidateFoodCaches(queryClient, foodId);
            }
            setEquivalentBaseline(equivalentDraft);
          }
        } catch {
          Toast.show({ type: 'error', text1: t('foodForm.saveNutritionFailed', { defaultValue: 'Could not save nutrition for future use' }) });
        }
      }

      const cleanEquivalentsForReturn = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));

      isSavingRef.current = true;
      navigation.dispatch({
        ...CommonActions.setParams({
          adjustedValues: data,
          adjustedUnitSelection: nextUnitSelection,
          adjustedCustomNutrients: currentCustomNutrients ?? null,
          // For external foods on the FoodEntryAdd path, return equivalents so
          // FoodEntryAddScreen can persist them after the food is saved.
          pendingEquivalents:
            !canUpdateVariant && params.returnTo === 'FoodEntryAdd' && cleanEquivalentsForReturn.length > 0
              ? cleanEquivalentsForReturn
              : undefined,
        }),
        source: returnKey,
      });
      navigation.goBack();
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRequestRef = useRef<(() => void) | null>(null);

  const header = useScreenHeader({
    title: t('foodFormPersistence.adjustNutritionTitle', { defaultValue: 'Adjust Nutrition' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isSubmitting,
      identifier: 'food-adjust-cancel',
    },
    right: {
      kind: 'primary',
      label: SAVE_LABEL,
      busyLabel: SAVING_LABEL,
      busy: isSubmitting,
      disabled: isSubmitting,
      placement: 'native-only',
      onPress: () => submitRequestRef.current?.(),
      identifier: 'food-adjust-save',
    },
  });

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {header}

      <FoodForm
        onSubmit={handleSubmit}
        submitRequestRef={submitRequestRef}
        initialValues={initialValues}
        submitLabel={SAVE_LABEL}
        isSubmitting={isSubmitting}
        hideSubmitButton={usesNativeHeader}
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled={initialAutoScaleNutritionEnabled}
        unitSelector={
          availableUnitVariants && availableUnitVariants.length > 0
            ? {
                variants: availableUnitVariants,
                selectedSelection: pendingUnitSelection,
                onUnitSelectionChange: handleUnitSelectionChange,
              }
            : undefined
        }
        equivalents={showEquivalents ? {
          items: equivalentDraft,
          onChange: setEquivalentDraft,
          disabled: isDraftSelection,
        } : undefined}
        customNutrients={currentCustomNutrients}
        onCustomNutrientsChange={setCurrentCustomNutrients}
      >
        {canUpdateVariant && (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-text-secondary text-base">
                {t('foodFormPersistence.saveNutritionFuture', { defaultValue: 'Save nutrition for future use' })}
              </Text>
              <Switch
                accessibilityLabel={t('foodFormPersistence.saveNutritionFuture', { defaultValue: 'Save nutrition for future use' })}
                value={updateFoodToggle}
                onValueChange={setUpdateFoodToggle}
              />
            </View>
          </View>
        )}
      </FoodForm>
    </View>
  );
}
