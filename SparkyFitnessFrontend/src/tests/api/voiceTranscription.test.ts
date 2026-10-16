import { apiCall } from '@/api/api';
import { transcribeVoiceRecording } from '@/api/Chatbot/voiceTranscription';
import { MAX_VOICE_UPLOAD_BYTES } from '@workspace/shared';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
const call = jest.mocked(apiCall);
const audio = new Blob(['speech'], { type: 'audio/webm;codecs=opus' });
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

it('posts multipart audio to the authenticated API and validates the transcript', async () => {
  call.mockResolvedValue({ text: '  An apple  ', model: 'voice-model' });
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, 'removeEventListener');
  await expect(
    transcribeVoiceRecording(audio, 'voice-id', controller.signal)
  ).resolves.toEqual({ text: 'An apple', model: 'voice-model' });
  const [endpoint, options] = call.mock.calls[0]!;
  expect(endpoint).toBe('/chat/transcribe');
  expect(options).toMatchObject({ method: 'POST', isFormData: true });
  const form = options?.body as FormData;
  expect(form.get('service_config_id')).toBe('voice-id');
  expect(form.get('mime_type')).toBe('audio/webm');
  expect(form.get('audio')).toBeInstanceOf(File);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(jest.getTimerCount()).toBe(0);
});

it('rejects oversized and empty recordings before issuing a request', async () => {
  for (const blob of [
    new Blob([]),
    new Blob([new Uint8Array(MAX_VOICE_UPLOAD_BYTES + 1)]),
  ]) {
    await expect(
      transcribeVoiceRecording(blob, 'voice-id', new AbortController().signal)
    ).rejects.toThrow('Invalid voice recording size');
  }
  expect(call).not.toHaveBeenCalled();
});

it('does not upload an already-cancelled recording', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    transcribeVoiceRecording(audio, 'voice-id', controller.signal)
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(call).not.toHaveBeenCalled();
});

it('rejects invalid provider responses', async () => {
  call.mockResolvedValue({ text: '', model: 'voice-model' });
  await expect(
    transcribeVoiceRecording(audio, 'voice-id', new AbortController().signal)
  ).rejects.toThrow();
  expect(jest.getTimerCount()).toBe(0);
});

it.each(['caller', 'timeout'])(
  'aborts and cleans up on %s cancellation',
  async (kind) => {
    call.mockImplementation(
      (_endpoint, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    const controller = new AbortController();
    const result = transcribeVoiceRecording(
      audio,
      'voice-id',
      controller.signal
    );
    const rejection = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    });
    if (kind === 'caller') controller.abort();
    else jest.advanceTimersByTime(90_000);
    await rejection;
    expect(call.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  }
);
