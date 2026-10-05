import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
// @ts-expect-error supertest has no declarations in this package.
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import chatRoutes from '../routes/chatRoutes.js';
import errorHandler from '../middleware/errorHandler.js';
import {
  transcribeVoiceAudio,
  VoiceTranscriptionError,
} from '../services/voiceTranscriptionService.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import { MAX_VOICE_UPLOAD_BYTES } from '@workspace/shared';

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (!req.headers['x-test-auth']) return res.sendStatus(401);
    req.userId = 'switched-family-member';
    req.authenticatedUserId = 'authenticated-actor';
    next();
  },
}));
vi.mock('../services/chatService.js', () => ({ default: {} }));
vi.mock('../models/globalSettingsRepository.js', () => ({ default: {} }));
vi.mock('../utils/adminCheck.js', () => ({ resolveIsAdmin: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/voiceTranscriptionService.js', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../services/voiceTranscriptionService.js')
    >();
  return { ...original, transcribeVoiceAudio: vi.fn() };
});
vi.mock('../models/chatRepository.js', () => ({ default: {} }));

const app = express();
app.use('/api/chat', chatRoutes);
app.use(errorHandler);
const serviceId = '00000000-0000-4000-8000-000000000042';
const transcribe = vi.mocked(transcribeVoiceAudio);
const upload = () =>
  request(app).post('/api/chat/transcribe').set('x-test-auth', 'true');
const audio = Buffer.from('test audio');

describe('POST /api/chat/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveIsAdmin).mockResolvedValue(false);
    transcribe.mockResolvedValue({
      text: 'Log an apple',
      model: 'voice-model',
    });
  });

  it('requires authentication before accepting an upload', async () => {
    const result = await request(app)
      .post('/api/chat/transcribe')
      .attach('audio', audio, 'voice.m4a');
    expect(result.status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('validates multipart fields and scopes AI credentials to the authenticated actor', async () => {
    const result = await upload()
      .field('service_config_id', serviceId)
      .field('mime_type', 'audio/mp4')
      .attach('audio', audio, {
        filename: 'voice.m4a',
        contentType: 'application/octet-stream',
      });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ text: 'Log an apple', model: 'voice-model' });
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        audio,
        mimeType: 'audio/mp4',
        serviceConfigId: serviceId,
        userId: 'authenticated-actor',
        isAdmin: false,
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('honors the verified admin role, not a multipart claim', async () => {
    vi.mocked(resolveIsAdmin).mockResolvedValue(true);
    const result = await upload()
      .field('service_config_id', serviceId)
      .attach('audio', audio, {
        filename: 'voice.wav',
        contentType: 'audio/wav',
      });
    expect(result.status).toBe(200);
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: true })
    );
  });

  it.each(['', 'not-a-uuid'])(
    'rejects an invalid service ID (%s)',
    async (id) => {
      const result = await upload()
        .field('service_config_id', id)
        .attach('audio', audio, 'voice.m4a');
      expect(result.status).toBe(400);
      expect(transcribe).not.toHaveBeenCalled();
    }
  );

  it('rejects absent, empty, unsupported, and multiple files', async () => {
    expect((await upload().field('service_config_id', serviceId)).status).toBe(
      400
    );
    expect(
      (
        await upload()
          .field('service_config_id', serviceId)
          .attach('audio', Buffer.alloc(0), 'voice.m4a')
      ).status
    ).toBe(400);
    expect(
      (
        await upload()
          .field('service_config_id', serviceId)
          .attach('audio', audio, 'voice.txt')
      ).status
    ).toBe(400);
    expect(
      (
        await upload()
          .field('service_config_id', serviceId)
          .field('mime_type', 'text/plain')
          .attach('audio', audio, 'voice.m4a')
      ).status
    ).toBe(400);
    expect(
      (
        await upload()
          .field('service_config_id', serviceId)
          .attach('audio', audio, 'one.m4a')
          .attach('audio', audio, 'two.m4a')
      ).status
    ).toBe(400);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('returns 413 for oversized audio before invoking the provider', async () => {
    const result = await upload()
      .field('service_config_id', serviceId)
      .attach('audio', Buffer.alloc(MAX_VOICE_UPLOAD_BYTES + 1), 'voice.m4a');
    expect(result.status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 502, 504])(
    'preserves typed service error status %s',
    async (statusCode) => {
      transcribe.mockRejectedValue(
        new VoiceTranscriptionError('Voice unavailable', statusCode)
      );
      const result = await upload()
        .field('service_config_id', serviceId)
        .attach('audio', audio, {
          filename: 'voice.wav',
          contentType: 'audio/wav',
        });
      expect(result.status).toBe(statusCode);
      expect(result.body.error).toBe('Voice unavailable');
    }
  );
});
