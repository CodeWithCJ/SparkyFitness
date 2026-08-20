import type { TFunction } from 'i18next';
import i18n from '../localization/i18n';
import { BUILT_IN_CYCLE_SYMPTOMS } from '@workspace/shared';

const defaultTranslator: TFunction = i18n.t.bind(i18n);
function resolveTranslator(t?: TFunction): TFunction {
  return t ?? defaultTranslator;
}

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
  t?: TFunction,
): string {
  if (symptom == null || symptom.trim() === '') return symptom ?? '';
  const translate = resolveTranslator(t);
  const key = DISPLAY_TO_KEY.get(symptom.trim().toLowerCase());
  if (key) {
    return translate(`cycleSymptoms.items.${key}`, {
      defaultValue: symptom,
    });
  }
  return symptom;
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
  'ovulation_today',
]);

/**
 * Localizes a controlled cycle-anomaly by its stable `key`. Unknown / future
 * keys fall back to the server-provided message literally (we never parse
 * English prose into t()).
 */
export function localizeCycleAnomaly(
  key: string,
  fallbackMessage: string,
  t?: TFunction,
): string {
  const translate = resolveTranslator(t);
  if (ANOMALY_KEYS.has(key)) {
    return translate(`cycleInsights.anomaly.${key}`, {
      defaultValue: fallbackMessage,
    });
  }
  return fallbackMessage;
}

/**
 * Localizes a controlled cycle alert (from buildCycleAlerts) by its stable key.
 * Handles both the period/ovulation alert keys and the anomaly keys that also
 * flow through as alerts. Unknown / future keys fall back to the server message
 * literally.
 */
export function localizeCycleAlert(
  key: string,
  fallbackMessage: string,
  t?: TFunction,
): string {
  const translate = resolveTranslator(t);
  if (ALERT_KEYS.has(key)) {
    return translate(`cycleInsights.alert.${key}`, {
      defaultValue: fallbackMessage,
    });
  }
  return localizeCycleAnomaly(key, fallbackMessage, translate);
}
