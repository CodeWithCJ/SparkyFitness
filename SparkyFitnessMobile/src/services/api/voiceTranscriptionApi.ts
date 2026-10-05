import { File } from 'expo-file-system';
import {
  MAX_VOICE_UPLOAD_BYTES,
  voiceTranscriptionResponseSchema,
  type VoiceTranscriptionResponse,
} from '@workspace/shared';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { normalizeUrl } from './apiClient';
import { ApiError } from './errors';
import { fetchWithTimeout } from '../../utils/concurrency';

const VOICE_TRANSCRIPTION_TIMEOUT_MS = 90_000;

export type VoiceTranscriptionResult = VoiceTranscriptionResponse;

export async function transcribeVoiceRecording(params: {
  uri: string;
  serviceConfigId: string;
  mimeType?: string;
  signal?: AbortSignal;
}): Promise<VoiceTranscriptionResult> {
  const { uri, serviceConfigId, mimeType = 'audio/mp4', signal } = params;
  const config = await getActiveServerConfig();
  if (!config) throw new Error('Server configuration not found.');

  const baseUrl = normalizeUrl(config.url);
  if (!__DEV__ && !baseUrl.toLowerCase().startsWith('https://')) {
    throw new Error('Voice transcription requires an HTTPS server.');
  }
  const file = new File(uri);
  if (file.size > MAX_VOICE_UPLOAD_BYTES) {
    throw new Error('Voice recordings must be no larger than 10 MB.');
  }
  const form = new FormData();
  form.append('service_config_id', serviceConfigId);
  form.append('mime_type', mimeType);
  form.append('audio', file);

  const response = await fetchWithTimeout(
    `${baseUrl}/api/chat/transcribe`,
    {
      method: 'POST',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      body: form,
      signal,
    },
    VOICE_TRANSCRIPTION_TIMEOUT_MS
  );

  if (!response.ok) {
    if (response.status === 401 && config.authType === 'session') {
      notifySessionExpired(config.id);
    }
    const detail = await response.text();
    throw new ApiError(
      `Voice transcription failed: ${response.status} - ${detail}`,
      response.status,
      detail
    );
  }

  return voiceTranscriptionResponseSchema.parse(await response.json());
}
