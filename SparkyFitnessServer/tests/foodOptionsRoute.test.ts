import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import chatRoutes from '../routes/chatRoutes.js';
import chatService from '../services/chatService.js';

// chatRoutes uses the default import; mocking the whole module also keeps the
// heavy AI-SDK module graph behind chatService from loading.
vi.mock('../services/chatService.js', () => ({
  default: {
    processFoodOptionsRequest: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, res, next) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    next();
  }),
}));

vi.mock('../models/globalSettingsRepository.js', () => ({
  default: {
    isUserAiConfigAllowed: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const mockProcessFoodOptions = vi.mocked(chatService.processFoodOptionsRequest);

const app = express();
app.use(express.json());
app.use('/chat', chatRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, req: any, res: any, _next: any) => {
  res.status(500).json({ error: err.message });
});

const sampleContent = JSON.stringify([
  { name: 'Apple', serving_size: 1, serving_unit: 'piece', calories: 95 },
]);

describe('POST /chat/food-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when service_config_id is missing', async () => {
    const res = await request(app)
      .post('/chat/food-options')
      .send({ foodName: 'apple', unit: 'piece' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('AI service configuration ID is required.');
    expect(mockProcessFoodOptions).not.toHaveBeenCalled();
  });

  it('should return 200 with the raw content on success', async () => {
    mockProcessFoodOptions.mockResolvedValue({
      success: true,
      content: sampleContent,
    });
    const res = await request(app).post('/chat/food-options').send({
      foodName: 'apple',
      unit: 'piece',
      service_config_id: 'setting-1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ content: sampleContent });
    expect(mockProcessFoodOptions).toHaveBeenCalledWith(
      'apple',
      'piece',
      'user-123',
      'setting-1'
    );
  });

  // Documents the category → HTTP status contract; the Record over
  // FoodOptionsErrorCategory in the route gives the compile-time completeness.
  it.each([
    ['no_ai_configured', 404],
    ['api_key_missing', 404],
    ['upstream_error', 502],
    ['timeout', 504],
    ['parse_error', 422],
  ] as const)('should map category %s to HTTP %i', async (category, status) => {
    mockProcessFoodOptions.mockResolvedValue({
      success: false,
      category,
      error: 'Something went wrong upstream.',
    });
    const res = await request(app).post('/chat/food-options').send({
      foodName: 'apple',
      unit: 'piece',
      service_config_id: 'setting-1',
    });
    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: 'Something went wrong upstream.' });
  });

  it('should respond 502 (not the provider status) when the upstream returned 429', async () => {
    // Pins the intentional drift from the old handler, which parsed the
    // provider status out of the error message and echoed it as our own.
    mockProcessFoodOptions.mockResolvedValue({
      success: false,
      category: 'upstream_error',
      error: 'AI service returned status 429: Rate limit exceeded',
    });
    const res = await request(app).post('/chat/food-options').send({
      foodName: 'apple',
      unit: 'piece',
      service_config_id: 'setting-1',
    });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toContain('status 429');
  });

  it('should return 500 when the service throws an unhandled error', async () => {
    mockProcessFoodOptions.mockRejectedValue(new Error('Unexpected failure'));
    const res = await request(app).post('/chat/food-options').send({
      foodName: 'apple',
      unit: 'piece',
      service_config_id: 'setting-1',
    });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Unexpected failure');
  });
});
