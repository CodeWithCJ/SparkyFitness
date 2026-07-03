// @ts-expect-error TS(7016): Could not find a declaration file for module 'mult... Remove this comment to see the full error message
import multer from 'multer';
import path from 'path';
/**
 * Creates a multer upload middleware with a given storage configuration.
 * @param {object} storage - A multer storage engine configuration.
 * @returns {object} - A multer instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createUploadMiddleware = (storage: any) => {
  const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // Limit file size to 10MB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fileFilter: (req: any, file: any, cb: any) => {
      const filetypes = /jpeg|jpg|png|gif/;
      const extname = filetypes.test(
        path.extname(file.originalname).toLowerCase()
      );
      const mimetype = filetypes.test(file.mimetype);
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed.'));
      }
    },
  });
  return upload;
};
export { createUploadMiddleware };
export default {
  createUploadMiddleware,
};
