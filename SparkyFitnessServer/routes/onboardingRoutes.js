const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const onboardingService = require("../services/onboardingService");

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
router.post("/", authenticate, async (req, res, next) => {
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
        error: "Missing one or more required onboarding fields.",
        details:
          "Ensure sex, primaryGoal, currentWeight, height, birthDate, activityLevel, and targetWeight are provided.",
      });
    }

    await onboardingService.processOnboardingData(userId, onboardingData);

    res.status(201).json({ message: "Onboarding completed successfully." });
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
router.get("/status", authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    const isComplete = await onboardingService.checkOnboardingStatus(userId);

    res.status(200).json({ onboardingComplete: isComplete });
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
router.post("/reset", authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    await onboardingService.resetOnboardingStatus(userId);
    res.status(200).json({ message: "Onboarding status reset successfully." });
  } catch (error) {
    console.error("Error resetting onboarding status:", error);
    res.status(500).json({ error: "Failed to reset onboarding status." });
  }
});

module.exports = router;
