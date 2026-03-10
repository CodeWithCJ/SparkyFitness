const express = require('express');
const router = express.Router();
const versionService = require('../services/versionService');

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
 *         description: Latest release info from GitHub.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                   description: The latest release tag name.
 *                   example: v1.2.3
 *                 releaseNotes:
 *                   type: string
 *                   description: The release body/notes in markdown.
 *                 publishedAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the release was published.
 *                 htmlUrl:
 *                   type: string
 *                   description: URL to the GitHub release page.
 *                 isNewVersionAvailable:
 *                   type: boolean
 *                   description: Whether the latest release is newer than the current version.
 *       500:
 *         description: Failed to fetch latest GitHub release.
 */
router.get('/latest-github', async (req, res) => {
    try {
        const latestRelease = await versionService.getLatestGitHubRelease();
        res.json(latestRelease);
    } catch (error) {
        console.error('Error fetching latest GitHub release:', error);
        res.status(500).json({ error: 'Failed to fetch latest GitHub release', details: error.message });
    }
});

module.exports = router;