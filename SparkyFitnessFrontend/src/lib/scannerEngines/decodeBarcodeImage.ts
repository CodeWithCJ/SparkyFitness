import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library';

export type BarcodeImageDecodeResult =
  | { status: 'found'; code: string }
  | { status: 'not_found' }
  | { status: 'unreadable' };

// Retail product codes only, the same set the mobile scanner accepts. A
// screenshot often has other codes in it (a QR code on a web page, for
// example), and those would only send a useless lookup to the providers.
const PRODUCT_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

// The longest side of the image at each decode attempt. Phone photos are
// several thousand pixels wide, which makes the decoder slow and its
// binarizer less reliable, so they are scaled down first. A smaller second
// pass helps with photos where the barcode fills most of the frame. Images
// that are already smaller are decoded at their own size, never scaled up.
const DECODE_SIZES = [1600, 800];

// Draws the image scaled so its longest side is `side` pixels, turned a
// quarter turn when `sideways` is set. The rotation happens here because
// sideways barcodes did not decode through rotateCounterClockwise on
// HTMLCanvasElementLuminanceSource (@zxing/library 0.23), nor through the
// rotation TRY_HARDER attempts with that source.
function drawScaled(
  bitmap: ImageBitmap,
  side: number,
  sideways: boolean
): HTMLCanvasElement | null {
  const scale = side / Math.max(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  if (sideways) {
    context.translate(height, 0);
    context.rotate(Math.PI / 2);
  }
  context.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

function decodeCanvas(
  reader: MultiFormatReader,
  canvas: HTMLCanvasElement
): string | null {
  try {
    const source = new HTMLCanvasElementLuminanceSource(canvas);
    return reader
      .decodeWithState(new BinaryBitmap(new HybridBinarizer(source)))
      .getText();
  } catch {
    // zxing reports "no barcode here" and checksum or format failures as
    // exceptions; each one only means this attempt found nothing.
    return null;
  }
}

/**
 * Reads a retail barcode from a still image (an uploaded photo or a pasted
 * screenshot). Each size is tried as is and turned 90 degrees, because 1D
 * readers only scan horizontally and a photo of a product is often sideways.
 */
export async function decodeBarcodeFromImage(
  image: Blob
): Promise<BarcodeImageDecodeResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    return { status: 'unreadable' };
  }

  try {
    const reader = new MultiFormatReader();
    reader.setHints(
      new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS],
        [DecodeHintType.TRY_HARDER, true],
      ])
    );

    const longestSide = Math.max(bitmap.width, bitmap.height);
    const sides = [
      ...new Set(DECODE_SIZES.map((size) => Math.min(size, longestSide))),
    ];

    for (const side of sides) {
      for (const sideways of [false, true]) {
        const canvas = drawScaled(bitmap, side, sideways);
        if (!canvas) return { status: 'unreadable' };
        const code = decodeCanvas(reader, canvas);
        if (code) return { status: 'found', code };
      }
    }
    return { status: 'not_found' };
  } finally {
    bitmap.close();
  }
}
