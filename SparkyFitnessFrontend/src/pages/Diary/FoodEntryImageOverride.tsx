import { useTranslation } from 'react-i18next';
import { FoodImagePicker } from '@/components/FoodSearch/FoodImagePicker';
import { usableFoodImages } from '@/utils/foodImages';
import type { PickerImage } from '@/utils/imagePickerItems';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

interface FoodEntryImageOverrideProps {
  /** The entry's draft photo list, owned by the parent dialog. */
  items: PickerImage[];
  onItemsChange: (items: PickerImage[]) => void;
  /** The entry being edited, used to show what it currently inherits. */
  entry: FoodEntry | FoodEntryMeal;
  kind?: 'food' | 'meal';
  /** True while the parent is persisting, to explain the pending state. */
  isSaving?: boolean;
}

/**
 * Per-entry photo control for a diary entry.
 *
 * Photos here apply to this log entry only — they never modify the underlying
 * food or meal. Changes are staged and applied by the parent dialog's save, so
 * closing without saving discards them.
 *
 * When the entry has no photos of its own, the parent's images are shown
 * dimmed and read-only, since that is what the diary actually falls back to.
 */
export function FoodEntryImageOverride({
  items,
  onItemsChange,
  entry,
  kind = 'food',
  isSaving = false,
}: FoodEntryImageOverrideProps) {
  const { t } = useTranslation();

  const inheritedImages =
    kind === 'meal'
      ? usableFoodImages((entry as FoodEntryMeal).meal_images)
      : usableFoodImages(
          (entry as FoodEntry).food_images ?? (entry as FoodEntry).foods?.images
        );

  const showInherited = items.length === 0 && inheritedImages.length > 0;

  return (
    <div className="space-y-2">
      <FoodImagePicker
        idPrefix={`entry-${entry.id}`}
        items={items}
        onItemsChange={onItemsChange}
        labelText={t('diary.entryPhoto', 'Photos for this entry')}
        helpText={t(
          'diary.entryPhotoOverrideHint',
          'These photos apply to this entry only. Drag to reorder.'
        )}
      />

      {showInherited && (
        <>
          <p className="text-xs text-muted-foreground">
            {t(
              'diary.entryPhotoInheritedHint',
              'Showing the current library photos. Add photos to set them for this entry.'
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {inheritedImages.map((src, index) => (
              <img
                key={src}
                src={src}
                alt={t('diary.inheritedPhotoAlt', {
                  defaultValue: 'Inherited image {{number}}',
                  number: index + 1,
                })}
                // Dimmed to read as "inherited, not attached to this entry".
                className="w-16 h-16 object-cover rounded opacity-60"
                loading="lazy"
              />
            ))}
          </div>
        </>
      )}

      {isSaving && (
        <p className="text-xs text-muted-foreground">
          {t('diary.savingPhotos', 'Saving photos…')}
        </p>
      )}
    </div>
  );
}

export default FoodEntryImageOverride;
