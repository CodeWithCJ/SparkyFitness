import express from 'express';
// @ts-expect-error No declaration file is shipped for supertest.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
const state = vi.hoisted(() => ({
  actor: 'owner',
  preview: vi.fn(),
  browse: vi.fn(),
  listMappings: vi.fn(),
  forgetMapping: vi.fn(),
  save: vi.fn(),
  suggest: vi.fn(),
  getSource: vi.fn(),
  previewNutritionSync: vi.fn(),
  syncNutrition: vi.fn(),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'owner';
    req.authenticatedUserId = state.actor;
    next();
  },
}));
vi.mock('../services/recipeImportService.js', () => ({ default: state }));
import router from '../routes/v2/recipeImportRoutes.js';
import { RecipeImportError } from '../services/recipeImportMath.js';
const app = express();
app.use(express.json());
app.use('/api/v2/recipe-imports', router);
beforeEach(() => {
  vi.clearAllMocks();
  state.actor = 'owner';
  state.preview.mockResolvedValue({ ingredients: [] });
});
describe('recipe import route boundary', () => {
  it('lists the current owner saved choices with bounded pagination', async () => {
    state.listMappings.mockResolvedValue({
      items: [],
      pagination: { page: 2, pageSize: 25, totalCount: 0, hasMore: false },
    });
    const response = await request(app).get(
      '/api/v2/recipe-imports/mealie/00000000-0000-4000-a000-000000000001/mappings?page=2'
    );
    expect(response.status).toBe(200);
    expect(state.listMappings).toHaveBeenCalledWith(
      'owner',
      'owner',
      '00000000-0000-4000-a000-000000000001',
      2
    );
  });
  it('forgets an exact saved choice without invoking meal save or source nutrition sync', async () => {
    state.forgetMapping.mockResolvedValue({ deleted: true });
    const response = await request(app).delete(
      '/api/v2/recipe-imports/mealie/00000000-0000-4000-a000-000000000001/mappings/00000000-0000-4000-a000-000000000002'
    );
    expect(response.status).toBe(200);
    expect(state.forgetMapping).toHaveBeenCalledWith(
      'owner',
      'owner',
      '00000000-0000-4000-a000-000000000001',
      '00000000-0000-4000-a000-000000000002'
    );
    expect(state.save).not.toHaveBeenCalled();
    expect(state.syncNutrition).not.toHaveBeenCalled();
  });
  it('rejects delegates for read and write surfaces', async () => {
    state.actor = 'delegate';
    for (const [method, url] of [
      ['get', '/00000000-0000-4000-a000-000000000001/source'],
      ['get', '/00000000-0000-4000-a000-000000000001/sync-preview'],
      ['get', '/mealie/00000000-0000-4000-a000-000000000001/mappings'],
      [
        'delete',
        '/mealie/00000000-0000-4000-a000-000000000001/mappings/00000000-0000-4000-a000-000000000002',
      ],
      ['post', '/mealie/preview'],
      ['post', '/00000000-0000-4000-a000-000000000001/sync-nutrition'],
    ] as const) {
      const agent = request(app);
      const response = await agent[method]('/api/v2/recipe-imports' + url).send(
        {}
      );
      expect(response.status).toBe(403);
    }
    expect(state.preview).not.toHaveBeenCalled();
  });
  it('returns a read-only nutrition confirmation preview for the owner', async () => {
    state.previewNutritionSync.mockResolvedValue({
      recipeName: 'Rice',
      nutrition: { calories: 600 },
      confirmationFingerprint: 'a'.repeat(64),
    });
    const response = await request(app).get(
      '/api/v2/recipe-imports/00000000-0000-4000-a000-000000000001/sync-preview'
    );
    expect(response.status).toBe(200);
    expect(response.body.nutrition.calories).toBe(600);
    expect(state.syncNutrition).not.toHaveBeenCalled();
  });
  it('rejects empty mappings', async () => {
    const response = await request(app)
      .post('/api/v2/recipe-imports/mealie/save')
      .send({
        providerId: '00000000-0000-4000-a000-000000000001',
        recipeSlug: 'rice',
        sourceFingerprint: 'a'.repeat(64),
        mappings: [],
      });
    expect(response.status).toBe(400);
    expect(state.save).not.toHaveBeenCalled();
  });
  it.each(['calories', 'syncBaseline'])(
    'rejects client-provided %s with otherwise valid mappings',
    async (field) => {
      const response = await request(app)
        .post('/api/v2/recipe-imports/mealie/save')
        .send({
          providerId: '00000000-0000-4000-a000-000000000001',
          recipeSlug: 'rice',
          sourceFingerprint: 'a'.repeat(64),
          mappings: [
            {
              ingredientId: 'rice',
              foodId: '00000000-0000-4000-a000-000000000001',
              variantId: '00000000-0000-4000-a000-000000000002',
              quantity: 1,
              unit: 'g',
              confirmed: true,
            },
          ],
          [field]:
            field === 'calories'
              ? 2400
              : {
                  version: 1,
                  contentFingerprint: 'a'.repeat(64),
                  nutritionFingerprint: 'a'.repeat(64),
                },
        });
      expect(response.status).toBe(400);
      expect(state.save).not.toHaveBeenCalled();
    }
  );
  it('accepts valid owner preview requests', async () => {
    const response = await request(app)
      .post('/api/v2/recipe-imports/mealie/preview')
      .send({
        providerId: '00000000-0000-4000-a000-000000000001',
        recipeSlug: 'rice',
      });
    expect(response.status).toBe(200);
    expect(response.body.ingredients).toEqual([]);
  });
  it('returns actionable typed domain conflicts', async () => {
    state.preview.mockRejectedValue(
      new RecipeImportError(
        409,
        'REMOTE_CHANGED',
        'Re-preview the changed recipe.'
      )
    );
    const response = await request(app)
      .post('/api/v2/recipe-imports/mealie/preview')
      .send({
        providerId: '00000000-0000-4000-a000-000000000001',
        recipeSlug: 'rice',
      });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Re-preview the changed recipe.',
      code: 'REMOTE_CHANGED',
    });
  });
});
