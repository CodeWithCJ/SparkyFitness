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
            // @ts-expect-error TS(2345): Argument of type '"withings"' is not assignable to... Remove this comment to see the full error message
            'withings'
          );
        if (category.name.includes('Blood Pressure')) {
          // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
          withingsData.bloodPressure.push(...entries);
        } else if (category.name.includes('Heart Rate')) {
          // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
          withingsData.heartRate.push(...entries);
        } else if (category.name.includes('Sleep')) {
          // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2339): Property 'user' does not exist on type 'Request<{}... Remove this comment to see the full error message
      `Error retrieving Withings data for user ${req.user.id}: ${error.message}`
    );
    res.status(500).json({
      message: 'Error retrieving Withings data',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      error: error.message,
    });
  }
});
export default router;
