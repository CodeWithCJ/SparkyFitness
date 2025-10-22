const multer = require('multer');
const path = require('path');

/**
 * Creates a multer upload middleware with a given storage configuration.
 * @param {object} storage - A multer storage engine configuration.
 * @returns {object} - A multer instance.
 */
const createUploadMiddleware = (storage) => {
  const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 }, // Limit file size to 10MB
    fileFilter: (req, file, cb) => {
      const filetypes = /jpeg|jpg|png|gif/;
      const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = filetypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files (jpeg, jpg, png, gif) are allowed.'));
      }
    }
  });

  return upload;
};

module.exports = { createUploadMiddleware };