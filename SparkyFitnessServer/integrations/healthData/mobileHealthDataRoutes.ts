import express from 'express';
import { log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
const router = express.Router();
// Endpoint for receiving mobile health data
router.post('/mobile_data', async (req, res, next) => {
  let mobileHealthDataArray = [];
  if (Array.isArray(req.body)) {
    mobileHealthDataArray = req.body;
  } else if (typeof req.body === 'object' && req.body !== null) {
    mobileHealthDataArray.push(req.body);
  } else {
    log(
      'error',
      'Received unexpected body format for mobile health data:',
      req.body
    );
    return res.status(400).json({
      error: 'Invalid request body format. Expected JSON object or array.',
    });
  }
  log(
    'info',
    'Incoming mobile health data JSON:',
    JSON.stringify(mobileHealthDataArray, null, 2)
  );
  try {
    const result = await measurementService.processMobileHealthData(
      mobileHealthDataArray,

      req.userId,

      req.userId
    );
    res.status(200).json(result);
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.message.startsWith('{') && error.message.endsWith('}')) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const parsedError = JSON.parse(error.message);
      return res.status(400).json(parsedError);
    }
    next(error);
  }
});
export default router;
