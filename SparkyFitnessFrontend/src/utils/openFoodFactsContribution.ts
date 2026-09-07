import type { Food } from '@/types/food';

type ContributionFood = Omit<Food, 'provider_type'> & {
  provider_type?: string | null;
};

export function isOpenFoodFactsContributionCandidate(
  food: ContributionFood,
  userId: string | undefined
): boolean {
  return Boolean(
    userId &&
    food.is_custom &&
    food.user_id === userId &&
    (!food.provider_type ||
      food.provider_type.trim().toLowerCase() === 'custom') &&
    !food.provider_external_id &&
    !food.provider_verified
  );
}

/** Re-encode a newly selected photo; existing food image URLs are never reused. */
export async function prepareOpenFoodFactsImage(file: File): Promise<string> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size === 0 ||
    file.size > 20 * 1024 * 1024
  ) {
    throw new Error('invalid_image');
  }

  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const shortest = Math.min(bitmap.width, bitmap.height);
    if (
      longest < 640 ||
      shortest < 160 ||
      bitmap.width * bitmap.height > 40_000_000
    ) {
      throw new Error('invalid_image_dimensions');
    }
    const scale = Math.min(1, 2400 / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    if (Math.min(canvas.width, canvas.height) < 160) {
      throw new Error('invalid_image_dimensions');
    }
    const context = canvas.getContext('2d');
    if (!context) throw new Error('image_conversion_failed');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
      throw new Error('image_conversion_failed');
    }
    const base64 = dataUrl.slice('data:image/jpeg;base64,'.length);
    if (!base64 || atob(base64).length > 4 * 1024 * 1024) {
      throw new Error('image_too_large');
    }
    return base64;
  } finally {
    bitmap.close();
  }
}
