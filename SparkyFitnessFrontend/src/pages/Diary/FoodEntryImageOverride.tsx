import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  useSetFoodEntryImagesMutation,
  useClearFoodEntryImageMutation,
  useSetFoodEntryMealImagesMutation,
  useClearFoodEntryMealImageMutation,
} from '@/hooks/Diary/useFoodEntries';
import { FoodImagePicker } from '@/components/FoodSearch/FoodImagePicker';
import { usableFoodImages } from '@/utils/foodImages';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

/** The subset both entry kinds share for image purposes. */
type ImageableEntry = FoodEntry | FoodEntryMeal;

interface FoodEntryImageOverrideProps {
  entry: ImageableEntry;
  /**
   * Which diary table the entry lives in. Food entries and logged meals store
   * their overrides on different tables, so they hit different endpoints.
   */
  kind?: 'food' | 'meal';
  /** Called after the override changes so the parent can refresh its data. */
  onChanged?: (updated: ImageableEntry) => void;
}

/**
 * Per-entry photo control for a diary entry.
 *
 * Photos here apply to this log entry only — they never modify the underlying
 * food or meal. When the entry has no photos of its own, the parent's images
 * are shown instead (dimmed, read-only), since that is what the diary falls
 * back to displaying.
 *
 * Unlike the food/meal forms, this saves immediately rather than on a parent
 * submit, because the diary dialogs have no single save step that owns it.
 */
export function FoodEntryImageOverride({
  entry,
  kind = 'food',
  onChanged,
}: FoodEntryImageOverrideProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<ImageableEntry>(entry);

  const foodSet = useSetFoodEntryImagesMutation();
  const foodClear = useClearFoodEntryImageMutation();
  const mealSet = useSetFoodEntryMealImagesMutation();
  const mealClear = useClearFoodEntryMealImageMutation();

  const setMutation = kind === 'meal' ? mealSet : foodSet;
  const clearMutation = kind === 'meal' ? mealClear : foodClear;
  const busy = setMutation.isPending || clearMutation.isPending;

  const overrideImages = usableFoodImages(current.images);
  const inheritedImages =
    kind === 'meal'
      ? usableFoodImages((current as FoodEntryMeal).meal_images)
      : usableFoodImages(
          (current as FoodEntry).food_images ??
            (current as FoodEntry).foods?.images
        );

  const applyUpdate = useCallback(
    (updated: ImageableEntry) => {
      setCurrent(updated);
      onChanged?.(updated);
    },
    [onChanged]
  );

  /**
   * Persists the resulting image set. Removing the last photo goes through the
   * clear endpoint, since the upload endpoint requires either files or an
   * explicit keep-list.
   */
  const persist = useCallback(
    async (keepImages: string[], newFiles: File[]) => {
      try {
        if (keepImages.length === 0 && newFiles.length === 0) {
          applyUpdate(await clearMutation.mutateAsync({ entryId: current.id }));
          return;
        }
        applyUpdate(
          await setMutation.mutateAsync({
            entryId: current.id,
            keepImages,
            newFiles,
          })
        );
      } catch {
        // The mutation's meta already surfaced a toast.
      }
    },
    [applyUpdate, clearMutation, current.id, setMutation]
  );

  const handleExistingChange = useCallback(
    (images: string[]) => {
      void persist(images, []);
    },
    [persist]
  );

  const handleNewFiles = useCallback(
    (files: File[]) => {
      if (files.length > 0) {
        void persist(overrideImages, files);
      }
    },
    [overrideImages, persist]
  );

  return (
    <div className="space-y-2">
      <FoodImagePicker
        idPrefix={`entry-${current.id}`}
        existingImages={overrideImages}
        onExistingImagesChange={handleExistingChange}
        // Files upload the moment they're picked, so nothing stays staged here.
        newFiles={[]}
        onNewFilesChange={handleNewFiles}
        labelText={t('diary.entryPhoto', 'Photos for this entry')}
      />

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        {overrideImages.length > 0
          ? t(
              'diary.entryPhotoOverrideHint',
              'These photos apply to this entry only.'
            )
          : inheritedImages.length > 0
            ? t(
                'diary.entryPhotoInheritedHint',
                "Showing the food's own images. Add a photo to override them for this entry."
              )
            : t(
                'diary.entryPhotoEmptyHint',
                'Add a photo of what you actually ate.'
              )}
      </p>

      {overrideImages.length === 0 && inheritedImages.length > 0 && (
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
      )}

      {overrideImages.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void persist([], [])}
        >
          {t('diary.resetEntryPhotos', "Reset to the food's own images")}
        </Button>
      )}
    </div>
  );
}

export default FoodEntryImageOverride;
