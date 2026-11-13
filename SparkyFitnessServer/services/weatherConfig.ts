import { WEATHER_PROVIDER_TYPE } from '@workspace/shared';
import { log } from '../config/logging.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { describeError } from '../utils/errors.js';
import {
  resolveProviderEndpoint,
  type ProviderEndpoint,
} from './providerEndpoint.js';

/** An Open-Meteo compatible endpoint a person may use, checked for use. */
export interface ResolvedWeatherProvider extends ProviderEndpoint {
  /** The API key for a commercial endpoint; undefined when none was stored. */
  apiKey?: string;
}

/**
 * The weather service this person should use, or null when the lookup is off
 * for them: the weather provider they added, or one the admin made public or
 * a family member shared. A new or edited provider applies on the next
 * lookup; nothing about the provider is cached.
 */
export async function resolveWeatherProvider(
  userId: string
): Promise<ResolvedWeatherProvider | null> {
  try {
    const row = await externalProviderRepository.getActiveProviderWithKeyByType(
      userId,
      WEATHER_PROVIDER_TYPE
    );
    if (!row) return null;
    const endpoint = await resolveProviderEndpoint(row, 'Weather provider');
    if (!endpoint) return null;
    return { ...endpoint, apiKey: row.app_key?.trim() || undefined };
  } catch (error) {
    log(
      'warn',
      `Could not look up the weather provider: ${describeError(error)}`
    );
    return null;
  }
}
