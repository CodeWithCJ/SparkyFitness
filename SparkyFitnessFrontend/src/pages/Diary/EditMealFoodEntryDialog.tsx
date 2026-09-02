import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import MealBuilder from '@/components/MealBuilder';
import FoodEntryImageOverride from './FoodEntryImageOverride';
import { useEntryImageDraft } from '@/hooks/Diary/useEntryImageDraft';
import type { FoodEntryMeal, MealFood } from '@/types/meal';

interface EditMealFoodEntryDialogProps {
  foodEntry: FoodEntryMeal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditMealFoodEntryDialog = ({
  foodEntry,
  open,
  onOpenChange,
}: EditMealFoodEntryDialogProps) => {
  // Pre-unscale component quantities synchronously using the entry's snapshotted
  // yield so MealBuilder mounts directly with the whole-dish recipe amounts
  // (preventing visual flicker between consumed and whole-dish amounts while the
  // async query is in flight).
  const initialMealFoods: MealFood[] = useMemo(() => {
    const rawFoods = foodEntry.foods ?? [];
    if (
      !foodEntry.entry_total_servings ||
      foodEntry.entry_total_servings <= 0
    ) {
      return rawFoods;
    }
    const consumed = foodEntry.quantity ?? 1;
    if (foodEntry.legacy_serving_unit_math && foodEntry.unit === 'serving') {
      const multiplier = consumed;
      return multiplier > 0
        ? rawFoods.map((f) => ({
            ...f,
            quantity: f.quantity / multiplier,
          }))
        : rawFoods;
    }
    const multiplier = consumed / foodEntry.entry_total_servings;
    return multiplier > 0
      ? rawFoods.map((f) => ({
          ...f,
          quantity: f.quantity / multiplier,
        }))
      : rawFoods;
  }, [foodEntry]);

  // Photos are staged here and applied when MealBuilder reports a successful
  // save, so closing the dialog without saving discards them.
  const imageDraft = useEntryImageDraft(foodEntry.id, foodEntry.images, 'meal');

  const handleSave = async () => {
    await imageDraft.save();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Logged Meal: {foodEntry?.name}</DialogTitle>{' '}
          <DialogDescription>
            Modify the foods and quantities for this specific logged meal entry.
          </DialogDescription>
          <p className="text-sm text-blue-500 mt-2">
            Note: Changes made here will only affect this specific entry in your
            food diary, not the master meal template.
          </p>
        </DialogHeader>
        {/* Per-entry photo. Edits are staged and persisted on save, and only
            affect this entry — the meal template's own images are untouched. */}
        <FoodEntryImageOverride
          entry={foodEntry}
          kind="meal"
          items={imageDraft.items}
          onItemsChange={imageDraft.setItems}
          isSaving={imageDraft.isSaving}
        />
        <MealBuilder
          initialFoods={initialMealFoods}
          initialMealName={foodEntry.name}
          initialDescription={foodEntry.description || ''}
          initialNotes={foodEntry.notes || ''}
          initialServingUnit={foodEntry.unit}
          initialConsumedQuantity={foodEntry.quantity}
          initialTotalServings={foodEntry.entry_total_servings}
          initialTotalAmount={
            foodEntry.unit !== 'serving'
              ? (foodEntry.entry_total_servings ?? null)
              : null
          }
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          source="food-diary"
          foodEntryId={foodEntry.id}
          foodEntryDate={foodEntry.entry_date}
          foodEntryMealType={foodEntry.meal_type}
          initialEntryTime={foodEntry.entry_time}
        />
      </DialogContent>
    </Dialog>
  );
};

export default EditMealFoodEntryDialog;
