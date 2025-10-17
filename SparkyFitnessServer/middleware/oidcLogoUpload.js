const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createUploadMiddleware } = require('./uploadMiddleware');

// Ensure the upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'oidc');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Create a storage configuration for OIDC logos
const oidcLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `oidc-logo-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const oidcLogoUpload = createUploadMiddleware(oidcLogoStorage);

module.exports = oidcLogoUpload;