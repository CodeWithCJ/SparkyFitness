import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
// @ts-expect-error supertest has no declarations in this package.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import chatRoutes from '../routes/chatRoutes.js';
import {
  cancelChatTurn,
  getChatTurnStatus,
  markChatTurnFailed,
} from '../models/chatRepository.js';
import chatService, { claimChatTurn } from '../services/chatService.js';
import { getChatMcpServerChoices } from '../models/externalProviderRepository.js';
import {
  getChatMcpServerIds,
  saveChatMcpServerChoice,
} from '../models/chatMcpPreferenceRepository.js';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = req.headers['x-family'] ? 'family' : 'owner';
    req.authenticatedUserId = req.headers['x-other-actor'] ? 'other' : 'owner';
    next();
  },
}));
vi.mock('../services/chatService.js', () => ({
  default: { processChatMessageStream: vi.fn() },
  claimChatTurn: vi.fn(),
  CHAT_REQUEST_TIMEOUT_MS: 300_000,
}));
vi.mock('../models/chatRepository.js', () => ({
  getChatTurnStatus: vi.fn(),
  cancelChatTurn: vi.fn(),
  markChatTurnFailed: vi.fn(),
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
        approvals ?? false,
        undefined,
        undefined,
        undefined,
        undefined
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

describe('resumable chat turns', () => {
  const malformedParts = [
    null,
    42,
    'text',
    {},
    { type: false },
    { type: 'text', text: 7 },
    { type: 'text', content: {} },
    { type: 'image_url', image_url: { url: 7 } },
    { type: 'image', image: {} },
    { type: 'file', mediaType: 7 },
    { type: 'file', mimeType: {} },
    { type: 'file', url: {} },
    { type: 'tool-example', state: 'output-error', errorText: {} },
    { type: 'tool-example', state: 'output-denied', approval: { reason: 7 } },
  ];
  it.each(
    ['content', 'parts'].flatMap((field) =>
      malformedParts.map((part) => ({ field, part }))
    )
  )(
    'rejects an invalid $field entry $part before claiming the turn',
    async ({ field, part }) => {
      vi.clearAllMocks();
      const response = await request(app)
        .post('/api/chat/stream')
        .send({
          turnId: first,
          service_config_id: 'svc',
          messages: [{ role: 'user', [field]: [part] }],
        });
      expect(response.status).toBe(400);
      expect(claimChatTurn).not.toHaveBeenCalled();
      expect(chatService.processChatMessageStream).not.toHaveBeenCalled();
    }
  );

  it('runs a retried prompt once and only replays it within its account', async () => {
    vi.clearAllMocks();
    vi.mocked(claimChatTurn).mockResolvedValue(true);
    vi.mocked(getChatTurnStatus).mockResolvedValue('pending');
    vi.mocked(chatService.processChatMessageStream).mockResolvedValue({
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'finish', finishReason: 'stop' });
          c.close();
        },
      }),
    });
    const body = {
      turnId: first,
      service_config_id: 'svc',
      approvals: true,
      messages: [
        { role: 'user', content: 'First question' },
        {
          role: 'user',
          parts: [
            { type: 'text', text: 'Hello' },
            {
              type: 'file',
              mediaType: 'image/png',
              url: 'data:image/png;base64,AA==',
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Second question' },
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/meal.png' },
            },
          ],
        },
      ],
    };
    const [accepted, duplicate] = await Promise.all(
      [1, 2].map(() => request(app).post('/api/chat/stream').send(body))
    );
    expect(accepted.status).toBe(200);
    expect(duplicate.text).toBe(accepted.text);
    expect(chatService.processChatMessageStream).toHaveBeenCalledTimes(1);
    expect(chatService.processChatMessageStream).toHaveBeenCalledWith(
      body.messages,
      'svc',
      'owner',
      'owner',
      false,
      undefined,
      undefined,
      true,
      first,
      expect.any(AbortSignal),
      expect.any(String),
      undefined
    );
    expect(claimChatTurn).toHaveBeenCalledTimes(1);
    const key = vi.mocked(claimChatTurn).mock.calls[0]![0];
    vi.mocked(getChatTurnStatus).mockImplementation(async (row, actor) =>
      row === key && actor === 'owner' ? 'gone' : undefined
    );
    const route = '/api/chat/turns/' + first + '/stream';
    expect(
      (await request(app).get(route).set('x-other-actor', 'yes')).status
    ).toBe(404);
    expect((await request(app).get(route)).text).toBe(accepted.text);
    expect((await request(app).get(route).set('x-family', 'yes')).status).toBe(
      404
    );

    // A Stop recorded on another worker overrides retained chunks here.
    vi.mocked(getChatTurnStatus).mockResolvedValue('cancelled');
    for (const result of [
      await request(app).get(route),
      await request(app).post('/api/chat/stream').send(body),
    ]) {
      expect(result.status).toBe(410);
      expect(result.body).toEqual({ cancelled: true });
    }
    expect(chatService.processChatMessageStream).toHaveBeenCalledTimes(1);
  });
  it('releases a live subscription when a remote Stop wins during lookup', async () => {
    vi.clearAllMocks();
    const turnId = '00000000-0000-4000-8000-000000000010';
    let close!: () => void;
    vi.mocked(claimChatTurn).mockResolvedValue(true);
    vi.mocked(chatService.processChatMessageStream).mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          close = () => controller.close();
        },
      }),
    });
    let stopped!: () => void;
    vi.mocked(getChatTurnStatus).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          stopped = () => resolve('cancelled');
        })
    );
    const cancel = vi.spyOn(ReadableStream.prototype, 'cancel');
    try {
      const response = request(app)
        .post('/api/chat/stream')
        .send({
          turnId,
          service_config_id: 'svc',
          messages: [{ role: 'user', content: 'Hello' }],
        })
        .expect(410, { cancelled: true })
        .then(() => {});
      await vi.waitFor(() =>
        expect(getChatTurnStatus).toHaveBeenCalledTimes(1)
      );
      stopped();
      await response;
      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      close();
      cancel.mockRestore();
    }
  });

  it('recognizes a durable checkpoint after replay expires and never regenerates it', async () => {
    vi.clearAllMocks();
    vi.mocked(claimChatTurn).mockResolvedValue(false);
    vi.mocked(getChatTurnStatus).mockResolvedValue('gone');
    const body = {
      turnId: second,
      service_config_id: 'svc',
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(
      (await request(app).post('/api/chat/stream').send(body)).status
    ).toBe(410);
    expect(
      (await request(app).get('/api/chat/turns/' + second + '/stream')).status
    ).toBe(410);
    vi.mocked(getChatTurnStatus).mockResolvedValue('pending');
    const remote = await request(app).get(
      '/api/chat/turns/' + second + '/stream'
    );
    expect(remote.status).toBe(503);
    expect(remote.headers['retry-after']).toBe('2');
    expect(chatService.processChatMessageStream).not.toHaveBeenCalled();
  });
});

it('writes a stop even when the stream has not reached this worker', async () => {
  vi.clearAllMocks();
  const response = await request(app)
    .post('/api/chat/turns/' + second + '/stop')
    .set('x-family', 'true');
  expect(response.status).toBe(204);
  expect(cancelChatTurn).toHaveBeenCalledWith(
    expect.any(String),
    'owner',
    'family',
    second
  );
  vi.mocked(getChatTurnStatus).mockResolvedValue('cancelled');
  const replay = await request(app)
    .get('/api/chat/turns/' + second + '/stream')
    .set('x-family', 'true');
  expect(replay.status).toBe(410);
  expect(replay.body).toEqual({ cancelled: true });
});

it('records a claimed approval continuation setup failure and returns its durable error', async () => {
  vi.clearAllMocks();
  const turnId = '00000000-0000-4000-8000-000000000009';
  const last = {
    id: second,
    role: 'assistant',
    parts: [
      {
        type: 'tool-logFood',
        state: 'approval-responded',
        approval: { id: first, approved: true },
      },
    ],
  };
  const error = 'The AI service could not complete the request.';
  vi.mocked(claimChatTurn).mockResolvedValue(true);
  vi.mocked(chatService.processChatMessageStream).mockRejectedValue(
    new Error('Provider failure')
  );
  vi.mocked(getChatTurnStatus).mockResolvedValue({ error });
  const response = await request(app)
    .post('/api/chat/stream')
    .send({
      turnId,
      service_config_id: 'svc',
      approvals: true,
      messages: [last],
    });
  expect(claimChatTurn).toHaveBeenCalledWith(
    expect.any(String),
    turnId,
    last,
    'owner',
    'owner',
    undefined,
    expect.any(Number),
    undefined
  );
  expect(markChatTurnFailed).toHaveBeenCalledWith(
    expect.any(String),
    'owner',
    error
  );
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ error });
});
