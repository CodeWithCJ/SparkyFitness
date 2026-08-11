import { useCallback, useEffect, useMemo } from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { resolveFoodImageSrc } from '@/utils/foodImages';

interface FoodImagePickerProps {
  /** Already-saved image paths (server-relative or absolute provider URLs). */
  existingImages: string[];
  /** Called when the user removes one of the already-saved images. */
  onExistingImagesChange: (images: string[]) => void;
  /** Files staged for upload on the next save. */
  newFiles: File[];
  onNewFilesChange: (files: File[]) => void;
  /** Distinguishes the input element when two pickers share a page. */
  idPrefix?: string;
  labelText?: string;
  /** Upper bound the server also enforces (10 files, 10MB each). */
  maxImages?: number;
}

const DEFAULT_MAX_IMAGES = 10;

/**
 * Multi-image picker for foods and meals.
 *
 * Saved images and newly staged files are tracked separately: the parent sends
 * the surviving saved paths as JSON and the new files as binary parts, which is
 * what lets the server tell "keep these, add those" apart from a removal.
 */
export function FoodImagePicker({
  existingImages,
  onExistingImagesChange,
  newFiles,
  onNewFilesChange,
  idPrefix = 'food',
  labelText,
  maxImages = DEFAULT_MAX_IMAGES,
}: FoodImagePickerProps) {
  const { t } = useTranslation();

  // Derived rather than stored in state, so there's no render-then-set cascade.
  const previewUrls = useMemo(
    () => newFiles.map((file) => URL.createObjectURL(file)),
    [newFiles]
  );

  // Object URLs leak until revoked. Cleanup runs when the list is replaced and
  // on unmount, which covers both re-picking files and closing the form.
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const totalCount = existingImages.length + newFiles.length;
  const remainingSlots = Math.max(0, maxImages - totalCount);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      if (selected.length > 0) {
        onNewFilesChange([...newFiles, ...selected.slice(0, remainingSlots)]);
      }
      // Reset so picking the same file twice in a row still fires onChange.
      event.target.value = '';
    },
    [newFiles, onNewFilesChange, remainingSlots]
  );

  const handleRemoveExisting = useCallback(
    (index: number) => {
      onExistingImagesChange(existingImages.filter((_, i) => i !== index));
    },
    [existingImages, onExistingImagesChange]
  );

  const handleRemoveNew = useCallback(
    (index: number) => {
      onNewFilesChange(newFiles.filter((_, i) => i !== index));
    },
    [newFiles, onNewFilesChange]
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
      {totalCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {existingImages.map((image, index) => {
            const src = resolveFoodImageSrc(image);
            if (!src) {
              return null;
            }
            return (
              <div key={`existing-${image}`} className="relative w-24 h-24">
                <img
                  src={src}
                  alt={t('food.imagePreviewAlt', {
                    defaultValue: 'Food image {{number}}',
                    number: index + 1,
                  })}
                  className="w-full h-full object-cover rounded"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  onClick={() => handleRemoveExisting(index)}
                  aria-label={t('food.removeImage', 'Remove image')}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {previewUrls.map((url, index) => (
            <div key={`new-${url}`} className="relative w-24 h-24">
              <img
                src={url}
                alt={t('food.newImagePreviewAlt', {
                  defaultValue: 'New image {{number}}',
                  number: index + 1,
                })}
                className="w-full h-full object-cover rounded"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={() => handleRemoveNew(index)}
                aria-label={t('food.removeImage', 'Remove image')}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FoodImagePicker;
