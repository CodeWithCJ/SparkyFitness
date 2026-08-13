import { useCallback, useState } from 'react';
import {
  useSetFoodEntryImagesMutation,
  useSetFoodEntryMealImagesMutation,
} from '@/hooks/Diary/useFoodEntries';
import {
  pickerImagesDiffer,
  splitPickerImages,
  toSavedImages,
  type PickerImage,
} from '@/utils/imagePickerItems';

/**
 * Holds a diary entry's photos as an unsaved draft.
 *
 * Photos deliberately do NOT persist as they are picked: the dialog owns a
 * single save, so a user who changes their mind can close without applying
 * anything. The dialog calls `save()` as part of its own submit.
 */
export function useEntryImageDraft(
  entryId: string,
  savedImages: string[] | null | undefined,
  kind: 'food' | 'meal' = 'food'
) {
  const [items, setItems] = useState<PickerImage[]>(() =>
    toSavedImages(savedImages)
  );

  const foodSet = useSetFoodEntryImagesMutation();
  const mealSet = useSetFoodEntryMealImagesMutation();
  const mutation = kind === 'meal' ? mealSet : foodSet;

  const isDirty = pickerImagesDiffer(items, savedImages);

  /** Discards the draft, restoring what is currently saved. */
  const reset = useCallback(() => {
    setItems(toSavedImages(savedImages));
  }, [savedImages]);

  /**
   * Persists the draft. A no-op when nothing changed, so a dialog can call this
   * unconditionally on submit without issuing a pointless request.
   */
  const save = useCallback(async () => {
    if (!isDirty) {
      return;
    }
    const { order, files } = splitPickerImages(items);
    await mutation.mutateAsync({ entryId, images: order, newFiles: files });
  }, [entryId, isDirty, items, mutation]);

  return {
    items,
    setItems,
    isDirty,
    isSaving: mutation.isPending,
    save,
    reset,
  };
}

export default useEntryImageDraft;
