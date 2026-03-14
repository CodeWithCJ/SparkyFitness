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
  return (MEASUREMENT_PRECISION[type] as Record<string, number>)?.[unit] ?? 0;
};
