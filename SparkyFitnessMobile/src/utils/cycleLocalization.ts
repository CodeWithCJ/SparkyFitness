import type { TFunction } from 'i18next';
import { BUILT_IN_CYCLE_SYMPTOMS } from '@workspace/shared';


/**
 * Reverse map from a built-in cycle symptom's English `displayName` (the value
 * persisted as `symptom_name_snapshot`) to its snake_case `name` key, which the
 * `cycleSymptoms.items.*` catalog keys align with. Built only once.
 */
const DISPLAY_TO_KEY: ReadonlyMap<string, string> = new Map(
  BUILT_IN_CYCLE_SYMPTOMS.map((s) => [s.displayName.toLowerCase(), s.name]),
);

/**
 * Localizes a cycle symptom for presentation. Recognizes built-in symptoms by
 * their English displayName (e.g. "Cramps" -> cycleSymptoms.items.cramps) and
 * returns the localized label. Truly custom/user-defined symptom names are
 * returned literally (never passed through t()).
 */
export function localizeCycleSymptom(
  symptom: string | null | undefined,
  t: TFunction,
): string {
  if (symptom == null || symptom.trim() === '') return symptom ?? '';
  const translate = t;
  const key = DISPLAY_TO_KEY.get(symptom.trim().toLowerCase());
  if (key) {
    return translate(`cycleSymptoms.items.${key}`, {
      defaultValue: symptom,
    });
  }
  return symptom;
}

/** Structured numeric params carried by a controlled cycle anomaly/alert. */
export interface CycleMessageParams {
  days?: number;
  cycleLength?: number;
}

/** Controlled cycle-anomaly keys from shared detectAnomalies(). */
const ANOMALY_KEYS = new Set([
  'irregular_cycles',
  'short_cycle',
  'long_cycle',
  'heavy_bleeding',
  'unusual_discharge',
]);

/** Controlled cycle-alert keys from shared buildCycleAlerts(). */
const ALERT_KEYS = new Set([
  'late_period',
  'upcoming_period',
  'upcoming_period_today',
  'ovulation_today',
]);

/**
 * Localizes a controlled cycle-anomaly by its stable `key`. When the structured
 * numeric params are present (e.g. cycleLength) the dynamic, pluralized copy is
 * used. For KNOWN keys whose params are temporarily missing (e.g. a server that
 * predates the params contract), a localized generic fallback is used so the
 * copy never leaks English. Unknown / future keys always fall back to the server
 * message literally.
 */
export function localizeCycleAnomaly(
  key: string,
  fallbackMessage: string,
  t: TFunction,
  params?: CycleMessageParams,
): string {
  const translate = t;
  if (key === 'short_cycle') {
    if (params?.cycleLength != null) {
      return translate('cycleInsights.anomaly.short_cycle', {
        defaultValue: fallbackMessage,
        count: params.cycleLength,
      });
    }
    return translate('cycleInsights.anomaly.short_cycle_generic', {
      defaultValue: fallbackMessage,
    });
  }
  if (key === 'long_cycle') {
    if (params?.cycleLength != null) {
      return translate('cycleInsights.anomaly.long_cycle', {
        defaultValue: fallbackMessage,
        count: params.cycleLength,
      });
    }
    return translate('cycleInsights.anomaly.long_cycle_generic', {
      defaultValue: fallbackMessage,
    });
  }
  if (ANOMALY_KEYS.has(key)) {
    return translate(`cycleInsights.anomaly.${key}`, {
      defaultValue: fallbackMessage,
    });
  }
  return fallbackMessage;
}

/**
 * Localizes a controlled cycle alert (from buildCycleAlerts) by its stable key.
 * Uses structured numeric params (e.g. days) with i18next count pluralization;
 * handles late_period/upcoming_period and the anomaly keys that flow through as
 * alerts. Unknown / future keys fall back to the server message literally.
 */
export function localizeCycleAlert(
  key: string,
  fallbackMessage: string,
  t: TFunction,
  params?: CycleMessageParams,
): string {
  const translate = t;
  if (key === 'late_period' && params?.days != null) {
    return translate('cycleInsights.alert.late_period', {
      defaultValue: fallbackMessage,
      count: params.days,
    });
  }
  if (key === 'upcoming_period' && params?.days === 0) {
    return translate('cycleInsights.alert.upcoming_period_today', {
      defaultValue: fallbackMessage,
    });
  }
  if (key === 'upcoming_period' && params?.days != null) {
    return translate('cycleInsights.alert.upcoming_period', {
      defaultValue: fallbackMessage,
      count: params.days,
    });
  }
  if (key === 'upcoming_period_today') {
    return translate('cycleInsights.alert.upcoming_period_today', {
      defaultValue: fallbackMessage,
    });
  }
  if (ALERT_KEYS.has(key)) {
    return translate(`cycleInsights.alert.${key}`, {
      defaultValue: fallbackMessage,
    });
  }
  return localizeCycleAnomaly(key, fallbackMessage, t, params);
}
