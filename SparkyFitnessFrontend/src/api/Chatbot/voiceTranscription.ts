import { apiCall } from '@/api/api';
import {
  MAX_VOICE_UPLOAD_BYTES,
  voiceTranscriptionResponseSchema,
} from '@workspace/shared';

export async function transcribeVoiceRecording(
  audio: Blob,
  serviceConfigId: string,
  signal: AbortSignal
) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!audio.size || audio.size > MAX_VOICE_UPLOAD_BYTES) {
    throw new Error('Invalid voice recording size.');
  }
  const mimeType = audio.type.split(';')[0]?.trim() || 'audio/webm';
  const extension =
    mimeType === 'audio/mp4'
      ? 'm4a'
      : mimeType === 'audio/ogg'
        ? 'ogg'
        : 'webm';
  const form = new FormData();
  form.append('service_config_id', serviceConfigId);
  form.append('mime_type', mimeType);
  form.append('audio', audio, `voice.${extension}`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 90_000);
  try {
    const response = await apiCall<unknown>('/chat/transcribe', {
      method: 'POST',
      body: form,
      isFormData: true,
      signal: controller.signal,
    });
    return voiceTranscriptionResponseSchema.parse(response);
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
