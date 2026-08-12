import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  useSetFoodEntryImageMutation,
  useClearFoodEntryImageMutation,
  useSetFoodEntryMealImageMutation,
  useClearFoodEntryMealImageMutation,
} from '@/hooks/Diary/useFoodEntries';
import { diaryEntryImageSrc, usableFoodImages } from '@/utils/foodImages';
import type { FoodEntry } from '@/types/food';
import type { FoodEntryMeal } from '@/types/meal';

/** The subset both entry kinds share for image purposes. */
type ImageableEntry = FoodEntry | FoodEntryMeal;

interface FoodEntryImageOverrideProps {
  entry: ImageableEntry;
  /**
   * Which diary table the entry lives in. Food entries and logged meals store
   * their override on different tables, so they hit different endpoints.
   */
  kind?: 'food' | 'meal';
  /** Called after the override changes so the parent can refresh its data. */
  onChanged?: (updated: ImageableEntry) => void;
}

/**
 * Per-entry photo control for a diary entry.
 *
 * The photo applies to this log entry only — it never modifies the underlying
 * food or meal. When no override is set the entry falls back to the food's own
 * image, which is shown here greyed-in as the inherited default.
 */
export function FoodEntryImageOverride({
  entry,
  kind = 'food',
  onChanged,
}: FoodEntryImageOverrideProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<ImageableEntry>(entry);
  // The mutations own error toasts via their React Query `meta`.
  const foodSet = useSetFoodEntryImageMutation();
  const foodClear = useClearFoodEntryImageMutation();
  const mealSet = useSetFoodEntryMealImageMutation();
  const mealClear = useClearFoodEntryMealImageMutation();

  const setMutation = kind === 'meal' ? mealSet : foodSet;
  const clearMutation = kind === 'meal' ? mealClear : foodClear;
  const busy = setMutation.isPending || clearMutation.isPending;

  const hasOverride = Boolean(current.image_url);
  const displaySrc =
    kind === 'meal'
      ? (diaryEntryImageSrc({ image_url: current.image_url }) ??
        usableFoodImages((current as FoodEntryMeal).meal_images)[0] ??
        null)
      : diaryEntryImageSrc(current as FoodEntry);
  const inheritedSrc =
    kind === 'meal'
      ? usableFoodImages((current as FoodEntryMeal).meal_images)[0]
      : usableFoodImages(
          (current as FoodEntry).food_images ??
            (current as FoodEntry).foods?.images
        )[0];

  const applyUpdate = useCallback(
    (updated: ImageableEntry) => {
      setCurrent(updated);
      onChanged?.(updated);
    },
    [onChanged]
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset immediately so re-picking the same file still fires onChange.
      event.target.value = '';
      if (!file) {
        return;
      }
      try {
        applyUpdate(
          await setMutation.mutateAsync({ entryId: current.id, file })
        );
      } catch {
        // The mutation's meta already surfaced a toast.
      }
    },
    [applyUpdate, current.id, setMutation]
  );

  const handleClear = useCallback(async () => {
    try {
      applyUpdate(await clearMutation.mutateAsync({ entryId: current.id }));
    } catch {
      // The mutation's meta already surfaced a toast.
    }
  }, [applyUpdate, clearMutation, current.id]);

  return (
    <div className="space-y-2">
      <Label>{t('diary.entryPhoto', 'Photo for this entry')}</Label>
      <div className="flex items-center gap-3">
        {displaySrc ? (
          <div className="relative w-20 h-20 flex-shrink-0">
            <img
              src={displaySrc}
              alt={t('diary.entryPhotoAlt', 'Diary entry photo')}
              className="w-full h-full object-cover rounded-md"
            />
            {hasOverride && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                disabled={busy}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={handleClear}
                aria-label={t('diary.removeEntryPhoto', 'Remove photo')}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="w-20 h-20 flex-shrink-0 rounded-md border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}

        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasOverride
              ? t('diary.replaceEntryPhoto', 'Replace photo')
              : t('diary.addEntryPhoto', 'Add photo')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {hasOverride
              ? t(
                  'diary.entryPhotoOverrideHint',
                  'This photo applies to this entry only.'
                )
              : inheritedSrc
                ? t(
                    'diary.entryPhotoInheritedHint',
                    "Showing the food's own image."
                  )
                : t(
                    'diary.entryPhotoEmptyHint',
                    'Add a photo of what you actually ate.'
                  )}
          </p>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

export default FoodEntryImageOverride;
