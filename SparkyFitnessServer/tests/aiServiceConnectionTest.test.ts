import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import express from 'express';
import chatRoutes from '../routes/chatRoutes.js';
import chatService from '../services/chatService.js';
import chatRepository from '../models/chatRepository.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';

// We exercise the REAL chatService.testAiServiceConnection and the REAL route,
// mocking only the lower-level seams (repository, dispatch, admin/config gates).
vi.mock('../models/chatRepository');
vi.mock('../ai/providerDispatch');
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn(),
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: {
    isUserAiConfigAllowed: vi.fn(),
  },
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: vi.fn((req, _res, next) => {
    req.userId = 'user-123';
    req.authenticatedUserId = 'user-123';
    req.user = { id: 'user-123' };
    next();
  }),
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));
// The remaining mocks only keep chatService's heavy module graph loadable; the
// connection-test path never touches them.
vi.mock('../models/userRepository');
vi.mock('../models/measurementRepository');
vi.mock('../models/preferenceRepository', () => ({
  default: {
    getUserPreferences: vi.fn(),
    updateUserPreferences: vi.fn(),
  },
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));
vi.mock('../services/foodEntryService', () => ({
  default: { createFoodEntry: vi.fn() },
}));
vi.mock('../models/foodRepository', () => ({
  default: {
    getFoodsWithPagination: vi.fn(),
    countFoods: vi.fn(),
    getFoodById: vi.fn(),
  },
}));
vi.mock('../services/preferenceService', () => ({
  default: { getUserPreferences: vi.fn() },
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => Object.assign(() => ({}), { chat: () => ({}) })),
}));

const mockDispatch = vi.mocked(dispatchAiRequest);
const mockGetDecrypted = vi.mocked(
  chatRepository.getDecryptedAiServiceSettingById
);
const mockIsUserAiConfigAllowed = vi.mocked(
  globalSettingsRepository.isUserAiConfigAllowed
);
const mockResolveIsAdmin = vi.mocked(resolveIsAdmin);

const okDispatch = { ok: true as const, text: 'OK', json: null };

const app = express();
app.use(express.json());
app.use('/chat', chatRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

const USER_ID = 'user-123';

describe('POST /chat/ai-service-settings/test — gate #1 (per-user AI config)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a non-admin with 403 and never dispatches when per-user AI config is disabled', async () => {
    mockResolveIsAdmin.mockResolvedValue(false);
    mockIsUserAiConfigAllowed.mockResolvedValue(false);

    const res = await request(app)
      .post('/chat/ai-service-settings/test')
      .send({ service_type: 'openai', api_key: 'sk-test' });

    expect(res.statusCode).toBe(403);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('lets an admin through even when per-user AI config is disabled', async () => {
    mockResolveIsAdmin.mockResolvedValue(true);
    mockIsUserAiConfigAllowed.mockResolvedValue(false);
    mockDispatch.mockResolvedValue(okDispatch);

    const res = await request(app)
      .post('/chat/ai-service-settings/test')
      .send({ service_type: 'openai', api_key: 'sk-test' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('returns 400 on a malformed body (missing service_type)', async () => {
    mockResolveIsAdmin.mockResolvedValue(true);

    const res = await request(app)
      .post('/chat/ai-service-settings/test')
      .send({ api_key: 'sk-test' });

    expect(res.statusCode).toBe(400);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('chatService.testAiServiceConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { ok: true } and passes timeoutMs: 15000 on a successful completion', async () => {
    mockDispatch.mockResolvedValue(okDispatch);

    const result = await chatService.testAiServiceConnection(
      { service_type: 'openai', api_key: 'sk-test' },
      USER_ID,
      false
    );

    expect(result).toEqual({ ok: true });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0]).toMatchObject({
      provider: { service_type: 'openai', api_key: 'sk-test' },
      temperature: 0,
      timeoutMs: 15000,
    });
  });

  it('passes through api_key_missing for a cloud type with no id and no key', async () => {
    mockDispatch.mockResolvedValue({
      ok: false,
      category: 'api_key_missing',
      detail: 'API key missing.',
    });

    const result = await chatService.testAiServiceConnection(
      { service_type: 'openai' },
      USER_ID,
      false
    );

    expect(result).toEqual({
      ok: false,
      category: 'api_key_missing',
      detail: 'API key missing.',
    });
    expect(mockDispatch.mock.calls[0][0].provider.api_key).toBeUndefined();
  });

  it('passes through custom_url_missing for an ollama service with no url', async () => {
    mockDispatch.mockResolvedValue({
      ok: false,
      category: 'custom_url_missing',
      detail: 'A custom URL is required.',
    });

    const result = await chatService.testAiServiceConnection(
      { service_type: 'ollama', model_name: 'llama3' },
      USER_ID,
      false
    );

    expect(result).toEqual({
      ok: false,
      category: 'custom_url_missing',
      detail: 'A custom URL is required.',
    });
  });

  it('passes through upstream_error for a bad key (401)', async () => {
    mockDispatch.mockResolvedValue({
      ok: false,
      category: 'upstream_error',
      status: 401,
      detail: 'AI service returned status 401',
    });

    const result = await chatService.testAiServiceConnection(
      { service_type: 'openai', api_key: 'bad-key' },
      USER_ID,
      false
    );

    expect(result).toEqual({
      ok: false,
      category: 'upstream_error',
      detail: 'AI service returned status 401',
    });
  });

  it('falls back to the stored decrypted key on edit with a blank key (matching provider)', async () => {
    mockGetDecrypted.mockResolvedValue({
      service_type: 'openai',
      api_key: 'decrypted-stored-key',
      custom_url: null,
      model_name: 'gpt-4o',
      is_public: false,
    });
    mockDispatch.mockResolvedValue(okDispatch);

    const result = await chatService.testAiServiceConnection(
      { id: 'svc-1', service_type: 'openai', api_key: '' },
      USER_ID,
      false
    );

    expect(result).toEqual({ ok: true });
    expect(mockGetDecrypted).toHaveBeenCalledWith('svc-1', USER_ID);
    expect(mockDispatch.mock.calls[0][0].provider).toMatchObject({
      service_type: 'openai',
      api_key: 'decrypted-stored-key',
      model_name: 'gpt-4o',
    });
  });

  it('still dispatches when the stored row is inactive (the helper applies no is_active filter)', async () => {
    // The repo helper returns a key regardless of is_active (verified in
    // chatRepository.test.ts), so testing an inactive service still works.
    mockGetDecrypted.mockResolvedValue({
      service_type: 'anthropic',
      api_key: 'stored-anthropic-key',
      custom_url: null,
      model_name: null,
      is_public: false,
    });
    mockDispatch.mockResolvedValue(okDispatch);

    const result = await chatService.testAiServiceConnection(
      { id: 'svc-inactive', service_type: 'anthropic', api_key: '' },
      USER_ID,
      false
    );

    expect(result).toEqual({ ok: true });
    expect(mockDispatch.mock.calls[0][0].provider.api_key).toBe(
      'stored-anthropic-key'
    );
  });

  it('gate #2: throws 403 and never dispatches when a non-admin tests a stored global row', async () => {
    mockGetDecrypted.mockResolvedValue({
      service_type: 'openai',
      api_key: 'operator-global-key',
      custom_url: null,
      model_name: 'gpt-4o',
      is_public: true,
    });

    await expect(
      chatService.testAiServiceConnection(
        {
          id: 'global-1',
          service_type: 'custom',
          custom_url: 'https://attacker.example/',
          api_key: '',
        },
        USER_ID,
        false
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('gate #2: an admin may test a stored global row', async () => {
    mockGetDecrypted.mockResolvedValue({
      service_type: 'openai',
      api_key: 'operator-global-key',
      custom_url: null,
      model_name: 'gpt-4o',
      is_public: true,
    });
    mockDispatch.mockResolvedValue(okDispatch);

    const result = await chatService.testAiServiceConnection(
      { id: 'global-1', service_type: 'openai', api_key: '' },
      USER_ID,
      true
    );

    expect(result).toEqual({ ok: true });
    expect(mockDispatch.mock.calls[0][0].provider.api_key).toBe(
      'operator-global-key'
    );
  });

  it('gate #3: does not reuse the stored key when the requested provider differs', async () => {
    // Saved as OpenAI, switched to custom with a blank key: the stored OpenAI
    // key must NOT be forwarded to the new (attacker-controllable) URL.
    mockGetDecrypted.mockResolvedValue({
      service_type: 'openai',
      api_key: 'stored-openai-key',
      custom_url: null,
      model_name: 'gpt-4o',
      is_public: false,
    });
    mockDispatch.mockResolvedValue({
      ok: false,
      category: 'api_key_missing',
      detail: 'API key missing.',
    });

    const result = await chatService.testAiServiceConnection(
      {
        id: 'svc-1',
        service_type: 'custom',
        custom_url: 'https://elsewhere.example/',
        api_key: '',
        model_name: 'some-model',
      },
      USER_ID,
      false
    );

    expect(result).toEqual({
      ok: false,
      category: 'api_key_missing',
      detail: 'API key missing.',
    });
    const provider = mockDispatch.mock.calls[0][0].provider;
    expect(provider.api_key).toBeUndefined();
    expect(provider.custom_url).toBe('https://elsewhere.example/');
  });

  it('post-fallback model check: throws 400 and never dispatches for a no-preset type with a blank model', async () => {
    await expect(
      chatService.testAiServiceConnection(
        {
          service_type: 'openai_compatible',
          custom_url: 'http://localhost:1234/v1',
          api_key: 'k',
        },
        USER_ID,
        false
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
