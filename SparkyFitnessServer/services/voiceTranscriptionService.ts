import { z } from 'zod';
import {
  supportsVoiceTranscriptionServiceType,
  type VoiceTranscriptionResponse,
} from '@workspace/shared';
import chatRepository from '../models/chatRepository.js';
import { getDefaultModel, getOpenAiCompatibleBaseUrl } from '../ai/config.js';
import {
  createGuardedFetch,
  resolveAiNetworkPolicy,
  getOutboundUrlBlockedError,
} from '../utils/outboundUrlPolicy.js';

const TRANSCRIPTION_TIMEOUT_MS = 90_000;
const transcriptionResponseSchema = z.object({ text: z.string() });
const googleResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(z.object({ text: z.string().optional() })),
      }),
    })
  ),
});

interface VoiceServiceConfiguration {
  service_type: string;
  model_name?: string | null;
  api_key?: string | null;
  custom_url?: string | null;
  supports_audio_input?: boolean;
  is_public?: boolean;
  source?: string;
}

export class VoiceTranscriptionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'VoiceTranscriptionError';
  }
}

function audioFilename(mimeType: string): string {
  if (mimeType.includes('wav')) return 'voice.wav';
  if (mimeType.includes('mpeg')) return 'voice.mp3';
  if (mimeType.includes('webm')) return 'voice.webm';
  if (mimeType.includes('ogg')) return 'voice.ogg';
  if (mimeType.includes('aac')) return 'voice.aac';
  return 'voice.m4a';
}

function resolveVoiceModel(service: VoiceServiceConfiguration): string {
  const model = service.model_name?.trim();
  if (model) return model;
  if (service.service_type === 'google') return getDefaultModel('google');
  if (service.service_type === 'openai') return 'gpt-4o-mini-transcribe';
  if (service.service_type === 'mistral') return 'voxtral-mini-latest';
  throw new VoiceTranscriptionError(
    'A transcription model is required for this AI service.'
  );
}

export async function transcribeVoiceAudio(params: {
  audio: Buffer;
  mimeType: string;
  serviceConfigId: string;
  userId: string;
  isAdmin?: boolean;
  signal?: AbortSignal;
}): Promise<VoiceTranscriptionResponse> {
  const {
    audio,
    mimeType,
    serviceConfigId,
    userId,
    isAdmin = false,
    signal,
  } = params;
  // The repository is owner/RLS scoped and rejects inactive configurations.
  const service: VoiceServiceConfiguration | null =
    await chatRepository.getAiServiceSettingForBackend(serviceConfigId, userId);
  if (!service) {
    throw new VoiceTranscriptionError(
      'AI service setting not found for the provided ID.',
      404
    );
  }
  if (!service.supports_audio_input) {
    throw new VoiceTranscriptionError(
      'AI voice transcription is not enabled for this model configuration.'
    );
  }
  if (!supportsVoiceTranscriptionServiceType(service.service_type)) {
    throw new VoiceTranscriptionError(
      `AI voice transcription is not supported for service type: ${service.service_type}`
    );
  }
  const keyOptional =
    service.service_type === 'custom' ||
    service.service_type === 'openai_compatible';
  if (!service.api_key && !keyOptional) {
    throw new VoiceTranscriptionError(
      'API key missing for selected AI service.'
    );
  }

  const model = resolveVoiceModel(service);
  // Recheck at connection time, not only when settings are saved: this also
  // covers DNS rebinding and never follows redirects with credentials/audio.
  const guardedFetch = createGuardedFetch(
    await resolveAiNetworkPolicy(service, isAdmin)
  );
  const timeout = AbortSignal.timeout(TRANSCRIPTION_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let url: string;
  let init: RequestInit;
  if (service.service_type === 'google') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    init = {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': service.api_key!,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Transcribe the audio exactly in its spoken language. Preserve punctuation and mixed-language technical terms. Return only the transcript, without commentary or formatting.',
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: audio.toString('base64'),
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    };
  } else {
    const baseUrl = getOpenAiCompatibleBaseUrl(
      service.service_type,
      service.custom_url
    );
    if (!baseUrl) {
      throw new VoiceTranscriptionError(
        `Custom URL is required for service type: ${service.service_type}`
      );
    }
    url = `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
    const form = new FormData();
    form.append('model', model);
    form.append(
      'file',
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      audioFilename(mimeType)
    );
    init = {
      headers: service.api_key
        ? { Authorization: `Bearer ${service.api_key}` }
        : {},
      body: form,
    };
  }

  let response: Response;
  try {
    response = await guardedFetch(url, {
      ...init,
      method: 'POST',
      signal: requestSignal,
    });
  } catch (error) {
    const blocked = getOutboundUrlBlockedError(error);
    if (blocked) throw blocked;
    if (requestSignal.aborted) {
      throw new VoiceTranscriptionError(
        'Voice transcription was cancelled or timed out.',
        504
      );
    }
    // Do not expose upstream response bodies/URLs, which can contain credentials.
    throw new VoiceTranscriptionError(
      'Unable to reach the voice transcription provider.',
      502
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new VoiceTranscriptionError(
      `Voice transcription provider returned HTTP ${response.status}.`,
      502
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  let text = '';
  if (service.service_type === 'google') {
    const parsed = googleResponseSchema.safeParse(payload);
    if (parsed.success) {
      text =
        parsed.data.candidates[0]?.content.parts
          .map((part) => part.text ?? '')
          .join(' ')
          .trim() ?? '';
    }
  } else {
    const parsed = transcriptionResponseSchema.safeParse(payload);
    if (parsed.success) text = parsed.data.text.trim();
  }
  if (!text) {
    throw new VoiceTranscriptionError(
      'The voice model returned an empty or invalid transcription.',
      502
    );
  }
  return { text, model };
}
