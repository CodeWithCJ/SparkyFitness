import { useQuery } from '@tanstack/react-query';

import { fetchSkinTemperatureRows } from '../services/api/skinTemperatureApi';
import { addDays } from '../utils/dateUtils';
import {
  nightSkinTemperature,
  SKIN_TEMPERATURE_BASELINE_DAYS,
  type NightSkinTemperature,
} from '../utils/skinTemperature';
import { skinTemperatureQueryKey } from './queryKeys';

/**
 * Skin temperature for the night that ended on `wakeDay`, with how far it was from
 * the usual. Null when no source has reported one; a failed load also reads as
 * null, since the row is a bonus on the Sleep Details screen, not its content.
 */
export function useSkinTemperature(wakeDay: string | undefined) {
  const start = wakeDay
    ? addDays(wakeDay, -SKIN_TEMPERATURE_BASELINE_DAYS)
    : '';

  const query = useQuery({
    queryKey: skinTemperatureQueryKey(start, wakeDay ?? ''),
    queryFn: () => fetchSkinTemperatureRows(start, wakeDay as string),
    enabled: !!wakeDay,
    select: (rows): NightSkinTemperature | null =>
      wakeDay ? nightSkinTemperature(rows, wakeDay) : null,
  });

  return query.data ?? null;
}
