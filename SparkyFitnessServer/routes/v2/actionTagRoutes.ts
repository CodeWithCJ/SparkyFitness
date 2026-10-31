import express from 'express';
import {
  createActionTagBodySchema,
  scanActionTagBodySchema,
  updateActionTagBodySchema,
} from '@workspace/shared';
import { authenticate } from '../../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../../middleware/onBehalfOfMiddleware.js';
import { createRequireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import {
  ActionTagLimitError,
  createActionTag,
  deleteActionTag,
  listActionTags,
  updateActionTag,
} from '../../models/actionTagRepository.js';
import { scanActionTag } from '../../services/actionTagService.js';

const router = express.Router();

router.use(authenticate);
router.use(onBehalfOfMiddleware);
// A tag can log diary, check-in or medication data, so only the owner defines
// or runs one; a delegate gets a message about that, not the account-linking one.
router.use(
  createRequireSelfActor({
    action: 'an NFC tag request',
    message: 'Forbidden: NFC tags are only available for your own account.',
  })
);

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * @swagger
 * /v2/action-tags:
 *   get:
 *     summary: List the person's NFC tags
 *     tags: [Settings]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The saved tags, newest first
 *       403:
 *         description: Not the owner of these tags
 *       500:
 *         description: Internal server error
 */
router.get('/', async (req, res, next) => {
  try {
    const tags = await listActionTags(
      req.userId,
      req.authenticatedUserId || req.userId
    );
    res.json(tags);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/action-tags/scan:
 *   post:
 *     summary: Run the action saved for a scanned tag
 *     description: >
 *       Answers 200 with a `status`: done, needs_confirmation, unknown_tag,
 *       target_missing or too_soon. An unknown code logs nothing.
 *     tags: [Settings]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tag_code, entry_date]
 *             properties:
 *               tag_code: {type: string, description: 32 lowercase hex characters}
 *               entry_date: {type: string, format: date}
 *               confirmed: {type: boolean}
 *     responses:
 *       200:
 *         description: The outcome of the scan
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Not the owner of these tags
 *       500:
 *         description: Internal server error
 */
router.post('/scan', async (req, res, next) => {
  try {
    const parsed = scanActionTagBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const result = await scanActionTag(
      req.userId,
      req.authenticatedUserId || req.userId,
      parsed.data
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/action-tags:
 *   post:
 *     summary: Save an NFC tag and what a tap on it does
 *     tags: [Settings]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tag_code, label, action]
 *             properties:
 *               tag_code: {type: string, description: 32 lowercase hex characters}
 *               label: {type: string, minLength: 1, maxLength: 120}
 *               action:
 *                 type: object
 *                 description: Discriminated on `type`; `water` takes container_id and drinks
 *               ask_before_running: {type: boolean}
 *     responses:
 *       201:
 *         description: The saved tag
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Not the owner of these tags
 *       409:
 *         description: The tag code is already saved, or the tag limit is reached
 *       500:
 *         description: Internal server error
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = createActionTagBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const created = await createActionTag(
      req.userId,
      parsed.data,
      req.authenticatedUserId || req.userId
    );
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof ActionTagLimitError) {
      return res.status(409).json({ error: error.message });
    }
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: 'This tag is already saved' });
    }
    next(error);
  }
});

/**
 * @swagger
 * /v2/action-tags/{id}:
 *   patch:
 *     summary: Rename a tag or change what it does
 *     tags: [Settings]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: {type: string, minLength: 1, maxLength: 120}
 *               action: {type: object}
 *               ask_before_running: {type: boolean}
 *     responses:
 *       200:
 *         description: The updated tag
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Not the owner of these tags
 *       404:
 *         description: Tag not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateActionTagBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.format(),
      });
    }
    const updated = await updateActionTag(
      req.userId,
      req.params.id,
      parsed.data,
      req.authenticatedUserId || req.userId
    );
    if (!updated) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /v2/action-tags/{id}:
 *   delete:
 *     summary: Remove a tag
 *     description: The sticker keeps its link, but a tap on it then reads as an unknown tag.
 *     tags: [Settings]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       403:
 *         description: Not the owner of these tags
 *       404:
 *         description: Tag not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteActionTag(
      req.userId,
      req.params.id,
      req.authenticatedUserId || req.userId
    );
    if (!deleted) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    res.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
