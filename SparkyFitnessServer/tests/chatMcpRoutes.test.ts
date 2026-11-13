import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
// @ts-expect-error supertest has no declarations in this package.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import chatRoutes from '../routes/chatRoutes.js';
import chatService from '../services/chatService.js';
import { getChatMcpServerChoices } from '../models/externalProviderRepository.js';
import {
  getChatMcpServerIds,
  saveChatMcpServerIds,
} from '../models/chatMcpPreferenceRepository.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = req.headers['x-family'] ? 'family' : 'owner';
    req.authenticatedUserId = 'owner';
    next();
  },
}));
vi.mock('../services/chatService.js', () => ({
  default: { processChatMessageStream: vi.fn() },
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdmin: vi.fn(async () => false),
}));
vi.mock('../services/voiceTranscriptionService.js', () => ({
  transcribeVoiceAudio: vi.fn(),
}));
vi.mock('../models/globalSettingsRepository.js', () => ({ default: {} }));
vi.mock('../models/externalProviderRepository.js', () => ({
  getChatMcpServerChoices: vi.fn(),
}));
vi.mock('../models/chatMcpPreferenceRepository.js', () => ({
  getChatMcpServerIds: vi.fn(),
  saveChatMcpServerIds: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
const app = express();
app.use(express.json());
app.use('/api/chat', chatRoutes);
app.use((_error: unknown, _req: Request, res: Response, _next: NextFunction) =>
  res.status(500).json({ error: 'Server error' })
);
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const unknownId = '00000000-0000-4000-8000-000000000003';
const inactiveId = '00000000-0000-4000-8000-000000000004';

describe('/api/chat/mcp-servers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getChatMcpServerChoices).mockResolvedValue([
      { id: first, name: 'Notes', send_user_id: true },
      { id: second, name: 'Tasks', send_user_id: false },
    ]);
    vi.mocked(getChatMcpServerIds).mockResolvedValue([second]);
    vi.mocked(saveChatMcpServerIds).mockResolvedValue(undefined);
  });
  it('returns only names, IDs and enabled states, never credentials or options', async () => {
    vi.mocked(getChatMcpServerChoices).mockResolvedValue([
      {
        id: first,
        name: 'Notes',
        send_user_id: true,
        base_url: 'https://private.example',
        app_key: 'secret',
        provider_options: { allowed_tools: ['echo'] },
      } as { id: string; name: string; send_user_id: boolean },
    ]);
    const result = await request(app).get('/api/chat/mcp-servers');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      servers: [
        { id: first, name: 'Notes', send_user_id: true, enabled: false },
      ],
    });
    expect(getChatMcpServerIds).toHaveBeenCalledWith('owner');
  });
  it('stores only currently available IDs and returns the same safe shape', async () => {
    const result = await request(app)
      .put('/api/chat/mcp-servers')
      .send({ enabled_server_ids: [first, unknownId, inactiveId] });
    expect(result.status).toBe(200);
    expect(saveChatMcpServerIds).toHaveBeenCalledWith('owner', [first]);
    expect(result.body).toEqual({
      servers: [
        { id: first, name: 'Notes', send_user_id: true, enabled: true },
        { id: second, name: 'Tasks', send_user_id: false, enabled: false },
      ],
    });
  });
  it.each(['get', 'put'] as const)(
    'refuses delegated %s requests',
    async (method) => {
      const agent = request(app);
      const result = await agent[method]('/api/chat/mcp-servers')
        .set('x-family', 'true')
        .send({ enabled_server_ids: [first] });
      expect(result.status).toBe(403);
      expect(getChatMcpServerChoices).not.toHaveBeenCalled();
      expect(saveChatMcpServerIds).not.toHaveBeenCalled();
    }
  );
  it.each([
    [first, first],
    ['invalid'],
    Array.from({ length: 51 }, () => first),
  ])('rejects invalid or duplicate lists', async (...ids) => {
    const result = await request(app)
      .put('/api/chat/mcp-servers')
      .send({ enabled_server_ids: ids });
    expect(result.status).toBe(400);
    expect(saveChatMcpServerIds).not.toHaveBeenCalled();
  });
  it('passes lookup failures to the route error handler', async () => {
    vi.mocked(getChatMcpServerIds).mockRejectedValue(new Error('offline'));
    const result = await request(app).get('/api/chat/mcp-servers');
    expect(result.status).toBe(500);
  });
});

describe('/api/chat/stream approval capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatService.processChatMessageStream).mockImplementation(
      async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'finish', finishReason: 'stop' });
            controller.close();
          },
        }),
      })
    );
  });
  it.each([undefined, true, false])(
    'passes the explicit capability with default false (%s)',
    async (approvals) => {
      const messages = [{ role: 'user', content: 'Hello.' }];
      const result = await request(app)
        .post('/api/chat/stream')
        .send({
          messages,
          service_config_id: 'svc-1',
          ...(approvals === undefined ? {} : { approvals }),
        });
      expect(result.status).toBe(200);
      expect(chatService.processChatMessageStream).toHaveBeenCalledWith(
        messages,
        'svc-1',
        'owner',
        'owner',
        false,
        undefined,
        undefined,
        approvals ?? false
      );
    }
  );
  it('rejects a nonboolean capability', async () => {
    const result = await request(app)
      .post('/api/chat/stream')
      .send({ messages: [], service_config_id: 'svc-1', approvals: 'true' });
    expect(result.status).toBe(400);
    expect(chatService.processChatMessageStream).not.toHaveBeenCalled();
  });
});
