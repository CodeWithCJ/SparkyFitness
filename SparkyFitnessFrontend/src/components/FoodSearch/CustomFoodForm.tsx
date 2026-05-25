import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Plus } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import type { Food, FoodVariant } from '@/types/food';

import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { VariantCard } from './VariantCard';
import { useCustomFoodForm } from '@/hooks/Foods/useFoodForm';
import { useActiveAIService } from '@/hooks/AI/useAIServiceSettings';
import { useUserAiConfigAllowed } from '@/hooks/AI/useUserAiConfigAllowed';
import { UNIT_GROUPS } from '@/constants/foodForm';
import { deriveSavedAiUnits } from '@/utils/foodAiUnits';
import { getConversionFactor } from '@workspace/shared';

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
  const {
    formData,
    variants,
    variantErrors,
    loading,
    showSyncConfirmation,
    setShowSyncConfirmation,
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
    applyAiEstimate,
    handleSubmit,
    handleSyncConfirmation,
  } = useCustomFoodForm({ food, initialVariants, onSave });
  const { nutrientDisplayPreferences, energyUnit, convertEnergy } =
    usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const { data: customNutrients } = useCustomNutrients();

  // AI gate for the per-row Convert-with-AI button: admin allows user AI
  // config + an active AI service exists. The per-user "AI Assisted Unit
  // Conversions" toggle was removed — when AI services are configured, the
  // feature is always available.
  const userAiConfigAllowedQuery = useUserAiConfigAllowed();
  const userAiConfigAllowed = userAiConfigAllowedQuery.data === true;
  const activeAiServiceQuery = useActiveAIService(userAiConfigAllowed);
  const aiEstimatesAvailable =
    userAiConfigAllowed && !!activeAiServiceQuery.data;

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

    return variants.map((variant, index) => {
      const compatibleUnits = new Set<string>();
      const currentUnit = variant.serving_unit;
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
          <CardTitle>
            {food && food.id ? 'Edit Food' : 'Add Custom Food'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Food Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => updateField('brand', e.target.value)}
                />
              </div>
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
                Quick Add (don't save to my food list for future use)
              </Label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Unit Variants</h3>
                <Button type="button" onClick={addVariant} size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Add Unit
                </Button>
              </div>
              <p className="text-sm text-gray-600">
                Add different unit measurements for this food with specific
                nutrition values for each unit.
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
                      visibleNutrients={visibleNutrients} // Passing the ordered array here
                      energyUnit={energyUnit}
                      convertEnergy={convertEnergy}
                      customNutrients={customNutrients}
                      showCompatibleUnitIndicators={
                        (hasTrustedCompatibilityBase[index] ?? false) ||
                        (compatibleUnitsByIndex[index]?.length ?? 0) > 0
                      }
                      food={{
                        // Sentinel id for foods that haven't been saved yet — the
                        // AI endpoint only uses foodId for telemetry/context, not
                        // for DB lookup, so a string suffices.
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

            <Button type="submit" disabled={loading} className="w-full">
              {loading
                ? 'Saving...'
                : food && food.id
                  ? 'Update Food'
                  : 'Add Food'}
            </Button>
          </form>
        </CardContent>
      </Card>
      {showSyncConfirmation && (
        <ConfirmationDialog
          open={showSyncConfirmation}
          onOpenChange={setShowSyncConfirmation}
          onConfirm={handleSyncConfirmation}
          title="Sync Past Entries?"
          description="Do you want to update all your past diary entries for this food with the new nutritional information?"
        />
      )}
    </>
  );
};

export default CustomFoodForm;
