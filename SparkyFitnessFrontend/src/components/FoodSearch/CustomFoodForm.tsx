import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Plus, Camera } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { BarcodeScannerDialog } from './BarcodeScannerDialog';
import { MarkdownEditor } from '@/components/ui/MarkdownEditor';
import { ProviderNutrientViewer } from './ProviderNutrientViewer';
import ProviderVerifiedBadge from './ProviderVerifiedBadge';
import type { Food, FoodVariant } from '@/types/food';

import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { VariantCard } from './VariantCard';
import { useCustomFoodForm } from '@/hooks/Foods/useFoodForm';
import { useActiveAIService } from '@/hooks/AI/useAIServiceSettings';
import { useUserAiConfigAllowed } from '@/hooks/AI/useUserAiConfigAllowed';
import { UNIT_GROUPS } from '@/constants/foodForm';
import { deriveSavedAiUnits } from '@/utils/foodAiUnits';
import { getConversionFactor } from '@workspace/shared';
import { FoodImagePicker } from './FoodImagePicker';
import { resolveFoodImageSrc } from '@/utils/foodImages';

interface CustomFoodFormProps {
  onSave: (foodData: Food) => void;
  food?: Food;
  initialVariants?: FoodVariant[];
  visibleNutrients?: string[];
}

const CustomFoodForm = ({
  onSave,
  food,
  initialVariants,
  visibleNutrients: passedVisibleNutrients,
}: CustomFoodFormProps) => {
  const { t } = useTranslation();
  const {
    nutrientDisplayPreferences,
    energyUnit,
    convertEnergy,
    aiAssistedConversions,
  } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const { data: customNutrients } = useCustomNutrients();

  // AI gate for the per-row Convert-with-AI button: admin allows user AI
  // config + active AI service exists + per-user preference is on. Re-checked
  // each render so flipping the toggle takes effect live.
  const userAiConfigAllowedQuery = useUserAiConfigAllowed();
  const userAiConfigAllowed = userAiConfigAllowedQuery.data === true;
  const activeAiServiceQuery = useActiveAIService(userAiConfigAllowed);
  const aiEstimatesAvailable =
    aiAssistedConversions === true &&
    userAiConfigAllowed &&
    !!activeAiServiceQuery.data;

  const {
    formData,
    variants,
    variantErrors,
    loading,
    showSyncConfirmation,
    syncTouchesPhotos,
    loadedVariants,
    conversionBaseVariants,
    hasTrustedCompatibilityBase,
    manualUnitConversionPending,
    aiEstimatedUnits,
    updateField,
    addVariant,
    duplicateVariant,
    removeVariant,
    updateVariant,
    applyProviderNutrientMatch,
    applyAiEstimate,
    handleSubmit,
    handleSyncConfirmation,
    showBarcodeConflictConfirmation,
    setShowBarcodeConflictConfirmation,
    barcodeConflictFoodName,
    handleBarcodeConflictConfirm,
    imageItems,
    setImageItems,
  } = useCustomFoodForm({
    food,
    initialVariants,
    onSave,
    aiEstimatesAvailable,
  });

  // Only already-saved photos can be embedded in a note: a staged file exists
  // solely in the browser until the food is saved, so it has no path to link.
  const savedImageOptions = useMemo(
    () =>
      imageItems.flatMap((item) => {
        if (item.kind !== 'saved') return [];
        const src = resolveFoodImageSrc(item.path);
        return src ? [{ path: src, src }] : [];
      }),
    [imageItems]
  );

  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // The food's default variant is the AI estimation source. Lookup by flag
  // rather than by position — submit-time validation guarantees exactly one.
  const defaultVariant =
    variants.find((v) => v.is_default) ?? variants[0] ?? null;
  const trustedDefaultVariant =
    conversionBaseVariants.find((v) => v.is_default) ?? defaultVariant;

  const foodDatabasePreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'food_database' && p.platform === platform
  );
  const visibleNutrients =
    passedVisibleNutrients ||
    (foodDatabasePreferences
      ? foodDatabasePreferences.visible_nutrients
      : Object.keys(variants[0] || {}));

  // Units already SAVED as AI variants on this food. Shared across every
  // row's dropdown so the sparkle shows on the AI unit no matter which row
  // the user opens. Built from `loadedVariants` so fresh in-form estimates
  // wait until the user commits via Save Food before appearing.
  const savedAiUnits = useMemo(
    () => deriveSavedAiUnits(loadedVariants, variants, aiEstimatedUnits),
    [aiEstimatedUnits, loadedVariants, variants]
  );

  const compatibleUnitsByIndex = useMemo(() => {
    const allUnits = UNIT_GROUPS.flatMap((group) => group.units);

    return variants.map((_, index) => {
      const compatibleUnits = new Set<string>();
      const trustedBase = conversionBaseVariants[index];

      const addCompatibleUnitsFromBase = (baseUnit: string) => {
        allUnits.forEach((candidateUnit) => {
          if (
            candidateUnit === baseUnit ||
            getConversionFactor(baseUnit, candidateUnit) !== null
          ) {
            compatibleUnits.add(candidateUnit);
          }
        });
      };

      if (
        trustedBase &&
        trustedBase.source !== 'ai_estimate' &&
        typeof trustedBase.serving_unit === 'string' &&
        trustedBase.serving_unit.length > 0
      ) {
        addCompatibleUnitsFromBase(trustedBase.serving_unit);
      }

      loadedVariants.forEach((loadedVariant, donorIndex) => {
        if (
          donorIndex === index ||
          !loadedVariant?.id ||
          loadedVariant.source === 'ai_estimate' ||
          typeof loadedVariant.serving_unit !== 'string' ||
          loadedVariant.serving_unit.length === 0
        ) {
          return;
        }

        addCompatibleUnitsFromBase(loadedVariant.serving_unit);
      });

      return Array.from(compatibleUnits);
    });
  }, [conversionBaseVariants, loadedVariants, variants]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>
              {food && food.id
                ? t('customFoodForm.titleEdit', 'Edit Food')
                : t('customFoodForm.titleAdd', 'Add Custom Food')}
            </CardTitle>
            {food?.provider_verified ? <ProviderVerifiedBadge /> : null}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">
                  {t('customFoodForm.foodNameLabel', 'Food Name *')}
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="brand">
                  {t('customFoodForm.brand', 'Brand')}
                </Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => updateField('brand', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <Label htmlFor="barcode">
                  {t('customFoodForm.barcode', 'Barcode')}
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="barcode"
                    placeholder={t(
                      'customFoodForm.barcodePlaceholder',
                      'e.g. 012345678905'
                    )}
                    value={formData.barcode}
                    onChange={(e) => updateField('barcode', e.target.value)}
                    maxLength={14}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowBarcodeScanner(true)}
                    className="flex items-center gap-1.5 shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{t('customFoodForm.scan', 'Scan')}</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    'customFoodForm.barcodeHelp',
                    'Standard barcodes are 8 to 14 digits.'
                  )}
                </p>
              </div>
            </div>

            <div className="pt-2">
              <FoodImagePicker
                idPrefix="custom-food"
                items={imageItems}
                onItemsChange={setImageItems}
              />
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="is_quick_food"
                checked={formData.is_quick_food}
                onCheckedChange={(checked) =>
                  updateField('is_quick_food', !!checked)
                }
              />
              <Label htmlFor="is_quick_food" className="text-sm font-medium">
                {t(
                  'customFoodForm.quickAddLabel',
                  "Quick Add (don't save to my food list for future use)"
                )}
              </Label>
            </div>

            <ProviderNutrientViewer
              food={food}
              onApplyMatch={applyProviderNutrientMatch}
            />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {t('customFoodForm.unitVariants', 'Unit Variants')}
                </h3>
                <Button type="button" onClick={addVariant} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  {t('customFoodForm.addUnit', 'Add Unit')}
                </Button>
              </div>
              <p className="text-sm text-gray-600">
                {t(
                  'customFoodForm.unitVariantsHelp',
                  'Add different unit measurements for this food with specific nutrition values for each unit.'
                )}
              </p>

              <div className="space-y-6">
                {variants.map((variant, index) => {
                  // The AI anchor is ALWAYS the food's trusted default
                  // variant — using a single source of truth avoids
                  // compounding AI estimates on top of each other (which
                  // would happen if we anchored on the row's previous state
                  // when that state was itself an AI value).
                  //
                  // Button visibility rules:
                  //   • Default row: only show when it's pending a unit swap.
                  //   • Non-default row, non-AI: show when the row's unit
                  //     differs from the trusted default's unit (the AI
                  //     estimate fills the gap math can't bridge).
                  //   • AI-tagged row: show only while pending a unit swap
                  //     (a settled AI estimate needs no re-trigger; once a
                  //     fresh estimate lands, the button hides until the
                  //     user picks another unit).
                  const isPendingSwap =
                    manualUnitConversionPending[index] === true;
                  const isDefaultRow =
                    variant.is_default === true || defaultVariant === variant;
                  const isAiRow = variant.source === 'ai_estimate';
                  const shouldOfferButton = isAiRow
                    ? isPendingSwap
                    : isDefaultRow
                      ? isPendingSwap
                      : true;
                  const aiEstimateAnchorUnit =
                    shouldOfferButton && trustedDefaultVariant
                      ? trustedDefaultVariant.serving_unit
                      : null;

                  return (
                    <VariantCard
                      key={index}
                      index={index}
                      variant={variant}
                      variantError={variantErrors[index] ?? ''}
                      visibleNutrients={visibleNutrients}
                      energyUnit={energyUnit}
                      convertEnergy={convertEnergy}
                      customNutrients={customNutrients}
                      showCompatibleUnitIndicators={
                        (hasTrustedCompatibilityBase[index] ?? false) ||
                        (compatibleUnitsByIndex[index]?.length ?? 0) > 0
                      }
                      food={{
                        // Sentinel id for foods that haven't been saved yet —
                        // the AI endpoint only uses foodId for
                        // telemetry/context, not for DB lookup, so a string
                        // suffices.
                        id: food?.id || 'pending-new-food',
                        name: formData.name || food?.name || '',
                        brand: formData.brand || food?.brand || null,
                      }}
                      defaultVariant={defaultVariant}
                      aiEstimateAnchorUnit={aiEstimateAnchorUnit}
                      aiEstimatesAvailable={aiEstimatesAvailable}
                      // Cross-row AI sparkle: each row's dropdown surfaces
                      // the AI marker on every SAVED AI unit on this food,
                      // not just the row's own unit. Fresh in-form estimates
                      // wait until Save before appearing in the picker.
                      savedAiUnits={savedAiUnits}
                      aiEstimatedUnit={aiEstimatedUnits[index] ?? null}
                      compatibleUnits={compatibleUnitsByIndex[index] ?? []}
                      onApplyAiEstimate={applyAiEstimate}
                      onUpdate={updateVariant}
                      onDuplicate={duplicateVariant}
                      onRemove={removeVariant}
                    />
                  );
                })}
              </div>
            </div>

            {/*
              Last before the save button: the nutrition rows above are the
              point of this form, and a long recipe ahead of them would push
              them off-screen.
            */}
            <div className="pt-2 space-y-1.5">
              <Label htmlFor="food-notes">
                {t('customFoodForm.notesLabel', 'Notes')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'customFoodForm.notesHelp',
                  'Details you want to remember every time you log this — how you order it, or a recipe. Supports markdown.'
                )}
              </p>
              <MarkdownEditor
                id="food-notes"
                value={formData.notes}
                onChange={(next) => updateField('notes', next)}
                placeholder={t(
                  'customFoodForm.notesPlaceholder',
                  'e.g. White rice, double chicken, mild salsa, no beans'
                )}
                imageOptions={savedImageOptions}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? t('customFoodForm.saving', 'Saving...')
                : food && food.id
                  ? t('customFoodForm.updateFood', 'Update Food')
                  : t('customFoodForm.addFood', 'Add Food')}
            </Button>
          </form>
        </CardContent>
      </Card>
      {showSyncConfirmation && (
        <ConfirmationDialog
          open={showSyncConfirmation}
          onOpenChange={(open) => {
            if (!open) {
              handleSyncConfirmation('none');
            }
          }}
          // When this save replaced the food's photos the user gets a third
          // outcome, because the two photo results genuinely differ: the
          // confirm action forces the new photo onto every past entry
          // (replacing photos set on individual diary entries, which are then
          // deleted), while the secondary action rewrites nutrition only and
          // leaves every entry's photo alone. With photos untouched there is
          // nothing to decide, so it stays a plain yes/no about nutrition.
          onConfirm={() =>
            handleSyncConfirmation(
              syncTouchesPhotos ? 'nutrition-and-photos' : 'nutrition'
            )
          }
          variant={syncTouchesPhotos ? 'destructive' : 'default'}
          secondaryActionLabel={
            syncTouchesPhotos
              ? t(
                  'customFoodForm.syncConfirmationNutritionOnly',
                  'Update nutrition only'
                )
              : undefined
          }
          onSecondaryAction={
            syncTouchesPhotos
              ? () => handleSyncConfirmation('nutrition')
              : undefined
          }
          title={t(
            'customFoodForm.syncConfirmationTitle',
            'Sync Past Entries?'
          )}
          description={
            syncTouchesPhotos
              ? t(
                  'customFoodForm.syncConfirmationDescriptionWithPhotos',
                  "Do you want to update all your past diary entries for this food with the new nutrition and photos? Updating photos replaces photos you set on individual diary entries, and can't be undone."
                )
              : t(
                  'customFoodForm.syncConfirmationDescription',
                  "Do you want to update all your past diary entries for this food with the new nutrition? Entries you don't update keep their original values."
                )
          }
          confirmLabel={
            syncTouchesPhotos
              ? t(
                  'customFoodForm.syncConfirmationConfirmWithPhotos',
                  'Update nutrition & photos'
                )
              : t('customFoodForm.syncConfirmationConfirm', 'Update')
          }
        />
      )}

      {showBarcodeConflictConfirmation && (
        <ConfirmationDialog
          open={showBarcodeConflictConfirmation}
          onOpenChange={(open) => {
            if (!open) {
              setShowBarcodeConflictConfirmation(false);
            }
          }}
          onConfirm={handleBarcodeConflictConfirm}
          title={t(
            'customFoodForm.barcodeConflictTitle',
            'Barcode already in use'
          )}
          description={t('customFoodForm.barcodeConflictDescription', {
            existing: barcodeConflictFoodName,
            current: formData.name,
            defaultValue: `This barcode is already attached to "${barcodeConflictFoodName}". Attach it to "${formData.name}" anyway?`,
          })}
        />
      )}

      {showBarcodeScanner && (
        <BarcodeScannerDialog
          isOpen={showBarcodeScanner}
          onOpenChange={setShowBarcodeScanner}
          onBarcodeDetected={(scannedBarcode) => {
            updateField('barcode', scannedBarcode);
            setShowBarcodeScanner(false);
          }}
          hideProvider
          hideManualInput
        />
      )}
    </>
  );
};

export default CustomFoodForm;
