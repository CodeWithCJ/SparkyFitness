import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import onboardingService from '../services/onboardingService.js';
const router = express.Router();
router.use(express.json());
/**
 * @route   POST /api/onboarding
 * @desc    Submit user onboarding data
 * @access  Private
 */
/**
 * @swagger
 * /onboarding:
 *   post:
 *     summary: Submit user onboarding data
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sex: { type: 'string' }
 *               primaryGoal: { type: 'string' }
 *               currentWeight: { type: 'number' }
 *               height: { type: 'number' }
 *               birthDate: { type: 'string', format: 'date' }
 *               activityLevel: { type: 'string' }
 *               targetWeight: { type: 'number' }
 *             required: [sex, primaryGoal, currentWeight, height, birthDate, activityLevel, targetWeight]
 *     responses:
 *       201:
 *         description: Onboarding completed successfully.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const onboardingData = req.body;
    const {
      sex,
      primaryGoal,
      currentWeight,
      height,
      birthDate,
      activityLevel,
      targetWeight,
    } = onboardingData;
    if (
      !sex ||
      !primaryGoal ||
      !currentWeight ||
      !height ||
      !birthDate ||
      !activityLevel ||
      !targetWeight
    ) {
      return res.status(400).json({
        error: 'Missing one or more required onboarding fields.',
        details:
          'Ensure sex, primaryGoal, currentWeight, height, birthDate, activityLevel, and targetWeight are provided.',
      });
    }
    await onboardingService.processOnboardingData(userId, onboardingData);
    res.status(201).json({ message: 'Onboarding completed successfully.' });
  } catch (error) {
    next(error);
  }
});
const targetWeightBodySchema = z.object({
  // Kilograms, matching the NUMERIC(5,2) column: rounded to two decimals as
  // the column would, and refused if that leaves nothing. Null clears the goal.
  targetWeight: z
    .number()
    .max(999.99)
    .nullable()
    .transform((kg) => (kg === null ? null : Math.round(kg * 100) / 100))
    .refine((kg) => kg === null || kg > 0),
});
/**
 * @swagger
 * /onboarding/target-weight:
 *   put:
 *     summary: Set or clear the user's target weight (kg)
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetWeight: { type: number, nullable: true }
 *             required: [targetWeight]
 *     responses:
 *       200:
 *         description: Target weight saved.
 *       400:
 *         description: Invalid target weight.
 */
router.put('/target-weight', authenticate, async (req, res, next) => {
  try {
    const parsed = targetWeightBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error:
          'targetWeight must be a number above 0 and at most 999.99 kg, or null.',
      });
    }
    await onboardingService.setTargetWeight(
      req.userId,
      parsed.data.targetWeight
    );
    res.status(200).json({ targetWeight: parsed.data.targetWeight });
  } catch (error) {
    next(error);
  }
});
/**
 * @route   GET /api/onboarding/status
 * @desc    Check if the current user has completed onboarding
 * @access  Private
 */
/**
 * @swagger
 * /onboarding/status:
 *   get:
 *     summary: Check if the current user has completed onboarding
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OnboardingStatus'
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const status = await onboardingService.checkOnboardingStatus(userId);
    res.status(200).json({
      onboardingComplete: status.onboarding_complete,
      onboardingSkipped: status.onboarding_skipped,
    });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /onboarding/skip:
 *   post:
 *     summary: Mark onboarding as skipped for the user
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding skipped successfully.
 */
router.post('/skip', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    await onboardingService.skipOnboarding(userId);
    res.status(200).json({ message: 'Onboarding skipped successfully.' });
  } catch (error) {
    next(error);
  }
});
/**
 * @swagger
 * /onboarding/reset:
 *   post:
 *     summary: Reset onboarding status for the user
 *     tags: [Goals & Personalization]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding status reset successfully.
 */
router.post('/reset', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    await onboardingService.resetOnboardingStatus(userId);
    res.status(200).json({ message: 'Onboarding status reset successfully.' });
  } catch (error) {
    console.error('Error resetting onboarding status:', error);
    res.status(500).json({ error: 'Failed to reset onboarding status.' });
  }
});
export default router;
