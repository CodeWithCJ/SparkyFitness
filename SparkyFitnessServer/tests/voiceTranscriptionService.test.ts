import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { transcribeVoiceAudio } from '../services/voiceTranscriptionService.js';
import { isPrivateNetworkAiAllowed } from '../models/globalSettingsRepository.js';

vi.mock('../models/chatRepository.js', () => ({
  default: { getAiServiceSettingForBackend: vi.fn() },
}));

vi.mock('../models/globalSettingsRepository.js', () => ({
  isPrivateNetworkAiAllowed: vi.fn(),
}));

const mockPrivateNetworkAllowed = vi.mocked(isPrivateNetworkAiAllowed);
const mockGetService = vi.mocked(chatRepository.getAiServiceSettingForBackend);
const fetchMock = vi.fn<typeof fetch>();
const configuration = {
  service_type: 'google',
  model_name: 'gemini-2.5-flash',
  api_key: 'test-key',
  supports_audio_input: true,
  is_public: false,
};
const params = {
  audio: Buffer.from('audio'),
  mimeType: 'audio/mp4',
  serviceConfigId: 'service-1',
  userId: 'user-1',
};

describe('transcribeVoiceAudio', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('ALLOW_PRIVATE_NETWORK_AI', 'false');
    mockPrivateNetworkAllowed.mockResolvedValue(false);
    mockGetService.mockResolvedValue({ ...configuration });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('requires an accessible, active configuration', async () => {
    mockGetService.mockResolvedValue(null);
    await expect(transcribeVoiceAudio(params)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockGetService).toHaveBeenCalledWith('service-1', 'user-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the configuration to opt in to audio', async () => {
    mockGetService.mockResolvedValue({
      ...configuration,
      supports_audio_input: false,
    });
    await expect(transcribeVoiceAudio(params)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects provider types without a transcription route', async () => {
    mockGetService.mockResolvedValue({
      ...configuration,
      service_type: 'openrouter',
    });
    await expect(transcribeVoiceAudio(params)).rejects.toThrow(
      'not supported for service type: openrouter'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transcribes inline audio through the guarded Google request', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        candidates: [{ content: { parts: [{ text: ' Привет ' }] } }],
      })
    );
    await expect(transcribeVoiceAudio(params)).resolves.toEqual({
      text: 'Привет',
      model: configuration.model_name,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    );
    expect(init).toMatchObject({
      redirect: 'manual',
      method: 'POST',
      headers: { 'x-goog-api-key': 'test-key' },
    });
    expect(
      JSON.parse(String(init?.body)).contents[0].parts[1].inline_data
    ).toEqual({
      mime_type: 'audio/mp4',
      data: params.audio.toString('base64'),
    });
    expect(init).toHaveProperty('dispatcher');
  });

  it.each(['openai', 'mistral', 'openai_compatible', 'custom'])(
    'sends multipart transcription to %s',
    async (serviceType) => {
      mockGetService.mockResolvedValue({
        ...configuration,
        service_type: serviceType,
        model_name: 'voice-model',
        custom_url: 'https://voice.example/v1',
      });
      fetchMock.mockResolvedValue(Response.json({ text: ' test transcript ' }));
      await expect(transcribeVoiceAudio(params)).resolves.toEqual({
        text: 'test transcript',
        model: 'voice-model',
      });
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toMatch(/\/audio\/transcriptions$/);
      expect(init).toMatchObject({
        redirect: 'manual',
        headers: { Authorization: 'Bearer test-key' },
      });
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.body as FormData).get('model')).toBe('voice-model');
    }
  );

  it('allows keyless self-hosted transcription without an Authorization header', async () => {
    mockGetService.mockResolvedValue({
      ...configuration,
      service_type: 'custom',
      api_key: null,
      custom_url: 'http://127.0.0.1:9000/v1',
      is_public: true,
    });
    fetchMock.mockResolvedValue(Response.json({ text: 'local speech' }));
    await expect(transcribeVoiceAudio(params)).resolves.toMatchObject({
      text: 'local speech',
    });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({});
  });

  it.each([
    'http://127.0.0.1/v1',
    'http://169.254.169.254/v1',
    'http://[::1]/v1',
  ])('blocks an untrusted private endpoint: %s', async (url) => {
    mockGetService.mockResolvedValue({
      ...configuration,
      service_type: 'custom',
      custom_url: url,
    });
    await expect(transcribeVoiceAudio(params)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows private endpoints for a verified administrator', async () => {
    mockGetService.mockResolvedValue({
      ...configuration,
      service_type: 'custom',
      custom_url: 'http://127.0.0.1:9000/v1',
    });
    fetchMock.mockResolvedValue(Response.json({ text: 'local speech' }));
    await expect(
      transcribeVoiceAudio({ ...params, isAdmin: true })
    ).resolves.toMatchObject({ text: 'local speech' });
  });

  it('honors the administrator private-network setting for personal voice models', async () => {
    mockPrivateNetworkAllowed.mockResolvedValue(true);
    mockGetService.mockResolvedValue({
      ...configuration,
      service_type: 'custom',
      custom_url: 'http://127.0.0.1:9000/v1',
    });
    fetchMock.mockResolvedValue(Response.json({ text: 'local speech' }));
    await expect(transcribeVoiceAudio(params)).resolves.toMatchObject({
      text: 'local speech',
    });
    expect(mockPrivateNetworkAllowed).toHaveBeenCalledTimes(1);
  });

  it('requires keys for hosted services', async () => {
    mockGetService.mockResolvedValue({ ...configuration, api_key: null });
    await expect(transcribeVoiceAudio(params)).rejects.toThrow(
      'API key missing'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a transcription default rather than a chat model for OpenAI', async () => {
    mockGetService.mockResolvedValue({
      ...configuration,
      service_type: 'openai',
      model_name: null,
    });
    fetchMock.mockResolvedValue(Response.json({ text: 'speech' }));
    await expect(transcribeVoiceAudio(params)).resolves.toMatchObject({
      model: 'gpt-4o-mini-transcribe',
    });
  });

  it('does not expose upstream error bodies or follow redirects', async () => {
    fetchMock.mockResolvedValue(
      new Response('secret provider details', {
        status: 302,
        headers: { location: 'http://127.0.0.1/' },
      })
    );
    await expect(transcribeVoiceAudio(params)).rejects.toMatchObject({
      statusCode: 502,
      message: 'Voice transcription provider returned HTTP 302.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it.each([{}, { text: 12 }, { text: ' ' }])(
    'rejects malformed or empty transcription responses: %j',
    async (payload) => {
      mockGetService.mockResolvedValue({
        ...configuration,
        service_type: 'openai',
      });
      fetchMock.mockResolvedValue(Response.json(payload));
      await expect(transcribeVoiceAudio(params)).rejects.toMatchObject({
        statusCode: 502,
      });
    }
  );

  it('propagates cancellation to the upstream request', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      transcribeVoiceAudio({ ...params, signal: controller.signal })
    ).rejects.toMatchObject({ statusCode: 504 });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
