import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import FoodForm, { type FoodFormData } from '../../components/FoodForm';
import FoodImagePicker from '../../components/FoodImagePicker';
import {
  pickerImagesDiffer,
  splitPickerImages,
  toSavedImages,
  type PickerImage,
} from '../../utils/pickerImages';
import { useCreateFoodVariant, useFoodVariants } from '../../hooks/useFoodVariants';
import { parseOptional } from '../../types/foodInfo';
import {
  createFoodVariant,
  deleteFoodVariant,
  updateFoodVariant,
  updateFood,
  updateFoodEntriesSnapshot,
  type CreateFoodVariantPayload,
  type UpdateFoodVariantPayload,
} from '../../services/api/foodsApi';
import type { FoodFormScreenProps } from '../FoodFormScreen';
import type { FoodInfoItem } from '../../types/foodInfo';
import type { FoodVariantDetail } from '../../types/foods';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
} from '../../types/foodUnitVariants';
import {
  buildLocalUnitVariants,
  buildCreateFoodVariantPayload,
  diffSiblingRows,
  formatServingSizeForDisplay,
  groupEquivalentVariants,
  toEquivalentUnit,
} from '../../utils/foodDetails';
import { formatLocalizedNumber } from '../../localization';
import { localizeFoodUnit } from '../../utils/foodUnitLocalization';
import { parseDecimalInput } from '../../utils/numericInput';
import { useNativeIOSHeadersActive } from '../../services/nativeTabBarPreference';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL } from '../../hooks/useScreenHeader';
import {
  FOOD_VARIANT_FIELDS,
  buildFormValuesFromVariant,
  buildVariantFromFormData,
  buildVariantFromInitialValues,
  confirmDiscardEquivalents,
  confirmSyncPastEntries,
  confirmVariantOverwrite,
  equivalentsDiffer,
  hasFoodFormChanges,
  invalidateFoodCaches,
  isBlankEquivalent,
  validateFoodForm,
} from './persistence';

type EditFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'edit-food' }>;

function buildUpdatedFoodInfo(item: FoodInfoItem, data: FoodFormData, variantId: string): FoodInfoItem {
  return {
    ...item,
    name: data.name,
    brand: data.brand || null,
    servingSize: parseDecimalInput(data.servingSize) || item.servingSize,
    servingUnit: data.servingUnit || item.servingUnit,
    calories: parseDecimalInput(data.calories) || 0,
    protein: parseDecimalInput(data.protein) || 0,
    carbs: parseDecimalInput(data.carbs) || 0,
    fat: parseDecimalInput(data.fat) || 0,
    fiber: parseOptional(data.fiber),
    saturatedFat: parseOptional(data.saturatedFat),
    sodium: parseOptional(data.sodium),
    sugars: parseOptional(data.sugars),
    transFat: parseOptional(data.transFat),
    potassium: parseOptional(data.potassium),
    calcium: parseOptional(data.calcium),
    iron: parseOptional(data.iron),
    cholesterol: parseOptional(data.cholesterol),
    vitaminA: parseOptional(data.vitaminA),
    vitaminC: parseOptional(data.vitaminC),
    variantId,
  };
}

export function EditFoodMode({ params, navigation }: { params: EditFoodParams; navigation: FoodFormScreenProps['navigation'] }) {
  const { item, initialValues, returnKey, foodId, variantId, customNutrients } = params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickerImages, setPickerImages] = useState<PickerImage[]>(() =>
    toSavedImages(item?.images),
  );
  const imagesChanged = pickerImagesDiffer(pickerImages, item?.images);
  const { createVariant } = useCreateFoodVariant();
  const { variants } = useFoodVariants(foodId, { enabled: true });
  const savedUnitVariants = useMemo(
    () => buildLocalUnitVariants(variants),
    [variants],
  );
  const fallbackVariant = useMemo(
    () => buildVariantFromInitialValues(initialValues, variantId),
    [initialValues, variantId],
  );
  const availableUnitVariants = useMemo(
    () =>
      savedUnitVariants.length > 0
        ? savedUnitVariants
        : fallbackVariant
          ? [fallbackVariant]
          : [],
    [fallbackVariant, savedUnitVariants],
  );
  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      fallbackVariant
        ? {
            kind: 'existing',
            variant: fallbackVariant,
          }
        : null,
    );
  // initialValues (from FoodFormData) doesn't carry source/ai_confidence, so
  // the fallback selection lands without AI provenance. When the server-backed
  // variants resolve, swap in the matching saved variant so the inline AI
  // badge surfaces on first render (not only after switching units and back).
  useEffect(() => {
    if (savedUnitVariants.length === 0) return;
    setPendingUnitSelection((prev) => {
      if (!prev || prev.kind !== 'existing' || !prev.variant.id) return prev;
      const match = savedUnitVariants.find((v) => v.id === prev.variant.id);
      if (!match || match === prev.variant) return prev;
      return { ...prev, variant: match };
    });
  }, [savedUnitVariants]);
  const [currentVariantId, setCurrentVariantId] = useState(variantId);
  const [variantBaselineValues, setVariantBaselineValues] = useState<
    Partial<FoodFormData>
  >(() => {
    if (fallbackVariant) {
      return buildFormValuesFromVariant(fallbackVariant);
    }

    return initialValues;
  });
  const [currentCustomNutrients, setCurrentCustomNutrients] = useState<
    Record<string, string | number> | null | undefined
  >(customNutrients);

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
  const [equivalentBaseline, setEquivalentBaseline] = useState<EquivalentUnit[]>(
    [],
  );

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

  const handleUnitSelectionChange = useCallback(
    async (
      selection: FoodUnitSelectionResult,
    ): Promise<FoodUnitSelectionResult> => {
      const isSwappingActive =
        selection.kind === 'existing' &&
        selection.variant.id !== currentVariantId;

      if (
        isSwappingActive &&
        equivalentsDiffer(equivalentDraft, equivalentBaseline)
      ) {
        const confirmed = await confirmDiscardEquivalents();
        if (!confirmed) {
          return pendingUnitSelection ?? selection;
        }
      }

      if (selection.kind === 'existing') {
        setPendingUnitSelection(selection);
        setCurrentVariantId(selection.variant.id ?? variantId);
        setVariantBaselineValues(buildFormValuesFromVariant(selection.variant));
        setCurrentCustomNutrients(selection.variant.custom_nutrients ?? null);
        return selection;
      }
      setPendingUnitSelection(selection);
      return selection;
    },
    [
      variantId,
      currentVariantId,
      equivalentDraft,
      equivalentBaseline,
      pendingUnitSelection,
    ],
  );

  const isDraftSelection = pendingUnitSelection?.kind === 'draft';

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

  const handleSubmit = async (data: FoodFormData) => {
    if (!validateFoodForm(data)) {
      return;
    }

    const draftSelection =
      pendingUnitSelection?.kind === 'draft' ? pendingUnitSelection : null;
    if (!draftSelection && !variants) {
      // Without the current variant list we can't diff sibling rows: the active
      // row would be misclassified as a create and duplicate the existing variant.
      Toast.show({
        type: 'error',
        text1: t('foodForm.loadingDetails', { defaultValue: 'Still loading food details. Try again in a moment.' }),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let nextVariantId = currentVariantId;
      let nextVariantBaselineValues = variantBaselineValues;
      let nextCustomNutrients = currentCustomNutrients;

      const foodPayload: { name?: string; brand?: string } = {};
      if (data.name !== initialValues.name) foodPayload.name = data.name;
      if (data.brand !== initialValues.brand) foodPayload.brand = data.brand || '';
      // Only send images when they actually changed: the server treats a
      // supplied `images` array as authoritative and deletes anything omitted,
      // so an unchanged round-trip is wasted work at best.
      const imageArgs = imagesChanged
        ? splitPickerImages(pickerImages)
        : undefined;
      const hasFoodMetadataChange =
        Object.keys(foodPayload).length > 0 || imagesChanged;

      let equivalentChangedCount = 0;

      if (draftSelection) {
        const createdVariant = await createVariant(
          buildCreateFoodVariantPayload(
            foodId,
            buildVariantFromFormData(data, draftSelection),
          ),
        );
        nextVariantId = createdVariant.id;
        setCurrentVariantId(createdVariant.id);
        setPendingUnitSelection({
          kind: 'existing',
          variant: createdVariant,
        });
        nextVariantBaselineValues = buildFormValuesFromVariant(createdVariant);
        nextCustomNutrients = createdVariant.custom_nutrients ?? null;
        setVariantBaselineValues(nextVariantBaselineValues);
        setCurrentCustomNutrients(nextCustomNutrients);

        if (hasFoodMetadataChange) {
          await updateFood(foodId, foodPayload, imageArgs);
        }
        invalidateFoodCaches(queryClient, foodId);
      } else {
        const activeSnapshot = variants?.find((v) => v.id === currentVariantId);
        const groupNutrition = buildGroupNutrition(data, activeSnapshot);

        const activeRow: Partial<FoodVariantDetail> & { id?: string } = {
          id: currentVariantId,
          food_id: foodId,
          serving_size: parseDecimalInput(data.servingSize) || 0,
          serving_unit: data.servingUnit || 'serving',
          ...groupNutrition,
        };

        const cleanEquivalents = equivalentDraft.filter(
          (eq) => !isBlankEquivalent(eq),
        );
        const siblingRows = cleanEquivalents.map((eq) => ({
          id: eq.id,
          food_id: foodId,
          serving_size: eq.serving_size,
          serving_unit: eq.serving_unit,
          ...groupNutrition,
        }));
        const desired = [activeRow, ...siblingRows];

        const activeGroupIds = new Set<string>();
        if (activeGroup) {
          activeGroupIds.add(activeGroup.base.id);
          activeGroup.equivalents.forEach((eq) => {
            if (eq.id) activeGroupIds.add(eq.id);
          });
        }
        const currentRows: FoodVariantDetail[] = (variants ?? []).filter((v) =>
          activeGroupIds.has(v.id),
        );

        // If the active variant's nutrition changed, ask whether to overwrite
        // the existing variant or save as a new one.
        const nutritionChanged = hasFoodFormChanges(
          variantBaselineValues,
          data,
          FOOD_VARIANT_FIELDS,
        );
        if (nutritionChanged && currentVariantId) {
          const activeVariant = variants?.find((v) => v.id === currentVariantId);
          const unitLabel = activeVariant
            ? `${formatServingSizeForDisplay(activeVariant.serving_size)} ${localizeFoodUnit(activeVariant.serving_unit, t)}`
            : data.servingUnit;
          const choice = await confirmVariantOverwrite(unitLabel);
          if (choice === 'cancel') {
            setIsSubmitting(false);
            return;
          }
          if (choice === 'new') {
            const pendingSelection = pendingUnitSelection?.kind === 'existing'
              ? pendingUnitSelection
              : null;
            const createdVariant = await createVariant(
              buildCreateFoodVariantPayload(
                foodId,
                buildVariantFromFormData(data, pendingSelection),
              ),
            );
            nextVariantId = createdVariant.id;
            setCurrentVariantId(createdVariant.id);
            setPendingUnitSelection({ kind: 'existing', variant: createdVariant });
            nextVariantBaselineValues = buildFormValuesFromVariant(createdVariant);
            nextCustomNutrients = createdVariant.custom_nutrients ?? null;
            setVariantBaselineValues(nextVariantBaselineValues);
            setCurrentCustomNutrients(nextCustomNutrients);
            if (hasFoodMetadataChange) {
              await updateFood(foodId, foodPayload, imageArgs);
            }
            invalidateFoodCaches(queryClient, foodId);
            // Skip the diff/overwrite path — new variant is already saved.
            setEquivalentBaseline(equivalentDraft);
            Toast.show({ type: 'success', text1: t('foodForm.savedNewVariant', { defaultValue: 'Saved as new variant' }) });

            // Same prompt as the main path: one rule — every save of a food
            // you own asks before touching diary history.
            const syncChoice = await confirmSyncPastEntries(imagesChanged);
            if (syncChoice !== 'none') {
              try {
                await updateFoodEntriesSnapshot(
                  foodId,
                  undefined,
                  syncChoice === 'nutrition-and-photos',
                );
                invalidateFoodCaches(queryClient, foodId);
                Toast.show({ type: 'success', text1: t('foodForm.pastEntriesUpdated', { defaultValue: 'Past entries updated' }) });
              } catch {
                Toast.show({
                  type: 'error',
                  text1: t('foodForm.pastEntriesFailed', { defaultValue: 'Could not update past entries' }),
                  text2: t('foodForm.foodSaved', { defaultValue: 'Your food was saved.' }),
                });
              }
            }

            isSavingRef.current = true;
            navigation.dispatch({
              ...CommonActions.setParams({
                updatedItem: buildUpdatedFoodInfo(item, data, nextVariantId),
                updatedSelectedVariantId: nextVariantId,
              }),
              source: returnKey,
            });
            navigation.goBack();
            return;
          }
          // choice === 'overwrite': fall through to normal diff/update path
        }

        const diff = diffSiblingRows(currentRows, desired);
        equivalentChangedCount =
          diff.creates.length +
          diff.updates.filter((u) => u.id !== currentVariantId).length +
          diff.deletes.length;

        const writes: Promise<unknown>[] = [];

        if (hasFoodMetadataChange) {
          writes.push(updateFood(foodId, foodPayload, imageArgs));
        }

        for (const row of diff.creates) {
          writes.push(
            createFoodVariant(row as CreateFoodVariantPayload),
          );
        }
        for (const row of diff.updates) {
          const { id, ...payload } = row;
          writes.push(
            updateFoodVariant(id, payload as UpdateFoodVariantPayload),
          );
        }
        for (const delId of diff.deletes) {
          writes.push(deleteFoodVariant(delId));
        }

        if (writes.length > 0) {
          await Promise.all(writes);
          invalidateFoodCaches(queryClient, foodId);
        }
      }

      setEquivalentBaseline(equivalentDraft);

      Toast.show({
        type: 'success',
        text1:
          equivalentChangedCount > 0
            ? t('foodForm.equivalentUnitsUpdated', {
                count: equivalentChangedCount,
                formattedCount: formatLocalizedNumber(equivalentChangedCount),
                defaultValue: 'Saved · {{formattedCount}} equivalent units updated',
                defaultValue_one: 'Saved · {{formattedCount}} equivalent unit updated',
                defaultValue_other: 'Saved · {{formattedCount}} equivalent units updated',
              })
            : t('foodForm.saved', { defaultValue: 'Saved' }),
      });

      // Past diary entries keep the nutrition snapshot they were logged with.
      // Ask before rewriting that history. Prompted on every save, matching
      // web: one form saves nutrition, name, brand and photo together, so
      // gating on "did nutrition change" would make the prompt appear and
      // disappear for what looks to the user like the same action.
      const syncChoice = await confirmSyncPastEntries(imagesChanged);
      if (syncChoice !== 'none') {
        try {
          await updateFoodEntriesSnapshot(
            foodId,
            undefined,
            syncChoice === 'nutrition-and-photos',
          );
          invalidateFoodCaches(queryClient, foodId);
          Toast.show({ type: 'success', text1: t('foodForm.pastEntriesUpdated', { defaultValue: 'Past entries updated' }) });
        } catch {
          // The food itself saved fine; only the optional sync failed, so say
          // so rather than implying the edit was lost.
          Toast.show({
            type: 'error',
            text1: t('foodForm.pastEntriesFailed', { defaultValue: 'Could not update past entries' }),
            text2: t('foodForm.foodSaved', { defaultValue: 'Your food was saved.' }),
          });
        }
      }

      isSavingRef.current = true;
      navigation.dispatch({
        ...CommonActions.setParams({
          updatedItem: buildUpdatedFoodInfo(item, data, nextVariantId),
          updatedSelectedVariantId: nextVariantId,
        }),
        source: returnKey,
      });

      navigation.goBack();
    } catch {
      Toast.show({ type: 'error', text1: t('foodForm.updateFailed', { defaultValue: 'Could not update food' }) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRequestRef = useRef<(() => void) | null>(null);

  const header = useScreenHeader({
    title: t('foodForm.editTitle', { defaultValue: 'Edit Food' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isSubmitting,
      identifier: 'food-edit-cancel',
    },
    right: {
      kind: 'primary',
      label: SAVE_LABEL,
      busyLabel: SAVING_LABEL,
      busy: isSubmitting,
      disabled: isSubmitting,
      placement: 'native-only',
      onPress: () => submitRequestRef.current?.(),
      identifier: 'food-edit-save',
    },
  });

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {header}

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        submitRequestRef={submitRequestRef}
        initialValues={initialValues}
        submitLabel={SAVE_LABEL}
        isSubmitting={isSubmitting}
        hideSubmitButton={usesNativeHeader}
        headerChildren={
          <View className="mb-4">
            <FoodImagePicker
              items={pickerImages}
              onItemsChange={setPickerImages}
              disabled={isSubmitting}
            />
          </View>
        }
        unitSelector={
          availableUnitVariants.length > 0
            ? {
                variants: availableUnitVariants,
                selectedSelection: pendingUnitSelection,
                onUnitSelectionChange: handleUnitSelectionChange,
              }
            : undefined
        }
        equivalents={{
          items: equivalentDraft,
          onChange: setEquivalentDraft,
          disabled: isDraftSelection,
        }}
        customNutrients={currentCustomNutrients}
        onCustomNutrientsChange={setCurrentCustomNutrients}
      />
    </View>
  );
}
