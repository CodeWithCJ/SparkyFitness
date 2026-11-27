import chatRepository from '../models/chatRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import {
  resolveAiNetworkPolicy,
  type AiNetworkPolicy,
} from '../utils/outboundUrlPolicy.js';
import type { ProviderConfig } from './providerDispatch.js';

export interface ResolvedAiProvider {
  provider: ProviderConfig;
  networkPolicy: AiNetworkPolicy;
}

/**
 * The person's active AI service as a dispatch config, for work that has no
 * request behind it (a scheduled job) or that wants the one-shot path instead
 * of the chat stream. Null when they have no usable service.
 *
 * `actorIsAdmin` is for callers that already know it; without it the person's
 * own admin status decides which private-network URLs their service may use.
 */
export async function resolveTextAiProvider(
  userId: string,
  actorIsAdmin?: boolean
): Promise<ResolvedAiProvider | null> {
  const setting = await chatRepository.getActiveAiServiceSetting(userId);
  if (!setting) return null;
  const aiService = await chatRepository.getAiServiceSettingForBackend(
    setting.id,
    userId
  );
  if (!aiService) return null;
  return {
    provider: {
      service_type: aiService.service_type,
      api_key: aiService.api_key ?? undefined,
      model_name: aiService.model_name ?? undefined,
      custom_url: aiService.custom_url ?? undefined,
    },
    networkPolicy: await resolveAiNetworkPolicy(
      aiService,
      actorIsAdmin ?? (await resolveIsAdminByUserId(userId))
    ),
  };
}
