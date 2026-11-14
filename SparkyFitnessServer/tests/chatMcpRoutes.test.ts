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
  saveChatMcpServerChoice,
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
  saveChatMcpServerChoice: vi.fn(),
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

describe('/api/chat/mcp-servers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getChatMcpServerChoices).mockResolvedValue([
      { id: first, name: 'Notes', send_user_id: true },
      { id: second, name: 'Tasks', send_user_id: false },
    ]);
    vi.mocked(getChatMcpServerIds).mockResolvedValue([second]);
    vi.mocked(saveChatMcpServerChoice).mockResolvedValue(true);
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
  it('turns B on without restoring A after an admin cleared it', async () => {
    vi.mocked(getChatMcpServerIds).mockResolvedValue([second]);
    const choice = { server_id: second, enabled: true, send_user_id: false };
    const result = await request(app).put('/api/chat/mcp-servers').send(choice);
    expect(result.status).toBe(200);
    expect(saveChatMcpServerChoice).toHaveBeenCalledWith('owner', choice);
    expect(
      result.body.servers.map((server: { enabled: boolean }) => server.enabled)
    ).toEqual([false, true]);
  });
  it('returns current choices with 409 for outdated consent', async () => {
    vi.mocked(saveChatMcpServerChoice).mockResolvedValue(false);
    const result = await request(app)
      .put('/api/chat/mcp-servers')
      .send({ server_id: first, enabled: true, send_user_id: false });
    expect(result.status).toBe(409);
    expect(result.body.servers[0].enabled).toBe(false);
  });
  it('turns a server off twice', async () => {
    for (let i = 0; i < 2; i++) {
      const result = await request(app)
        .put('/api/chat/mcp-servers')
        .send({ server_id: first, enabled: false, send_user_id: true });
      expect(result.status).toBe(200);
    }
  });
  it.each(['get', 'put'] as const)(
    'refuses delegated %s requests',
    async (method) => {
      const agent = request(app);
      const result = await agent[method]('/api/chat/mcp-servers')
        .set('x-family', 'true')
        .send({ server_id: first, enabled: true, send_user_id: true });
      expect(result.status).toBe(403);
      expect(getChatMcpServerChoices).not.toHaveBeenCalled();
      expect(saveChatMcpServerChoice).not.toHaveBeenCalled();
    }
  );
  it.each([
    { enabled_server_ids: [first] },
    { server_id: 'invalid', enabled: true, send_user_id: true },
    { server_id: first, enabled: true },
    { server_id: first, enabled: true, send_user_id: true, extra: true },
  ])('rejects invalid choices', async (body) => {
    const result = await request(app).put('/api/chat/mcp-servers').send(body);
    expect(result.status).toBe(400);
    expect(saveChatMcpServerChoice).not.toHaveBeenCalled();
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
