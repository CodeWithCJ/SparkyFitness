import express, { type RequestHandler } from 'express';
import {
  barcodeValueSchema,
  barcodeAlternativesResponseSchema,
} from '@workspace/shared';
import { getBarcodeAlternatives } from '../../services/barcodeLookupService.js';
import { enrichWithCustomNutrients } from '../../services/foodProviderDetailService.js';

const router = express.Router();
const alternatives: RequestHandler<{ barcode: string }> = async (
  req,
  res,
  next
) => {
  const barcode = barcodeValueSchema.safeParse(req.params.barcode);
  if (!barcode.success) {
    res
      .status(400)
      .json({ error: 'Invalid barcode format. Must be 8-14 digits.' });
    return;
  }
  try {
    const result = await getBarcodeAlternatives(
      barcode.data,
      req.userId,
      req.authenticatedUserId ?? req.userId
    );
    const foods = result.results.flatMap((candidate) =>
      candidate.food ? [candidate.food] : []
    );
    if (foods.length) await enrichWithCustomNutrients(req.userId, foods);
    res.json(barcodeAlternativesResponseSchema.parse(result));
  } catch (error) {
    next(error);
  }
};
/**
 * @openapi
 * /v2/foods/barcode/{barcode}/alternatives:
 *   get:
 *     summary: Compare barcode matches without importing or changing foods.
 *     tags: [Foods]
 *     responses:
 *       '200':
 *         description: Local and accessible provider results with independent source states.
 *       '400':
 *         description: Invalid barcode format.
 */
router.get('/barcode/:barcode/alternatives', alternatives);
export default router;
