import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';
import checkInPhotoUpload, {
  isAllowedImageBuffer,
} from '../middleware/checkInPhotoUpload.js';
import checkInPhotoService from '../services/checkInPhotoService.js';
import { log } from '../config/logging.js';
import {
  CheckInPhotoDateParamSchema,
  CheckInPhotoUploadParamSchema,
  CheckInPhotoIdParamSchema,
} from '../schemas/checkInPhotoSchemas.js';

const router = express.Router();

/**
 * @swagger
 * /measurements/check-in-photos/{date}:
 *   get:
 *     summary: Get progress photos for a check-in date
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Array of photo records for the given date.
 *       400:
 *         description: Invalid date format.
 */
router.get(
  '/:date',
  authenticate,
  checkPermissionMiddleware('checkin'),
  async (req, res) => {
    const parsed = CheckInPhotoDateParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }
    try {
      const photos = await checkInPhotoService.getPhotosByDate(
        req.userId,
        parsed.data.date
      );
      res.json(photos);
    } catch (err) {
      log('error', 'Failed to fetch check-in photos', err);
      res.status(500).json({ error: 'Failed to fetch check-in photos' });
    }
  }
);

/**
 * @swagger
 * /measurements/check-in-photos/file/{id}:
 *   get:
 *     summary: Serve a progress photo image (authenticated, owner/family only)
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The image file.
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Photo not found or not accessible.
 */
router.get(
  '/file/:id',
  authenticate,
  checkPermissionMiddleware('checkin'),
  async (req, res) => {
    const parsed = CheckInPhotoIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }
    try {
      const absolutePath = await checkInPhotoService.getPhotoFileById(
        req.userId,
        parsed.data.id
      );
      if (!absolutePath) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }
      // Stored uploads are user-supplied; stop the browser from MIME-sniffing
      // the response into an executable type.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(absolutePath);
    } catch (err) {
      log('error', 'Failed to serve check-in photo', err);
      res.status(500).json({ error: 'Failed to serve check-in photo' });
    }
  }
);

/**
 * @swagger
 * /measurements/check-in-photos/{date}/{type}:
 *   post:
 *     summary: Upload a progress photo (front, back, or side)
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [front, back, side]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo uploaded successfully.
 *       400:
 *         description: Invalid parameters or file type.
 */
router.post(
  '/:date/:type',
  authenticate,
  checkPermissionMiddleware('checkin'),
  (req, res, next) => {
    const parsed = CheckInPhotoUploadParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }
    next();
  },
  checkInPhotoUpload.single('photo'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (req: any, res: any) => {
    if (!req.file) {
      res.status(400).json({ error: 'No photo file provided' });
      return;
    }
    const { date, type } = req.params as {
      date: string;
      type: 'front' | 'back' | 'side';
    };
    // The multer fileFilter only trusts the client-supplied filename/mime type;
    // verify the real bytes before anything is written to disk.
    if (!isAllowedImageBuffer(req.file.buffer)) {
      res
        .status(400)
        .json({ error: 'Uploaded file is not a valid image (jpeg, png, gif)' });
      return;
    }
    try {
      const photo = await checkInPhotoService.upsertPhoto(
        req.userId,
        date,
        type,
        req.file.originalname,
        req.file.buffer
      );
      res.json(photo);
    } catch (err) {
      log('error', 'Failed to save check-in photo', err);
      res.status(500).json({ error: 'Failed to save check-in photo' });
    }
  }
);

/**
 * @swagger
 * /measurements/check-in-photos/photo/{id}:
 *   delete:
 *     summary: Delete a progress photo by ID
 *     tags: [Wellness & Metrics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Photo deleted.
 *       400:
 *         description: Invalid ID.
 */
router.delete(
  '/photo/:id',
  authenticate,
  checkPermissionMiddleware('checkin'),
  async (req, res) => {
    const parsed = CheckInPhotoIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }
    try {
      await checkInPhotoService.deletePhoto(req.userId, parsed.data.id);
      res.status(204).send();
    } catch (err) {
      log('error', 'Failed to delete check-in photo', err);
      res.status(500).json({ error: 'Failed to delete check-in photo' });
    }
  }
);

export default router;
