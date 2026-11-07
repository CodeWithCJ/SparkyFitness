/** Glucose molar mass conversion, used at import and display boundaries. */
export const BLOOD_GLUCOSE_MG_DL_PER_MMOL_L = 18.018;

/** Display preference only; persisted samples always use mmol/L. */
export const GLUCOSE_UNITS = ['mmol/L', 'mg/dL'] as const;
export type GlucoseUnit = (typeof GLUCOSE_UNITS)[number];
export const DEFAULT_GLUCOSE_UNIT: GlucoseUnit = 'mmol/L';
export const isGlucoseUnit = (value: unknown): value is GlucoseUnit =>
  typeof value === 'string' &&
  (GLUCOSE_UNITS as readonly string[]).includes(value);
