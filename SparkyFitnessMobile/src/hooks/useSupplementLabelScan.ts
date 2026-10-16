import { useMutation } from '@tanstack/react-query';
import type { SupplementLookupProduct } from '@workspace/shared';
import {
  mapSupplementLabel,
  scanSupplementLabelImage,
} from '../services/api/medicationsApi';
import { scanSupplementLabelOnDevice } from '../services/onDeviceSupplementScan';

export interface SupplementLabelScanResult {
  product: SupplementLookupProduct | null;
  /** Who read the photo: Apple's on-device model, or the server's AI provider. */
  source: 'device' | 'server';
}

/**
 * Reads a Supplement Facts photo. The on-device model goes first when it is
 * switched on and available; the server's vision provider reads anything it
 * cannot. Either way the server turns the ingredients into nutrients.
 */
export function useSupplementLabelScan() {
  return useMutation<SupplementLabelScanResult, Error, string>({
    mutationFn: async (base64Image) => {
      const onDevice = await scanSupplementLabelOnDevice(base64Image);
      if (onDevice) {
        const { product } = await mapSupplementLabel(onDevice);
        return { product, source: 'device' };
      }
      const { product } = await scanSupplementLabelImage(base64Image);
      return { product, source: 'server' };
    },
  });
}
