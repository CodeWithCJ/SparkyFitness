import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import router from '../routes/v2/foodAssistantRoutes.js';
import * as service from '../services/foodAssistantService.js';
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
const app = express();
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
