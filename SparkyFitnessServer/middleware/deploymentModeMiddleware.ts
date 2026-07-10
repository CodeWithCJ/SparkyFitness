import type { RequestHandler } from 'express';
import {
  areServerBackupsEnabled,
  getStorageMode,
} from '../utils/runtimeConfig.js';

const uploadsUnavailableBody = {
  error: 'File uploads are disabled in this deployment.',
  code: 'UPLOADS_DISABLED',
};

const serverBackupsUnavailableBody = {
  error:
    'Server-managed backups are disabled in this deployment. Use managed database provider backups instead.',
  code: 'SERVER_BACKUPS_DISABLED',
};

const requireUploadsEnabled: RequestHandler = (_req, res, next) => {
  if (getStorageMode() === 'disabled') {
    res.status(501).json(uploadsUnavailableBody);
    return;
  }
  next();
};

const requireMultipartUploadsEnabled: RequestHandler = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    requireUploadsEnabled(req, res, next);
    return;
  }
  next();
};

const requireServerBackupsEnabled: RequestHandler = (_req, res, next) => {
  if (!areServerBackupsEnabled()) {
    res.status(501).json(serverBackupsUnavailableBody);
    return;
  }
  next();
};

export {
  requireMultipartUploadsEnabled,
  requireServerBackupsEnabled,
  requireUploadsEnabled,
  serverBackupsUnavailableBody,
  uploadsUnavailableBody,
};
