import { useCallback, useEffect, useMemo, useState } from 'react';
import { GripVertical, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { resolveFoodImageSrc } from '@/utils/foodImages';
import {
  reorderPickerImages,
  toNewImage,
  type PickerImage,
} from '@/utils/imagePickerItems';

interface FoodImagePickerProps {
  /** Ordered list of saved images and staged files. */
  items: PickerImage[];
  onItemsChange: (items: PickerImage[]) => void;
  /** Distinguishes the input element when two pickers share a page. */
  idPrefix?: string;
  labelText?: string;
  /** Upper bound the server also enforces (10 files, 10MB each). */
  maxImages?: number;
  helpText?: string;
}

const DEFAULT_MAX_IMAGES = 10;

/**
 * Multi-image picker for foods, meals, and diary entries.
 *
 * Saved images and newly staged files share one ordered list so a new photo can
 * be dragged ahead of an existing one. The first image is what list views show
 * as the thumbnail, which is why ordering is worth the drag handles.
 */
export function FoodImagePicker({
  items,
  onItemsChange,
  idPrefix = 'food',
  labelText,
  maxImages = DEFAULT_MAX_IMAGES,
  helpText,
}: FoodImagePickerProps) {
  const { t } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Derived rather than stored in state, so there's no render-then-set cascade.
  const previews = useMemo(
    () =>
      items.map((item) =>
        item.kind === 'new'
          ? { key: item.id, src: URL.createObjectURL(item.file) }
          : { key: `saved-${item.path}`, src: resolveFoodImageSrc(item.path) }
      ),
    [items]
  );

  // Object URLs leak until revoked. Only the blob ones need cleaning up; saved
  // paths are plain URLs.
  useEffect(() => {
    const objectUrls = previews
      .filter((p) => p.src?.startsWith('blob:'))
      .map((p) => p.src as string);
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const remainingSlots = Math.max(0, maxImages - items.length);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      if (selected.length > 0) {
        onItemsChange([
          ...items,
          ...selected.slice(0, remainingSlots).map(toNewImage),
        ]);
      }
      // Reset so picking the same file twice in a row still fires onChange.
      event.target.value = '';
    },
    [items, onItemsChange, remainingSlots]
  );

  const handleRemove = useCallback(
    (index: number) => {
      onItemsChange(items.filter((_, i) => i !== index));
    },
    [items, onItemsChange]
  );

  const handleDrop = useCallback(
    (targetIndex: number) => {
      if (dragIndex !== null) {
        onItemsChange(reorderPickerImages(items, dragIndex, targetIndex));
      }
      setDragIndex(null);
      setOverIndex(null);
    },
    [dragIndex, items, onItemsChange]
  );

  /** Keyboard equivalent of dragging, so reordering isn't mouse-only. */
  const move = useCallback(
    (index: number, delta: number) => {
      onItemsChange(reorderPickerImages(items, index, index + delta));
    },
    [items, onItemsChange]
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-images`}>
        {labelText ?? t('food.imagesLabel', 'Images')}
      </Label>
      <Input
        id={`${idPrefix}-images`}
        type="file"
        multiple
        accept="image/*"
        disabled={remainingSlots === 0}
        onChange={handleFileChange}
      />
      {remainingSlots === 0 && (
        <p className="text-xs text-muted-foreground">
          {t('food.imagesLimitReached', {
            defaultValue: 'Maximum of {{count}} images reached.',
            count: maxImages,
          })}
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.map((_item, index) => {
              const preview = previews[index];
              if (!preview?.src) {
                return null;
              }
              return (
                <div
                  key={preview.key}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragOver={(e) => {
                    // Required for the drop target to accept the drag.
                    e.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(index);
                  }}
                  className={`relative w-24 h-24 cursor-grab active:cursor-grabbing rounded ring-offset-2 ${
                    overIndex === index && dragIndex !== index
                      ? 'ring-2 ring-blue-500'
                      : ''
                  } ${dragIndex === index ? 'opacity-50' : ''}`}
                >
                  <img
                    src={preview.src}
                    alt={t('food.imagePreviewAlt', {
                      defaultValue: 'Food image {{number}}',
                      number: index + 1,
                    })}
                    className="w-full h-full object-cover rounded pointer-events-none"
                  />

                  {index === 0 && (
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] text-center rounded-b">
                      {t('food.mainImage', 'Main')}
                    </span>
                  )}

                  <span className="absolute top-1 left-1 rounded bg-black/50 p-0.5 text-white">
                    <GripVertical className="h-3 w-3" />
                  </span>

                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => handleRemove(index)}
                    aria-label={t('food.removeImage', 'Remove image')}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>

                  {/* Keyboard-accessible reordering. */}
                  <div className="absolute bottom-0 left-0 flex">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={t('food.moveImageEarlier', 'Move image left')}
                      className="px-1 text-white bg-black/50 rounded-tr disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={t('food.moveImageLater', 'Move image right')}
                      className="px-1 text-white bg-black/50 rounded-tr disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {helpText ??
              t(
                'food.imagesReorderHint',
                'Drag to reorder. The first image is used as the thumbnail.'
              )}
          </p>
        </>
      )}
    </div>
  );
}

export default FoodImagePicker;
