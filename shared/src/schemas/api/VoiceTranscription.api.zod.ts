import { z } from "zod";

export const MAX_VOICE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const voiceAudioMimeTypeSchema = z.enum([
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]);

export const voiceTranscriptionRequestSchema = z.object({
  service_config_id: z.uuid(),
  mime_type: voiceAudioMimeTypeSchema.optional(),
});

export const voiceTranscriptionResponseSchema = z.object({
  text: z.string().trim().min(1),
  model: z.string().min(1),
});

const VOICE_SERVICE_TYPES = new Set([
  "google",
  "openai",
  "openai_compatible",
  "custom",
  "mistral",
]);

/** Supported transport only; each model configuration must also opt in to audio. */
export function supportsVoiceTranscriptionServiceType(
  serviceType: string | undefined,
): boolean {
  return !!serviceType && VOICE_SERVICE_TYPES.has(serviceType);
}

export const voiceInputPreferencesSchema = z.object({
  voice_input_enabled: z.boolean().optional(),
  active_voice_ai_service_id: z.uuid().nullable().optional(),
});

/** Public metadata only; provider credentials never reach either client. */
export const voiceServiceOptionSchema = z.object({
  id: z.string(),
  service_name: z.string(),
  service_type: z.string(),
  model_name: z.string().nullable().optional(),
  is_active: z.boolean(),
  supports_audio_input: z.boolean().optional(),
});
export const voiceServiceOptionsSchema = z.array(voiceServiceOptionSchema);
export type VoiceServiceOption = z.infer<typeof voiceServiceOptionSchema>;
export type VoiceInputPreferences = z.infer<typeof voiceInputPreferencesSchema>;

/** Suggest the chat configuration first, but never select it implicitly. */
export function getVoiceServiceOptions<T extends VoiceServiceOption>(
  services: readonly T[],
  chatServiceId?: string | null,
): T[] {
  return services
    .filter(
      (service) =>
        service.is_active &&
        service.supports_audio_input &&
        supportsVoiceTranscriptionServiceType(service.service_type),
    )
    .sort(
      (a, b) => Number(b.id === chatServiceId) - Number(a.id === chatServiceId),
    );
}

export type VoiceTranscriptionResponse = z.infer<
  typeof voiceTranscriptionResponseSchema
>;
