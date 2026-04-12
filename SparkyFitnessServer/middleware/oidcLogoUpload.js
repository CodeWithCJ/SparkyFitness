import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createUploadMiddleware } from './uploadMiddleware.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `oidc-logo-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const oidcLogoUpload = createUploadMiddleware(oidcLogoStorage);
export default oidcLogoUpload;
