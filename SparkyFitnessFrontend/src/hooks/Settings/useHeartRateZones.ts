import { preferencesKeys } from '@/api/keys/settings';
import {
  getHeartRateZones,
  updateHeartRateZones,
} from '@/api/Settings/heartRateZones';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  defaultHeartRateZones,
  heartRateDisplayBands,
  type HeartRateZonesResponse,
  type ResolvedHeartRateZones,
  type UpdateHeartRateZonesBody,
} from '@workspace/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const useHeartRateZones = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  return useQuery({
    queryKey: preferencesKeys.heartRateZones(),
    queryFn: getHeartRateZones,
    enabled: !!user,
    meta: {
      errorMessage: t(
        'settings.heartRateZones.failedToLoad',
        'Failed to load heart rate zones.'
      ),
    },
  });
};

export const useUpdateHeartRateZonesMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (body: UpdateHeartRateZonesBody) => updateHeartRateZones(body),
    onSuccess: (data: HeartRateZonesResponse) => {
      queryClient.setQueryData(preferencesKeys.heartRateZones(), data);
    },
    meta: {
      errorMessage: t(
        'settings.heartRateZones.failedToSave',
        'Failed to save heart rate zones. Check the values and try again.'
      ),
      successMessage: t(
        'settings.heartRateZones.saved',
        'Heart rate zones saved.'
      ),
    },
  });
};

/**
 * The person's resolved zones for a chart or legend. Until their zones load
 * (or when the request fails) this is the shared default, `isDefault` true,
 * so a report can say the zones are not confirmed yet. `bands` is what to
 * draw: five zones, or four tiers if the person chose that.
 */
export const useResolvedHeartRateZones = () => {
  const { data } = useHeartRateZones();
  return useMemo(() => {
    const resolved: ResolvedHeartRateZones = data
      ? {
          maxHr: data.resolved.max_hr,
          maxHrSource: data.resolved.max_hr_source,
          restingHr: data.resolved.resting_hr,
          method: data.resolved.method,
          effectiveMethod: data.resolved.effective_method,
          floors: data.resolved.zones.map((z) => z.lower_bpm),
          zones: data.resolved.zones.map((z) => ({
            zone: z.zone,
            lowerBpm: z.lower_bpm,
            upperBpm: z.upper_bpm,
          })),
        }
      : defaultHeartRateZones();
    const displayZones = data?.settings.display_zones ?? 5;
    return {
      resolved,
      isDefault: !data,
      displayZones,
      bands: heartRateDisplayBands(resolved.zones, displayZones),
    };
  }, [data]);
};
