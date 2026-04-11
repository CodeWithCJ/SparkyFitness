// @ts-expect-error TS(7016): Could not find a declaration file for module 'mult... Remove this comment to see the full error message
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  destination: (req: any, file: any, cb: any) => {
    cb(null, uploadDir);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `oidc-logo-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const oidcLogoUpload = createUploadMiddleware(oidcLogoStorage);
export default oidcLogoUpload;
