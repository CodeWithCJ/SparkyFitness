import {
  DEFAULT_HEART_RATE_ZONE_SETTINGS,
  customFloorsProblem,
  resolveHeartRateZones,
  todayInZone,
  type HeartRateZoneSettings,
  type HeartRateZonesResponse,
  type ResolvedHeartRateZones,
  type UpdateHeartRateZonesBody,
} from '@workspace/shared';
import {
  getHeartRateZoneSettings,
  saveHeartRateZoneSettings,
} from '../models/heartRateZoneRepository.js';
import userRepository from '../models/userRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { ValidationError } from '../utils/errors.js';

/**
 * The person's zones as of today: their saved settings plus their date of
 * birth for the age formula. Every server consumer (stored time in zone,
 * training load, the settings screen) goes through this, so they agree.
 * `observedMaxBpm` only matters for someone with no date of birth.
 */
async function resolveZonesForUser(
  userId: string,
  observedMaxBpm?: number | null
): Promise<ResolvedHeartRateZones> {
  const [settings, profile, timezone] = await Promise.all([
    getHeartRateZoneSettings(userId),
    userRepository.getUserProfile(userId),
    loadUserTimezone(userId),
  ]);
  return resolveHeartRateZones({
    settings,
    dateOfBirth: profile?.date_of_birth,
    today: todayInZone(timezone),
    observedMaxBpm,
  });
}

function toResponse(
  settings: HeartRateZoneSettings,
  resolved: ResolvedHeartRateZones
): HeartRateZonesResponse {
  return {
    settings: {
      max_heart_rate: settings.maxHeartRate,
      resting_heart_rate: settings.restingHeartRate,
      method: settings.method,
      custom_floors: settings.customFloors,
      display_zones: settings.displayZones,
    },
    resolved: {
      max_hr: resolved.maxHr,
      max_hr_source: resolved.maxHrSource,
      resting_hr: resolved.restingHr,
      method: resolved.method,
      effective_method: resolved.effectiveMethod,
      zones: resolved.zones.map((zone) => ({
        zone: zone.zone,
        lower_bpm: zone.lowerBpm,
        upper_bpm: zone.upperBpm,
      })),
    },
  };
}

async function describeZones(
  userId: string,
  settings: HeartRateZoneSettings
): Promise<HeartRateZonesResponse> {
  const [profile, timezone] = await Promise.all([
    userRepository.getUserProfile(userId),
    loadUserTimezone(userId),
  ]);
  const resolved = resolveHeartRateZones({
    settings,
    dateOfBirth: profile?.date_of_birth,
    today: todayInZone(timezone),
  });
  return toResponse(settings, resolved);
}

async function getHeartRateZones(
  userId: string,
  authenticatedUserId: string
): Promise<HeartRateZonesResponse> {
  const settings = await getHeartRateZoneSettings(userId, authenticatedUserId);
  return describeZones(userId, settings);
}

/**
 * Saves a change to the settings. Settings only shape workouts stored from now
 * on and what the app shows; stored time in zone is never recomputed.
 */
async function updateHeartRateZones(
  userId: string,
  authenticatedUserId: string,
  body: UpdateHeartRateZonesBody
): Promise<HeartRateZonesResponse> {
  const current = body.reset
    ? { ...DEFAULT_HEART_RATE_ZONE_SETTINGS }
    : await getHeartRateZoneSettings(userId, authenticatedUserId);

  const next: HeartRateZoneSettings = body.reset
    ? current
    : {
        maxHeartRate:
          body.max_heart_rate === undefined
            ? current.maxHeartRate
            : body.max_heart_rate,
        restingHeartRate:
          body.resting_heart_rate === undefined
            ? current.restingHeartRate
            : body.resting_heart_rate,
        method: body.method ?? current.method,
        customFloors:
          body.custom_floors === undefined
            ? current.customFloors
            : body.custom_floors,
        displayZones: body.display_zones ?? current.displayZones,
      };

  if (next.method === 'custom') {
    const problem = customFloorsProblem(next.customFloors);
    if (problem) throw new ValidationError(problem);
  }
  if (next.method === 'heart_rate_reserve') {
    if (next.restingHeartRate === null) {
      throw new ValidationError(
        'Heart rate reserve zones need a resting heart rate.'
      );
    }
    const described = await describeZones(userId, next);
    if (next.restingHeartRate >= described.resolved.max_hr) {
      throw new ValidationError(
        'Resting heart rate must be below max heart rate.'
      );
    }
  }
  if (
    next.maxHeartRate !== null &&
    next.restingHeartRate !== null &&
    next.restingHeartRate >= next.maxHeartRate
  ) {
    throw new ValidationError(
      'Resting heart rate must be below max heart rate.'
    );
  }

  const saved = await saveHeartRateZoneSettings(
    userId,
    authenticatedUserId,
    next
  );
  return describeZones(userId, saved);
}

export default {
  resolveZonesForUser,
  getHeartRateZones,
  updateHeartRateZones,
};
