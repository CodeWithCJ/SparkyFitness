import { describe, expect, it } from 'vitest';
import { prepareOpenFoodFactsPhoto } from '../integrations/openfoodfacts/openFoodFactsPhoto.js';

const header = Buffer.from([0xff, 0xd8]);
const frame = Buffer.from([
  0xff, 0xc0, 0, 17, 8, 0, 160, 2, 128, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
]);
const scan = Buffer.from([
  0xff, 0xda, 0, 12, 3, 1, 0, 2, 0, 3, 0, 0, 63, 0, 0xff, 0xd9,
]);
const jpeg = Buffer.concat([header, frame, scan]);

describe('Open Food Facts photo validation', () => {
  it('removes APP0 thumbnails as well as other application metadata', () => {
    const thumbnail = Buffer.concat([
      Buffer.from([0xff, 0xe0, 0, 13]),
      Buffer.from('JFXX secret'),
    ]);
    const source = Buffer.concat([header, thumbnail, frame, scan]);
    expect(prepareOpenFoodFactsPhoto(source.toString('base64'))).toEqual(jpeg);
  });

  it('removes EXIF, comments and original filenames before showing or uploading the photo', () => {
    const exif = Buffer.concat([
      Buffer.from([0xff, 0xe1, 0, 12]),
      Buffer.from('GPS secret'),
    ]);
    const comment = Buffer.concat([
      Buffer.from([0xff, 0xfe, 0, 10]),
      Buffer.from('filename'),
    ]);
    const source = Buffer.concat([header, exif, comment, frame, scan]);
    expect(prepareOpenFoodFactsPhoto(source.toString('base64'))).toEqual(jpeg);
  });

  it.each([
    '',
    'not a jpeg',
    Buffer.from('<svg/>').toString('base64'),
    jpeg.subarray(0, 10).toString('base64'),
  ])('rejects missing, non-JPEG or truncated input', (input) => {
    expect(() => prepareOpenFoodFactsPhoto(input)).toThrow();
  });

  it('rejects photos below the source-evidence resolution', () => {
    const small = Buffer.from(jpeg);
    small.writeUInt16BE(100, 7);
    expect(() => prepareOpenFoodFactsPhoto(small.toString('base64'))).toThrow(
      /640.*160/
    );
  });

  it('strips metadata between JPEG scans, not only before the first scan', () => {
    const exif = Buffer.concat([
      Buffer.from([0xff, 0xe1, 0, 12]),
      Buffer.from('GPS secret'),
    ]);
    const firstScan = Buffer.concat([
      scan.subarray(0, -2),
      Buffer.from([1, 0xff, 0, 2, 0xff, 0xd0, 3]),
    ]);
    const source = Buffer.concat([header, frame, firstScan, exif, scan]);
    expect(prepareOpenFoodFactsPhoto(source.toString('base64'))).toEqual(
      Buffer.concat([header, frame, firstScan, scan])
    );
  });

  it('rejects oversized encoded content before parsing it', () => {
    expect(() =>
      prepareOpenFoodFactsPhoto(
        Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')
      )
    ).toThrow(/4 MB/);
  });
});
