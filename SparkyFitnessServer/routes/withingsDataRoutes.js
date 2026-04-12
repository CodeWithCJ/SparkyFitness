import express from 'express';
import { log } from '../config/logging.js';
import { authenticate } from '../middleware/authMiddleware.js';
import measurementRepository from '../models/measurementRepository.js';
const router = express.Router();
/**
 * @swagger
 * /integrations/withings/data:
 *   get:
 *     summary: Get aggregated Withings data for display
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Aggregated Withings data.
 */
router.get('/withings/data', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query; // Expecting YYYY-MM-DD format
    if (!startDate || !endDate) {
      return res.status(400).json({
        message: 'startDate and endDate are required query parameters.',
      });
    }
    // Fetch weight from check_in_measurements
    const weightData =
      await measurementRepository.getCheckInMeasurementsByDateRange(
        userId,
        startDate,
        endDate
      );
    const latestWeight = weightData.length > 0 ? weightData[0].weight : null;
    // Fetch custom measurements related to Withings (blood pressure, heart rate, sleep)
    const customCategories =
      await measurementRepository.getCustomCategories(userId);
    const withingsData = {
      weight: latestWeight,
      bloodPressure: [],
      heartRate: [],
      sleep: [],
      // Add other metrics as needed
    };
    for (const category of customCategories) {
      // Filter for categories that might come from Withings
      // This is a simplified check; a more robust solution might involve tagging categories by source
      if (
        category.name.includes('Blood Pressure') ||
        category.name.includes('Heart Rate') ||
        category.name.includes('Sleep')
      ) {
        const entries =
          await measurementRepository.getCustomMeasurementsByDateRange(
            userId,
            category.id,
            startDate,
            endDate,
            'withings'
          );
        if (category.name.includes('Blood Pressure')) {
          withingsData.bloodPressure.push(...entries);
        } else if (category.name.includes('Heart Rate')) {
          withingsData.heartRate.push(...entries);
        } else if (category.name.includes('Sleep')) {
          withingsData.sleep.push(...entries);
        }
      }
    }
    res.status(200).json({
      message: 'Withings data retrieved successfully',
      data: withingsData,
    });
  } catch (error) {
    log(
      'error',
      `Error retrieving Withings data for user ${req.user.id}: ${error.message}`
    );
    res.status(500).json({
      message: 'Error retrieving Withings data',
      error: error.message,
    });
  }
});
export default router;
