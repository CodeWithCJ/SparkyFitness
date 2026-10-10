import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import router from '../routes/v2/foodAssistantRoutes.js';
import * as service from '../services/foodAssistantService.js';
import * as recipeService from '../services/foodAssistantRecipeService.js';
import * as diaryService from '../services/foodAssistantDiaryService.js';
import * as planningService from '../services/foodAssistantPlanService.js';
import * as shoppingService from '../services/foodAssistantShoppingService.js';
import * as libraryService from '../services/foodAssistantLibraryService.js';
import * as analysisService from '../services/foodAssistantAnalysisService.js';
import { foodAssistantOperationSchema } from '@workspace/shared';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.userId = 'family-member';
    req.authenticatedUserId = 'signed-in-owner';
    next();
  },
}));
vi.mock('../services/foodAssistantService.js', () => ({
  listPreferences: vi.fn(),
  listTasks: vi.fn(),
  getTask: vi.fn(),
  listOperations: vi.fn(),
  createTask: vi.fn(),
  checkpointTask: vi.fn(),
  changeTask: vi.fn(),
  rememberPreference: vi.fn(),
  forgetPreference: vi.fn(),
}));
vi.mock('../services/foodAssistantRecipeService.js', () => ({
  getRecipe: vi.fn(),
  draftFromRecipe: vi.fn(),
  previewRecipe: vi.fn(),
  publishRecipe: vi.fn(),
  importProviderIngredient: vi.fn(),
  undoRecipe: vi.fn(),
}));
const app = express();
vi.mock('../services/foodAssistantDiaryService.js', () => ({
  inspectDiary: vi.fn(),
  applyDiary: vi.fn(),
  undoDiary: vi.fn(),
}));
vi.mock('../services/foodAssistantPlanService.js', () => ({
  inspectPlan: vi.fn(),
  previewPlan: vi.fn(),
  publishPlan: vi.fn(),
  undoPlan: vi.fn(),
}));
vi.mock('../services/foodAssistantShoppingService.js', () => ({
  buildShopping: vi.fn(),
  changeShopping: vi.fn(),
  undoShopping: vi.fn(),
}));
vi.mock('../services/foodAssistantLibraryService.js', () => ({
  inspectFood: vi.fn(),
  previewFood: vi.fn(),
  publishFood: vi.fn(),
  undoFood: vi.fn(),
  importLibraryFood: vi.fn(),
}));
vi.mock('../services/foodAssistantAnalysisService.js', () => ({
  analyzeNutrition: vi.fn(),
  saveNutritionAnalysis: vi.fn(),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('Europe/London'),
}));
app.use(express.json());
app.use('/api/v2/food-assistant', router);
let server: Server;
let baseUrl: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api/v2/food-assistant${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
}
const id = '35a166e9-bcd1-45ba-a5bd-f5a6959aab7b';
beforeEach(() => vi.clearAllMocks());
it('keeps nutrition analysis actor-owned and saves only versioned requests', async () => {
  const analysis = {
    start_date: '2020-01-01',
    end_date: '2020-01-07',
    nutrients: ['calories'],
  };
  expect((await request('POST', '/analysis', analysis)).status).toBe(200);
  expect(analysisService.analyzeNutrition).toHaveBeenCalledWith(
    'signed-in-owner',
    'Europe/London',
    analysis
  );
  expect(
    (
      await request('POST', '/analysis', {
        ...analysis,
        user_id: 'family-member',
      })
    ).status
  ).toBe(400);
  expect(
    (await request('POST', `/analysis/save/${id}`, { operation_id: id })).status
  ).toBe(400);
  const command = { operation_id: id, expected_version: 1 };
  expect((await request('POST', `/analysis/save/${id}`, command)).status).toBe(
    200
  );
  expect(analysisService.saveNutritionAnalysis).toHaveBeenCalledWith(
    'signed-in-owner',
    'Europe/London',
    id,
    command
  );
});
it('pins library inspection, publication and undo to the signed-in actor and validates version/fingerprint contracts', async () => {
  expect((await request('GET', `/library/foods/${id}`)).status).toBe(200);
  expect(libraryService.inspectFood).toHaveBeenCalledWith(
    'signed-in-owner',
    id
  );
  expect(
    (
      await request('POST', `/library/publish/${id}`, {
        operation_id: id,
        expected_version: 1,
        food_id: id,
      })
    ).status
  ).toBe(400);
  const publish = {
    operation_id: id,
    expected_version: 1,
    source_quote: 'Label values supplied',
  };
  expect(
    (await request('POST', `/library/publish/${id}`, publish)).status
  ).toBe(200);
  expect(libraryService.publishFood).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    publish,
    'Label values supplied'
  );
  const undo = {
    operation_id: id,
    expected_version: 2,
    publication_operation_id: id,
    source_quote: 'Undo this food',
  };
  expect((await request('POST', `/library/undo/${id}`, undo)).status).toBe(200);
  expect(libraryService.undoFood).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    undo,
    'Undo this food'
  );
  expect(
    (
      await request('POST', `/library/publish/${id}`, {
        ...publish,
        user_id: 'family-member',
      })
    ).status
  ).toBe(400);
});
it('keeps diary commands actor-owned and rejects unversioned or invalid calendar requests', async () => {
  vi.mocked(diaryService.inspectDiary).mockResolvedValue({
    scope: { type: 'entries', ids: [id] },
    entries: [],
    meals: [],
    water: [],
    nutrition: {},
    fingerprint: 'a'.repeat(64),
    confirmation_required_for_delete: false,
  });
  expect(
    (
      await request('POST', '/diary/inspect', {
        type: 'meal_slot',
        date: '2026-02-30',
        meal_type_id: id,
      })
    ).status
  ).toBe(400);
  expect(
    (
      await request('POST', '/diary/inspect', {
        type: 'entries',
        ids: [id],
        user_id: 'another-person',
      })
    ).status
  ).toBe(400);
  expect(
    (await request('POST', '/diary/inspect', { type: 'entries', ids: [id] }))
      .status
  ).toBe(200);
  expect(diaryService.inspectDiary).toHaveBeenCalledWith('signed-in-owner', {
    type: 'entries',
    ids: [id],
  });
  expect(
    (
      await request('POST', `/diary/apply/${id}`, {
        operation_id: id,
        action: { type: 'delete', scope: { type: 'entries', ids: [id] } },
      })
    ).status
  ).toBe(400);
  expect(diaryService.applyDiary).not.toHaveBeenCalled();
});
it('validates recipe mutation commands and keeps their owner fixed to the signed-in actor', async () => {
  const payload = {
    operation_id: id,
    expected_version: 1,
    ingredient_id: id,
    provider_type: 'fatsecret',
    external_id: '38820',
  };
  expect(
    (
      await request('POST', `/recipes/import-ingredient/${id}`, {
        ...payload,
        user_id: id,
      })
    ).status
  ).toBe(400);
  expect(recipeService.importProviderIngredient).not.toHaveBeenCalled();
  const operation = foodAssistantOperationSchema.parse({
    id,
    user_id: id,
    task_id: id,
    kind: 'import_recipe_ingredient',
    request_hash: 'hash',
    before_state: {},
    after_state: {},
    created_at: new Date(),
  });
  vi.mocked(recipeService.importProviderIngredient).mockResolvedValue(
    operation
  );
  expect(
    (await request('POST', `/recipes/import-ingredient/${id}`, payload)).status
  ).toBe(200);
  expect(recipeService.importProviderIngredient).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    payload
  );
  expect(
    (
      await request('POST', `/recipes/publish/${id}`, {
        operation_id: id,
        expected_version: 1,
        meal_id: id,
      })
    ).status
  ).toBe(400);
  expect(recipeService.publishRecipe).not.toHaveBeenCalled();
});
it('reports recipe conflicts without a success response', async () => {
  vi.mocked(recipeService.undoRecipe).mockRejectedValue(
    new FoodAssistantConflict('Recipe changed')
  );
  const response = await request('POST', `/recipes/undo/${id}`, {
    operation_id: id,
    expected_version: 2,
    publication_operation_id: id,
    source_quote: 'Undo this recipe',
  });
  expect(response.status).toBe(409);
  expect(response.text).toContain('Recipe changed');
});
it('uses the signed-in owner while viewing a family diary', async () => {
  vi.mocked(service.listPreferences).mockResolvedValue([]);
  const response = await request('GET', '/preferences');
  expect(response.status).toBe(200);
  expect(service.listPreferences).toHaveBeenCalledWith('signed-in-owner');
});
it('rejects caller-selected owners, invalid IDs and missing versions', async () => {
  expect(
    (
      await request('PUT', '/preferences', {
        user_id: 'other',
        key: 'bread',
        value: 'White bread',
      })
    ).status
  ).toBe(400);
  expect((await request('GET', '/tasks/not-a-uuid')).status).toBe(400);
  expect(
    (await request('POST', `/tasks/${id}/cancel`, { operation_id: id })).status
  ).toBe(400);
  expect((await request('DELETE', '/preferences/bread')).status).toBe(400);
  expect(service.rememberPreference).not.toHaveBeenCalled();
  expect(service.changeTask).not.toHaveBeenCalled();
});
it('returns 404 for an inaccessible task', async () => {
  vi.mocked(service.getTask).mockResolvedValue(null);
  expect((await request('GET', `/tasks/${id}`)).status).toBe(404);
});
it('returns a conflict on stale edits rather than reporting success', async () => {
  vi.mocked(service.forgetPreference).mockRejectedValue(
    new FoodAssistantConflict()
  );
  const response = await request('DELETE', '/preferences/bread?version=2');
  expect(response.status).toBe(409);
  expect(response.text).toContain('changed');
});
it('validates planning writes and binds publication and shopping checks to the signed-in actor', async () => {
  const command = { operation_id: id, expected_version: 3, schedule: true };
  expect(
    (
      await request('POST', `/planning/publish_plan/${id}`, {
        ...command,
        user_id: 'other',
      })
    ).status
  ).toBe(400);
  expect(
    (
      await request('POST', `/planning/publish_plan/${id}`, {
        operation_id: id,
        schedule: true,
      })
    ).status
  ).toBe(400);
  expect(planningService.publishPlan).not.toHaveBeenCalled();
  vi.mocked(planningService.publishPlan).mockRejectedValue(
    new FoodAssistantConflict('Plan changed')
  );
  expect(
    (await request('POST', `/planning/publish_plan/${id}`, command)).status
  ).toBe(409);
  expect(planningService.publishPlan).toHaveBeenCalledWith(
    'signed-in-owner',
    'Europe/London',
    id,
    command,
    ''
  );
  const check = {
    operation_id: id,
    expected_version: 4,
    change: { type: 'mark', item_id: id, purchased: true },
  };
  vi.mocked(shoppingService.changeShopping).mockRejectedValue(
    new FoodAssistantConflict('Shopping list changed')
  );
  expect(
    (await request('POST', `/planning/change_shopping_list/${id}`, check))
      .status
  ).toBe(409);
  expect(shoppingService.changeShopping).toHaveBeenCalledWith(
    'signed-in-owner',
    id,
    check,
    ''
  );
  expect((await request('POST', `/planning/unknown/${id}`, check)).status).toBe(
    400
  );
});
