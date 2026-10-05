import { MAX_VOICE_UPLOAD_BYTES } from '@workspace/shared';
import { transcribeVoiceRecording } from '../../../src/services/api/voiceTranscriptionApi';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
  type ServerConfig,
} from '../../../src/services/storage';
import {
  getAuthHeaders,
  notifySessionExpired,
} from '../../../src/services/api/authService';
import { fetchWithTimeout } from '../../../src/utils/concurrency';

let mockFileSize = 100;
jest.mock('expo-file-system', () => ({
  File: class extends Blob {
    constructor() {
      super(['audio'], { type: 'audio/mp4' });
    }
    get size() {
      return mockFileSize;
    }
  },
}));
jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(),
}));
jest.mock('../../../src/services/api/authService', () => ({
  getAuthHeaders: jest.fn(),
  notifySessionExpired: jest.fn(),
}));
jest.mock('../../../src/services/api/apiClient', () => ({
  normalizeUrl: (url: string) => url.replace(/\/$/, ''),
}));
jest.mock('../../../src/utils/concurrency', () => ({
  fetchWithTimeout: jest.fn(),
}));

const config: ServerConfig = {
  id: 'server-1',
  url: 'https://fitness.example/',
  apiKey: '',
  authType: 'session',
  sessionToken: 'fixture-token',
};
const params = { uri: 'file:///voice.m4a', serviceConfigId: 'voice-1' };
const fetchMock = jest.mocked(fetchWithTimeout);
const getConfig = jest.mocked(getActiveServerConfig);

function respond(status: number, payload: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);
}

describe('voiceTranscriptionApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSize = 100;
    getConfig.mockResolvedValue(config);
    jest.mocked(proxyHeadersToRecord).mockReturnValue({ 'X-Proxy': 'fixture' });
    jest
      .mocked(getAuthHeaders)
      .mockReturnValue({ Authorization: 'Bearer fixture-token' });
  });

  it('uploads a multipart File with auth, proxy headers, and caller cancellation', async () => {
    const signal = new AbortController().signal;
    respond(200, { text: 'Log an apple', model: 'voice-model' });
    await expect(
      transcribeVoiceRecording({ ...params, signal })
    ).resolves.toEqual({
      text: 'Log an apple',
      model: 'voice-model',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fitness.example/api/chat/transcribe',
      {
        method: 'POST',
        signal,
        body: expect.any(FormData),
        headers: {
          'X-Proxy': 'fixture',
          Authorization: 'Bearer fixture-token',
        },
      },
      90_000
    );
  });

  it('rejects missing server configuration before uploading', async () => {
    getConfig.mockResolvedValue(null);
    await expect(transcribeVoiceRecording(params)).rejects.toThrow(
      'Server configuration not found'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized recordings before uploading', async () => {
    mockFileSize = MAX_VOICE_UPLOAD_BYTES + 1;
    await expect(transcribeVoiceRecording(params)).rejects.toThrow('10 MB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('expires session authentication on HTTP 401', async () => {
    respond(401, { error: 'Unauthorized' });
    await expect(transcribeVoiceRecording(params)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(notifySessionExpired).toHaveBeenCalledWith(config.id);
  });

  it('does not expire API-key authentication on HTTP 401', async () => {
    getConfig.mockResolvedValue({ ...config, authType: 'apiKey' });
    respond(401, { error: 'Unauthorized' });
    await expect(transcribeVoiceRecording(params)).rejects.toThrow();
    expect(notifySessionExpired).not.toHaveBeenCalled();
  });

  it.each([
    { text: '', model: 'voice' },
    { text: 'Hello' },
    { error: 'No speech' },
  ])('rejects invalid success bodies: %j', async (payload) => {
    respond(200, payload);
    await expect(transcribeVoiceRecording(params)).rejects.toThrow();
  });

  it('requires HTTPS in production', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
    Object.defineProperty(globalThis, '__DEV__', {
      configurable: true,
      value: false,
    });
    try {
      getConfig.mockResolvedValue({ ...config, url: 'http://fitness.example' });
      await expect(transcribeVoiceRecording(params)).rejects.toThrow('HTTPS');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(globalThis, '__DEV__', original);
    }
  });
});
