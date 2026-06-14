// @ts-expect-error TS(7016): Could not find a declaration file for module 'multer'
import multer from 'multer';
import { createUploadMiddleware } from './uploadMiddleware.js';

// Leading-byte signatures for the image formats accepted by uploads. The multer
// fileFilter only inspects the client-supplied filename and mime type, both of
// which are spoofable, so we re-check the real file content against these.
const IMAGE_SIGNATURES: number[][] = [
  [0xff, 0xd8, 0xff], // jpeg / jpg
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // png
  [0x47, 0x49, 0x46, 0x38], // gif ("GIF8" -> 87a / 89a)
];

/**
 * Returns true only if the buffer starts with a known JPEG, PNG, or GIF
 * signature. Reads a handful of leading bytes, so the cost is negligible
 * relative to the upload itself.
 */
export const isAllowedImageBuffer = (buffer: Buffer): boolean =>
  IMAGE_SIGNATURES.some(
    (sig) => buffer.length >= sig.length && sig.every((b, i) => buffer[i] === b)
  );

// Buffer the upload in memory so its real content can be validated before the
// service writes anything to disk. This keeps a rejected (non-image) upload
// from ever touching the uploads directory.
const checkInPhotoUpload = createUploadMiddleware(multer.memoryStorage());
export default checkInPhotoUpload;
