import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import dashboardLayoutService from '../services/dashboardLayoutService.js';

const router = express.Router();

// A dashboard layout is a personal UI arrangement. Reads follow the active
// (possibly switched) profile so a delegated viewer sees the owner's layout,
// but writes are only allowed when acting as yourself -- a family member
// viewing your diary must not be able to rearrange your personal layout.
function requireSelf(req: express.Request, res: express.Response): boolean {
  if (req.userId !== req.authenticatedUserId) {
    res.status(403).json({
      error: 'Cannot modify another user’s dashboard layout.',
    });
    return false;
  }
  return true;
}

/**
 * @swagger
 * tags:
 *   name: Dashboard Layouts
 *   description: Per-user customizable widget layouts for dashboard pages.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardLayout:
 *       type: object
 *       properties:
 *         layout:
 *           type: object
 *           description: Responsive grid layout keyed by breakpoint (lg/md/sm/xs).
 *         hidden:
 *           type: array
 *           items:
 *             type: string
 *           description: Widget keys the user has hidden.
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /dashboard-layouts/{pageKey}:
 *   get:
 *     summary: Get the saved widget layout for a dashboard page
 *     tags: [Dashboard Layouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: pageKey
 *         required: true
 *         schema:
 *           type: string
 *         description: The dashboard page identifier (e.g. "diary").
 *     responses:
 *       200:
 *         description: The saved layout, or null when none is stored (use defaults).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardLayout'
 *       400:
 *         description: Unknown page key.
 *       401:
 *         description: Unauthorized.
 */
router.get('/:pageKey', authenticate, async (req, res, next) => {
  try {
    const layout = await dashboardLayoutService.getDashboardLayout(
      req.userId,
      req.params.pageKey
    );
    res.json(layout);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /dashboard-layouts/{pageKey}:
 *   put:
 *     summary: Create or update the widget layout for a dashboard page
 *     tags: [Dashboard Layouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: pageKey
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - layout
 *               - hidden
 *             properties:
 *               layout:
 *                 type: object
 *               hidden:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: The saved layout.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardLayout'
 *       400:
 *         description: Invalid payload or unknown page key.
 *       401:
 *         description: Unauthorized.
 */
router.put('/:pageKey', authenticate, async (req, res, next) => {
  try {
    if (!requireSelf(req, res)) return;
    const { layout, hidden } = req.body;
    const saved = await dashboardLayoutService.saveDashboardLayout(
      req.userId,
      req.params.pageKey,
      { layout, hidden }
    );
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /dashboard-layouts/{pageKey}:
 *   delete:
 *     summary: Reset a dashboard page layout to defaults (deletes the stored row)
 *     tags: [Dashboard Layouts]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: pageKey
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Layout reset; the client should fall back to defaults.
 *       400:
 *         description: Unknown page key.
 *       401:
 *         description: Unauthorized.
 */
router.delete('/:pageKey', authenticate, async (req, res, next) => {
  try {
    if (!requireSelf(req, res)) return;
    await dashboardLayoutService.resetDashboardLayout(
      req.userId,
      req.params.pageKey
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
