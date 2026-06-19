// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import path from 'path';

// Image formats accepted by check-in photo uploads, each paired with the
// canonical extension we persist it under. The multer fileFilter only inspects
// the client-supplied filename and mime type, both of which are spoofable, so
// the real file content is re-checked against these signatures downstream (see
// getImageExtension / isAllowedImageBuffer).
interface ImageFormat {
  ext: string;
  matches: (buffer: Buffer) => boolean;
}

const startsWith = (buffer: Buffer, sig: number[]): boolean =>
  buffer.length >= sig.length && sig.every((b, i) => buffer[i] === b);

const IMAGE_FORMATS: ImageFormat[] = [
  { ext: 'jpg', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    ext: 'png',
    matches: (b) =>
      startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  { ext: 'gif', matches: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) }, // "GIF8"
  {
    // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP". The RIFF prefix
    // alone also matches WAV/AVI, so the "WEBP" tag at offset 8 is required too.
    ext: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

/**
 * Returns the canonical extension (no leading dot) for the image format the
 * buffer's real content matches, or null if it is not an accepted image. The
 * stored file extension is derived from this rather than the spoofable
 * client-supplied filename, so the served Content-Type always matches the bytes.
 */
export const getImageExtension = (buffer: Buffer): string | null =>
  IMAGE_FORMATS.find((f) => f.matches(buffer))?.ext ?? null;

/**
 * Returns true only if the buffer starts with a known JPEG, PNG, GIF, or WebP
 * signature. Reads a handful of leading bytes, so the cost is negligible
 * relative to the upload itself.
 */
export const isAllowedImageBuffer = (buffer: Buffer): boolean =>
  getImageExtension(buffer) !== null;

// Buffer the upload in memory so its real bytes can be validated before the
// service writes anything to disk, keeping a rejected (non-image) upload from
// ever touching the uploads directory. The fileFilter is a cheap first pass on
// the (spoofable) filename/mime type; getImageExtension is the real gate. A
// local multer config is used here rather than the shared jpeg/png/gif-only
// helper so WebP uploads are accepted.
const checkInPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10_000_000 }, // 10 MB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const okExt = allowed.test(path.extname(file.originalname).toLowerCase());
    const okMime = allowed.test(file.mimetype);
    if (okExt && okMime) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, png, gif, webp) are allowed.'));
    }
  },
});
export default checkInPhotoUpload;
