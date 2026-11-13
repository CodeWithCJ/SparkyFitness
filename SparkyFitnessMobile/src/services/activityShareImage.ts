import type { RefObject } from 'react';
import type { View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ImageFormat, makeImageFromView } from '@shopify/react-native-skia';

/**
 * Captures the share card as a PNG (transparent where nothing is drawn) and
 * opens the share sheet. Resolves to false when the person closed the sheet
 * without choosing; other failures throw.
 */
export async function shareActivityImage(options: {
  cardRef: RefObject<View | null>;
  name: string;
}): Promise<boolean> {
  const image = await makeImageFromView(options.cardRef);
  if (!image) throw new Error('Could not capture the share image');
  const bytes = image.encodeToBytes(ImageFormat.PNG, 100);

  const safeName = options.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const file = new File(Paths.cache, `${safeName || 'activity'}-overlay.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: options.name,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return false;
    }
    throw error;
  }
}
