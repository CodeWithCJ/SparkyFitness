import express from 'express';
import announcementService from '../services/announcementService.js';

const router = express.Router();

/**
 * @swagger
 * /announcement/current:
 *   get:
 *     summary: Get current active announcement from GitHub
 *     tags: [System & Admin]
 *     responses:
 *       200:
 *         description: Announcement payload.
 */
router.get('/current', async (req, res) => {
  try {
    const bypassCache = req.query.bypassCache === 'true';
    const announcement =
      await announcementService.getLatestAnnouncement(bypassCache);
    res.json(announcement);
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({
      error: 'Failed to fetch announcement',
      details: (error as Error).message,
    });
  }
});

export default router;
