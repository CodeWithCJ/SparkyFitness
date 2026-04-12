import express from 'express';
import versionService from '../services/versionService.js';
const router = express.Router();
/**
 * @swagger
 * /version/current:
 *   get:
 *     summary: Get current app version
 *     tags: [System & Admin]
 *     responses:
 *       200:
 *         description: App version.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version: { type: 'string' }
 */
router.get('/current', (req, res) => {
  const appVersion = versionService.getAppVersion();
  res.json({ version: appVersion });
});
/**
 * @swagger
 * /version/latest-github:
 *   get:
 *     summary: Get latest GitHub release
 *     tags: [System & Admin]
 *     responses:
 *       200:
 *         description: Latest release.
 */
router.get('/latest-github', async (req, res) => {
  try {
    const latestRelease = await versionService.getLatestGitHubRelease();
    res.json(latestRelease);
  } catch (error) {
    console.error('Error fetching latest GitHub release:', error);
    res.status(500).json({
      error: 'Failed to fetch latest GitHub release',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      details: error.message,
    });
  }
});
export default router;
