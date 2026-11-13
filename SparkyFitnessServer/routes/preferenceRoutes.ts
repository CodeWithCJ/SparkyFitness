import express, { type RequestHandler } from 'express';
import {
  FEATURE_PLATFORMS,
  featureChoicesPatchSchema,
  featureStorage,
  isFeatureKey,
  voiceInputPreferencesSchema,
} from '@workspace/shared';
import { authenticate } from '../middleware/authMiddleware.js';
import { createRequireSelfActor } from '../middleware/requireSelfMiddleware.js';
import preferenceService from '../services/preferenceService.js';
import { clearUserTdeeCache } from '../services/AdaptiveTdeeService.js';
import {
  OpenFoodFactsAutomaticSyncRequestSchema,
  OpenFoodFactsAutomaticSyncResponseSchema,
} from '@workspace/shared';
import {
  getOpenFoodFactsSyncSettings,
  updateOpenFoodFactsSyncSettings,
} from '../services/openFoodFactsSyncSettingsService.js';
const router = express.Router();

router.get(
  '/openfoodfacts-contributions',
  authenticate,
  async (req, res, next) => {
    try {
      const settings = await getOpenFoodFactsSyncSettings(
        req.authenticatedUserId
      );
      res
        .status(200)
        .json(OpenFoodFactsAutomaticSyncResponseSchema.parse(settings));
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/openfoodfacts-contributions',
  authenticate,
  async (req, res, next) => {
    const parsed = OpenFoodFactsAutomaticSyncRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid Open Food Facts automatic contribution settings.',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const settings = await updateOpenFoodFactsSyncSettings(
        req.authenticatedUserId,
        parsed.data
      );
      res
        .status(200)
        .json(OpenFoodFactsAutomaticSyncResponseSchema.parse(settings));
    } catch (error) {
      next(error);
    }
  }
);

const validateVoicePreferences: RequestHandler = (req, res, next) => {
  const parsed = voiceInputPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid voice input preferences.' });
    return;
  }
  next();
};

// Like actionTagRoutes and plateInventoryRoutes: someone acting for the owner
// gets a message about this, not the account-linking default.
const requireOwnFeatures = createRequireSelfActor({
  action: 'a feature switch change',
  message:
    'Forbidden: features can only be turned on or off on your own account.',
});

/**
 * @swagger
 * /user-preferences/features:
 *   get:
 *     summary: Read the optional feature choices
 *     description: >-
 *       The features the person turned on or off, one map per platform (web,
 *       mobile); a feature not listed is at its default. Someone acting for
 *       the person can read them. Cycle tracking is not here: it has its own
 *       setting (GET /v2/cycle/settings).
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The stored choices.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeatureChoicesResponse'
 *       403:
 *         description: Acting for someone whose grant does not cover their settings.
 *   patch:
 *     summary: Turn optional features on or off
 *     description: >-
 *       Merges the given choices into one platform's map, or both. true or
 *       false sets a feature, null resets it to its default, and features or
 *       platforms not sent keep their value. Owner only. Cycle tracking has its
 *       own setting (PUT /v2/cycle/settings) and is refused here.
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               web:
 *                 $ref: '#/components/schemas/FeatureChoicesPlatformPatch'
 *               mobile:
 *                 $ref: '#/components/schemas/FeatureChoicesPlatformPatch'
 *     responses:
 *       200:
 *         description: The stored choices after the change.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeatureChoicesResponse'
 *       400:
 *         description: Invalid body, a feature with its own setting, or more than 64 stored choices on a platform.
 *       403:
 *         description: Acting on someone else's behalf.
 */
router.get('/features', authenticate, async (req, res, next) => {
  try {
    const choices = await preferenceService.getFeatureChoices(
      req.authenticatedUserId ?? req.userId,
      req.userId
    );
    if (!choices) {
      return res.status(403).json({
        error: "Forbidden: your access doesn't include this person's settings.",
      });
    }
    res.status(200).json({ feature_choices: choices });
  } catch (error) {
    // Never defaults: an app shown "no choices" would bring back the features
    // the person turned off.
    next(error);
  }
});

router.patch(
  '/features',
  authenticate,
  requireOwnFeatures,
  async (req, res, next) => {
    const parsed = featureChoicesPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid feature choices.' });
    }
    const ownSetting = FEATURE_PLATFORMS.flatMap((platform) =>
      Object.keys(parsed.data[platform] ?? {}).filter(
        (key) => isFeatureKey(key) && featureStorage(key) !== 'choices'
      )
    );
    if (ownSetting.length > 0) {
      return res.status(400).json({
        error: 'These features have their own setting.',
        keys: [...new Set(ownSetting)],
      });
    }
    try {
      const result = await preferenceService.updateFeatureChoices(
        req.userId,
        parsed.data
      );
      if (result.status === 'tooMany') {
        return res.status(400).json({ error: 'Too many feature choices.' });
      }
      if (result.status === 'noRow') {
        // Every account gets a row when its profile is created; only a DELETE
        // of /user-preferences removes it. Not a 404, so apps can read any 404
        // here as "this server predates the route".
        throw new Error('User preferences row missing.');
      }
      res.status(200).json({ feature_choices: result.choices });
    } catch (error) {
      next(error);
    }
  }
);

// Endpoint to bootstrap timezone from the device only if unset
router.post('/bootstrap-timezone', authenticate, async (req, res, next) => {
  const { timezone } = req.body;
  try {
    const preferences = await preferenceService.bootstrapUserTimezone(
      req.userId,

      req.userId,
      timezone
    );
    res.status(200).json(preferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.status === 400) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(400).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    if (
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error.message ===
      'User preferences not found or not authorized to update.'
    ) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to update user preferences
/**
 * @swagger
 * /user-preferences:
 *   put:
 *     summary: Update user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserPreferences'
 *     responses:
 *       200:
 *         description: Preferences updated successfully.
 */
router.put(
  '/',
  authenticate,
  validateVoicePreferences,
  async (req, res, next) => {
    const preferenceData = req.body;
    try {
      const updatedPreferences = await preferenceService.updateUserPreferences(
        req.userId,

        req.userId,
        preferenceData
      );
      clearUserTdeeCache(req.userId);
      res.status(200).json(updatedPreferences);
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.status === 400) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(400).json({ error: error.message });
      }
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      if (
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        error.message ===
        'User preferences not found or not authorized to update.'
      ) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
);
// Endpoint to delete user preferences
/**
 * @swagger
 * /user-preferences:
 *   delete:
 *     summary: Delete user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Preferences deleted successfully.
 */
router.delete('/', authenticate, async (req, res, next) => {
  try {
    const result = await preferenceService.deleteUserPreferences(
      req.userId,

      req.userId
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message === 'User preferences not found.') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to fetch user preferences
/**
 * @swagger
 * /user-preferences:
 *   get:
 *     summary: Get user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User preferences.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserPreferences'
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const preferences = await preferenceService.getUserPreferences(
      req.authenticatedUserId ?? req.userId,
      req.userId
    );
    res.status(200).json(preferences);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('Forbidden')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(403).json({ error: error.message });
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message === 'User preferences not found.') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});
// Endpoint to upsert user preferences
/**
 * @swagger
 * /user-preferences:
 *   post:
 *     summary: Upsert user preferences
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserPreferences'
 *     responses:
 *       200:
 *         description: Preferences upserted successfully.
 */
router.post(
  '/',
  authenticate,
  validateVoicePreferences,
  async (req, res, next) => {
    const preferenceData = req.body;
    try {
      const newPreferences = await preferenceService.upsertUserPreferences(
        req.userId,
        preferenceData
      );
      clearUserTdeeCache(req.userId);
      res.status(200).json(newPreferences);
    } catch (error) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.status === 400) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(400).json({ error: error.message });
      }
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      if (error.message.startsWith('Forbidden')) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        return res.status(403).json({ error: error.message });
      }
      next(error);
    }
  }
);
export default router;
