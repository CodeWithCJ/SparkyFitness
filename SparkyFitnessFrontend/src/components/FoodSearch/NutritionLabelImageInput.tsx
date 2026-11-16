import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ImageSourceInput } from './ImageSourceInput';
import {
  labelScanErrorCode,
  useNutritionLabelScan,
} from '@/hooks/Foods/useNutritionLabelScan';
import type { Food } from '@/types/food';

interface NutritionLabelImageInputProps {
  /** Called with an unsaved food holding the values read from the label. */
  onLabelScanned: (food: Food) => void;
}

/** The message for a failed scan, from the server's error `code`. */
function scanErrorMessage(err: Error, t: TFunction): string {
  switch (labelScanErrorCode(err)) {
    case 'no_ai_configured':
      return t(
        'foodSearch.nutritionLabelImage.errors.noAiService',
        'Reading a label needs an AI service that supports images. Add one in Settings → AI Service.'
      );
    case 'unsupported_provider':
    case 'api_key_missing':
    case 'custom_url_missing':
    case 'private_network_forbidden':
      return t(
        'foodSearch.nutritionLabelImage.errors.aiServiceSetup',
        'Your AI service cannot be used to read labels: {{message}}',
        { message: err.message }
      );
    case 'unsupported_media':
    case 'image_too_large':
      return t(
        'foodSearch.nutritionLabelImage.errors.badImage',
        'This image could not be sent to your AI service. Try a JPEG or PNG photo.'
      );
    case 'refused':
    case 'truncated':
    case 'no_content':
    case 'parse_error':
      return t(
        'foodSearch.nutritionLabelImage.errors.unreadable',
        'No nutrition facts could be read from this image. Try a sharper, closer photo of the label.'
      );
    case 'upstream_error':
    case 'timeout':
      return t(
        'foodSearch.nutritionLabelImage.errors.unavailable',
        'Your AI service did not answer. Try again in a moment.'
      );
    default:
      return t(
        'foodSearch.nutritionLabelImage.errors.generic',
        'The label could not be read. Try again.'
      );
  }
}

/** Reads nutrition facts from an uploaded, dropped, or pasted label photo. */
export function NutritionLabelImageInput({
  onLabelScanned,
}: NutritionLabelImageInputProps) {
  const { t } = useTranslation();
  const { mutate, isPending, error } = useNutritionLabelScan();

  // A scan can take several seconds. Callbacks given to `mutate` do not run
  // once this input is unmounted, so closing the dialog meanwhile drops the
  // result instead of opening the food form unexpectedly.
  const handleImage = useCallback(
    (image: File) => mutate(image, { onSuccess: onLabelScanned }),
    [mutate, onLabelScanned]
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          'foodSearch.nutritionLabelImage.description',
          'Use a photo of the Nutrition Facts panel. Your AI service reads the values, and you can check them before the food is saved.'
        )}
      </p>
      <ImageSourceInput
        onImage={handleImage}
        busy={isPending}
        error={error ? scanErrorMessage(error, t) : null}
        buttonLabel={
          isPending
            ? t('foodSearch.nutritionLabelImage.reading', 'Reading label...')
            : t('foodSearch.nutritionLabelImage.upload', 'Upload label image')
        }
      />
    </div>
  );
}
