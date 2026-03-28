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

import { useUpdateFoodEntriesSnapshotMutation } from '@/hooks/Foods/useFoods';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { VariantCard } from './VariantCard';
import { useCustomFoodForm } from '@/hooks/Foods/useFoodForm';

interface CustomFoodFormProps {
  onSave: (foodData: Food) => void;
  food?: Food;
  initialVariants?: FoodVariant[]; // New prop for pre-populating variants
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
    loadedVariantsRef,
    updateField,
    addVariant,
    duplicateVariant,
    removeVariant,
    updateVariant,
    handleSubmit,
    handleSyncConfirmation,
  } = useCustomFoodForm({ food, initialVariants, onSave });
  const { nutrientDisplayPreferences, energyUnit, convertEnergy } =
    usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const { data: customNutrients } = useCustomNutrients();
  useUpdateFoodEntriesSnapshotMutation();

  const foodDatabasePreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'food_database' && p.platform === platform
  );
  const visibleNutrients =
    passedVisibleNutrients ||
    (foodDatabasePreferences
      ? foodDatabasePreferences.visible_nutrients
      : Object.keys(variants[0] || {}));

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
            {/* Basic Info: grid-cols-1 on mobile, sm:grid-cols-2 on small screens and up */}
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

            {/* Quick Add Checkbox (already good, flex handles it) */}
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

            {/* Unit Variants with Individual Nutrition */}
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
                {variants.map((variant, index) => (
                  <VariantCard
                    key={index}
                    index={index}
                    variant={variant}
                    variantError={variantErrors[index] ?? ''}
                    visibleNutrients={visibleNutrients}
                    energyUnit={energyUnit}
                    convertEnergy={convertEnergy}
                    customNutrients={customNutrients}
                    baseServingUnit={
                      loadedVariantsRef.current[index]?.serving_unit ??
                      variant.serving_unit
                    }
                    onUpdate={updateVariant}
                    onDuplicate={duplicateVariant}
                    onRemove={removeVariant}
                  />
                ))}
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
