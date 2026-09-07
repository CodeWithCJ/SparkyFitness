import { OpenFoodFactsContributionError } from './openFoodFactsContribution.js';

/** Only explicitly selected JPEG bytes cross the publication boundary.
 * Remove metadata (including GPS/EXIF and comments); never fetch a photo URL.
 * The sanitized bytes are returned in the preview and bound to its signature.
 */
export function prepareOpenFoodFactsPhoto(base64: string): Buffer {
  if (base64.length > 5_592_408) {
    throw new OpenFoodFactsContributionError(
      'The photo must be at most 4 MB.',
      400
    );
  }
  const photo = Buffer.from(base64, 'base64');
  if (photo.length > 4 * 1024 * 1024) {
    throw new OpenFoodFactsContributionError(
      'The photo must be at most 4 MB.',
      400
    );
  }
  const invalid = () =>
    new OpenFoodFactsContributionError(
      'A complete JPEG packaging or nutrition-label photo is required.',
      400
    );
  if (
    photo.toString('base64') !== base64 ||
    photo.length < 4 ||
    photo.readUInt16BE(0) !== 0xffd8 ||
    photo.readUInt16BE(photo.length - 2) !== 0xffd9
  ) {
    throw invalid();
  }
  const segments: Buffer[] = [photo.subarray(0, 2)];
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  while (offset + 2 <= photo.length) {
    if (photo[offset] !== 0xff) throw invalid();
    // JPEG allows fill bytes between markers.
    if (photo[offset + 1] === 0xff) {
      offset++;
      continue;
    }
    const marker = photo[offset + 1];
    if (marker === 0xd9) {
      if (!hasScan || offset + 2 !== photo.length) throw invalid();
      segments.push(photo.subarray(offset));
      return Buffer.concat(segments);
    }
    if (offset + 4 > photo.length) throw invalid();
    const length = photo.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > photo.length) throw invalid();
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 8) throw invalid();
      const height = photo.readUInt16BE(offset + 5);
      const width = photo.readUInt16BE(offset + 7);
      if (
        Math.max(width, height) < 640 ||
        Math.min(width, height) < 160 ||
        width * height > 40_000_000
      ) {
        throw new OpenFoodFactsContributionError(
          'Use a clear photo at least 640 x 160 pixels and at most 40 megapixels.',
          400
        );
      }
      hasFrame = true;
    }
    if (marker === 0xda) {
      if (!hasFrame) throw invalid();
      let scanEnd = end;
      while (scanEnd < photo.length) {
        if (photo[scanEnd] !== 0xff) {
          scanEnd++;
          continue;
        }
        let nextMarker = scanEnd + 1;
        while (photo[nextMarker] === 0xff) nextMarker++;
        const next = photo[nextMarker];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) {
          // Escaped FF bytes and restart markers are entropy data, not metadata.
          scanEnd = nextMarker + 1;
          continue;
        }
        break;
      }
      segments.push(photo.subarray(offset, scanEnd));
      offset = scanEnd;
      hasScan = true;
      continue;
    }
    // Even APP0 can contain an undisplayed JFXX thumbnail. Pixel decoding does
    // not require APP metadata, so strip every APP and COM segment.
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      segments.push(photo.subarray(offset, end));
    }
    offset = end;
  }
  throw invalid();
}
