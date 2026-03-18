/**
 * Centralized precision settings (decimal points) for various measurement units.
 */
export const MEASUREMENT_PRECISION = {
  weight: {
    kg: 1,
    lbs: 1,
    st_lbs: 1, // Decimal point for the 'lbs' part
  },
  height: {
    cm: 0, // Whole numbers usually for height
    inches: 1,
    ft_in: 1, // Decimal point for the 'in' part
  },
  measurement: {
    cm: 1, // 0.1 cm resolution for waist/neck/etc.
    inches: 1,
    '%': 1, // Body fat, etc.
    bpm: 0, // Heart rate
    mmHg: 0, // Blood pressure
    '°C': 1, // Temperature
    '°F': 1, // Temperature
    'step': 0,
    'count': 0,
    'kcal': 0, // Calories
    'g': 1,    // Macros (Proteins/Carbs/Fats)
    'mg/dL': 0, // Blood Glucose (US)
    'mmol/L': 1, // Blood Glucose (International)
    'ml/kg/min': 1, // VO2 Max
    'W': 0, // Power
    'rpm': 0, // Cadence (Cyclist)
    'spm': 0, // Cadence (Runner)
    'km': 2,   // Distance
    'miles': 2, // Distance
    'min': 0, // Duration
    'hour': 1, // Duration
  },
} as const;

export type MeasurementType = keyof typeof MEASUREMENT_PRECISION;
export type MeasurementUnit<T extends MeasurementType> = keyof (typeof MEASUREMENT_PRECISION)[T];

/**
 * Gets the decimal precision for a specific measurement unit.
 */
export const getPrecision = (
  type: MeasurementType,
  unit: string
): number => {
  const precisionMap = MEASUREMENT_PRECISION[type] as Record<string, number>;
  
  // Try exact match
  if (precisionMap && precisionMap[unit] !== undefined) {
    return precisionMap[unit];
  }

  // Fallback defaults for common fitness categories
  if (type === 'weight') return 1;
  if (type === 'measurement') {
    // Universal standard: if we don't know the unit, 1 decimal is safer 
    // unless it's a known integer count (which we caught above).
    return 1; 
  }

  return 0;
};
