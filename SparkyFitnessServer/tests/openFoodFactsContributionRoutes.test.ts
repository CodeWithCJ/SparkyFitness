import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
// @ts-expect-error supertest does not provide declarations in this workspace.
import request from 'supertest';
import router from '../routes/v2/openFoodFactsContributionRoutes.js';
import {
  previewOpenFoodFactsContribution,
  confirmOpenFoodFactsContribution,
} from '../services/openFoodFactsManualContributionService.js';

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => ((req, res, next) => next()) as RequestHandler,
}));
vi.mock('../services/openFoodFactsManualContributionService.js', () => ({
  previewOpenFoodFactsContribution: vi.fn(),
  confirmOpenFoodFactsContribution: vi.fn(),
}));
const FOOD_ID = '00000000-0000-4000-8000-000000000001';
const previewPath = `/v2/foods/${FOOD_ID}/openfoodfacts/preview`;
const confirmPath = `/v2/foods/${FOOD_ID}/openfoodfacts/contribute`;
const input = {
  productLanguage: 'de',
  imageType: 'nutrition',
  imageBase64: 'abcd',
};
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.userId = 'owner';
  req.authenticatedUserId = req.header('x-test-actor') || 'owner';
  next();
});
app.use('/v2/foods', router);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewOpenFoodFactsContribution).mockResolvedValue({
    previewToken: 'preview',
    expiresAt: '2026-09-07T10:00:00Z',
    productUrl: 'https://world.openfoodfacts.org/product/4006381333931',
    providerScope: 'personal',
    fields: { code: '4006381333931' },
    imageBase64: 'abcd',
    imageType: 'nutrition',
    existingProduct: false,
  });
  vi.mocked(confirmOpenFoodFactsContribution).mockResolvedValue({
    status: 'success',
    message: 'Saved',
    productUrl: 'https://world.openfoodfacts.org/product/4006381333931',
    providerScope: 'personal',
  });
});

describe('owner-only explicit contribution routes', () => {
  it('provides a typed preview without invoking the publish service', async () => {
    const response = await request(app).post(previewPath).send(input);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      previewToken: 'preview',
      providerScope: 'personal',
    });
    expect(previewOpenFoodFactsContribution).toHaveBeenCalledWith(
      'owner',
      'owner',
      FOOD_ID,
      input
    );
    expect(confirmOpenFoodFactsContribution).not.toHaveBeenCalled();
  });
  it.each([previewPath, confirmPath])(
    'rejects a delegate before either service (%s)',
    async (url) => {
      const response = await request(app)
        .post(url)
        .set('x-test-actor', 'delegate')
        .send({
          ...input,
          previewToken: 'preview',
          confirm: true,
          confirmImageRights: true,
        });
      expect(response.status).toBe(403);
      expect(previewOpenFoodFactsContribution).not.toHaveBeenCalled();
      expect(confirmOpenFoodFactsContribution).not.toHaveBeenCalled();
    }
  );
  it('rejects missing rights consent, client-injected fields and a bulk array', async () => {
    for (const body of [
      input,
      { ...input, previewToken: 'preview', confirm: true },
      {
        ...input,
        previewToken: 'preview',
        confirm: true,
        confirmImageRights: true,
        foodIds: [FOOD_ID],
      },
      [input],
    ]) {
      const response = await request(app).post(confirmPath).send(body);
      expect(response.status).toBe(400);
    }
    expect(confirmOpenFoodFactsContribution).not.toHaveBeenCalled();
  });
  it('publishes only the confirmed per-food request and exposes partial status', async () => {
    vi.mocked(confirmOpenFoodFactsContribution).mockResolvedValue({
      status: 'partial',
      message: 'Photo saved, data unconfirmed',
      productUrl: 'https://world.openfoodfacts.org/product/4006381333931',
      providerScope: 'global',
    });
    const response = await request(app)
      .post(confirmPath)
      .send({
        ...input,
        previewToken: 'preview',
        confirm: true,
        confirmImageRights: true,
      });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('partial');
  });
  it('returns a conflict for a stale preview without leaking an unexpected failure', async () => {
    vi.mocked(confirmOpenFoodFactsContribution).mockRejectedValue(
      Object.assign(new Error('Request a new preview.'), { statusCode: 409 })
    );
    const response = await request(app)
      .post(confirmPath)
      .send({
        ...input,
        previewToken: 'preview',
        confirm: true,
        confirmImageRights: true,
      });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Request a new preview.' });
  });
});
