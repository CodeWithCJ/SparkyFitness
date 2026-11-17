import { isHealthActivityType } from '@workspace/shared';

/** Select value meaning "no override": the type is guessed (#1750). */
export const AUTOMATIC_HEALTH_ACTIVITY_TYPE = 'automatic';

/** The stored override as a select value: a known key, else Automatic. */
export function healthActivityTypeSelectValue(value: unknown): string {
  return isHealthActivityType(value) ? value : AUTOMATIC_HEALTH_ACTIVITY_TYPE;
}
