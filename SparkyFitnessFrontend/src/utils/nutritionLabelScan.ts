import type {
  NutritionLabelScanRequest,
  NutritionLabelScanResult,
} from '@workspace/shared';
import type { Food, FoodVariant } from '@/types/food';
import { resizeImageBase64 } from '@/utils/imageResize';

/**
 * Longest edge sent for a label scan, the same as the mobile app. Label text
 * is small, so this is larger than the default for other AI images.
 */
const LABEL_MAX_DIMENSION = 1600;

const readFileAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });

/**
 * The request body for a label photo: scaled down to `LABEL_MAX_DIMENSION`
 * and re-encoded as JPEG when larger, otherwise sent as it is.
 */
export async function prepareLabelImage(
  file: Blob
): Promise<NutritionLabelScanRequest> {
  const dataUrl = await resizeImageBase64(
    await readFileAsDataUrl(file),
    LABEL_MAX_DIMENSION
  );
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new Error('Image could not be encoded');
  return { mime_type: match[1], image: match[2] };
}

const optionalAmount = (value: number | null): number | undefined =>
  value ?? undefined;

/**
 * An unsaved food holding the label's values, for the food form to open
 * with. The user reviews it there before anything is saved, so a missing
 * name stays empty for them to fill in.
 */
export function labelScanToFood(result: NutritionLabelScanResult): Food {
  // Without a printed serving the amounts can only be read as one serving.
  const servingUnit =
    result.serving_unit ?? (result.serving_size !== null ? 'g' : 'serving');
  const variant: FoodVariant = {
    serving_size: result.serving_size ?? 1,
    serving_unit: servingUnit,
    calories: result.calories ?? 0,
    protein: result.protein ?? 0,
    carbs: result.carbs ?? 0,
    fat: result.fat ?? 0,
    saturated_fat: optionalAmount(result.saturated_fat),
    trans_fat: optionalAmount(result.trans_fat),
    cholesterol: optionalAmount(result.cholesterol),
    sodium: optionalAmount(result.sodium),
    potassium: optionalAmount(result.potassium),
    dietary_fiber: optionalAmount(result.fiber),
    sugars: optionalAmount(result.sugars),
    vitamin_a: optionalAmount(result.vitamin_a),
    vitamin_c: optionalAmount(result.vitamin_c),
    calcium: optionalAmount(result.calcium),
    iron: optionalAmount(result.iron),
    caffeine_mg: optionalAmount(result.caffeine_mg),
    water_ml: optionalAmount(result.water_ml),
    alcohol_g: optionalAmount(result.alcohol_g),
    is_default: true,
  };
  return {
    id: '',
    name: result.name ?? '',
    brand: result.brand,
    is_custom: true,
    variants: [variant],
  };
}
