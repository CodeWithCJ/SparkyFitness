import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageSourceInput } from './ImageSourceInput';
import { error as logError } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';

interface BarcodeImageInputProps {
  onBarcodeDetected: (barcode: string) => void;
}

/** Reads a product barcode from an uploaded, dropped, or pasted image. */
export function BarcodeImageInput({
  onBarcodeDetected,
}: BarcodeImageInputProps) {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [decoding, setDecoding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleImage = useCallback(
    async (image: File) => {
      setDecoding(true);
      setErrorMessage(null);
      try {
        // Loaded on demand so the decoder is only fetched when an image is used.
        const { decodeBarcodeFromImage } =
          await import('@/lib/scannerEngines/decodeBarcodeImage');
        const result = await decodeBarcodeFromImage(image);
        if (result.status === 'found') {
          onBarcodeDetected(result.code);
        } else if (result.status === 'not_found') {
          setErrorMessage(
            t(
              'foodSearch.barcodeImage.notFound',
              'No barcode found in this image. Try a sharper picture with the whole barcode in view.'
            )
          );
        } else {
          setErrorMessage(
            t(
              'foodSearch.barcodeImage.unreadable',
              'This image could not be opened. Try a JPEG or PNG file.'
            )
          );
        }
      } catch (err) {
        logError(loggingLevel, 'Barcode image decode failed:', err);
        setErrorMessage(
          t(
            'foodSearch.barcodeImage.unreadable',
            'This image could not be opened. Try a JPEG or PNG file.'
          )
        );
      } finally {
        setDecoding(false);
      }
    },
    [loggingLevel, onBarcodeDetected, t]
  );

  return (
    <ImageSourceInput
      onImage={handleImage}
      busy={decoding}
      error={errorMessage}
      buttonLabel={t('foodSearch.barcodeImage.upload', 'Upload barcode image')}
    />
  );
}
