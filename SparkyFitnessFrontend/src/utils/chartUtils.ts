/**
 * Chart utilities for improving readability
 * Implements auto-scaling y-axis with smart domain calculation
 * Addresses Issue #144: Improve plot readability
 */

export interface ChartDataPoint {
  [key: string]: any;
  date?: string;
  entry_date?: string;
}

/**
 * Calculate smart Y-axis domain for better chart readability
 * @param data Array of data points
 * @param dataKey The key to extract values from
 * @param options Configuration options
 * @returns [min, max] domain array or undefined for auto-scaling
 */
export function calculateSmartYAxisDomain(
  data: ChartDataPoint[],
  dataKey: string,
  options: {
    marginPercent?: number; // Default: 10% margin
    useZeroBaseline?: boolean; // Force zero baseline
    minRangeThreshold?: number; // If range is small relative to max, use zero baseline
    forceMin?: number; // Force a specific minimum value for the Y-axis
  } = {}
): [number, number] | [number, string] | undefined {
  const { marginPercent = 0.1, useZeroBaseline = false, minRangeThreshold = 0.3, forceMin } = options;

  if (!data || data.length === 0) {
    return undefined;
  }

  // Extract valid numeric values
  const values = data
    .map(item => typeof item[dataKey] === 'number' ? item[dataKey] : null)
    .filter((val): val is number => val !== null && !isNaN(val));

  if (values.length === 0) {
    return undefined;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // If all values are the same, use a small range around the value
  if (range === 0) {
    const value = values[0];
    return value === 0 ? [0, 1] : [value * 0.95, value * 1.05];
  }

  // Use min-max with margin for better visibility of trends
  const margin = range * marginPercent;
  let domainMin = min - margin;
  let domainMax = max + margin;

  if (forceMin !== undefined) {
    domainMin = forceMin;
  } else if (useZeroBaseline) {
    domainMin = Math.min(0, domainMin); // Ensure it starts at 0 or below if useZeroBaseline is true
  } else {
    // If not using zero baseline, and min is positive, ensure domainMin doesn't go negative
    if (min >= 0 && domainMin < 0) {
      domainMin = 0;
    }
  }

  return [domainMin, domainMax];
}

/**
 * Filter out current incomplete day from nutrition data
 * @param data Array of nutrition data points
 * @param currentDate Current date string (YYYY-MM-DD)
 * @returns Filtered data array excluding current day
 */
export function excludeIncompleteDay(
  data: ChartDataPoint[],
  currentDate: string
): ChartDataPoint[] {
  if (!data || data.length === 0) {
    return data;
  }

  const today = new Date(currentDate).toDateString();

  return data.filter(item => {
    const itemDate = item.date || item.entry_date;
    if (!itemDate) return true;

    // Convert item date to same format for comparison
    const itemDateObj = new Date(itemDate);
    return itemDateObj.toDateString() !== today;
  });
}

/**
 * Check if data represents nutrition/calorie metrics that should exclude incomplete days
 * @param dataKey The metric key being displayed
 * @returns true if this metric should exclude incomplete days
 */
export function shouldExcludeIncompleteDay(dataKey: string): boolean {
  const nutritionMetrics = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'saturated_fat',
    'polyunsaturated_fat',
    'monounsaturated_fat',
    'trans_fat',
    'cholesterol',
    'sodium',
    'potassium',
    'dietary_fiber',
    'sugars',
    'vitamin_a',
    'vitamin_c',
    'calcium',
    'iron'
  ];

  return nutritionMetrics.includes(dataKey.toLowerCase());
}

/**
 * Get chart configuration for different metric types
 * @param dataKey The metric key
 * @returns Configuration object with scaling preferences
 */
export function getChartConfig(dataKey: string) {
  const weightMetrics = ['weight', 'neck', 'waist', 'hips'];
  const nutritionMetrics = ['calories', 'protein', 'carbs', 'fat'];
  const vitaminMetrics = ['vitamin_a', 'vitamin_c', 'calcium', 'iron'];

  if (weightMetrics.includes(dataKey.toLowerCase())) {
    return {
      useSmartScaling: true,
      excludeIncompleteDay: false,
      useZeroBaseline: false, // Explicitly set to false for weight charts
      marginPercent: 0.05, // Smaller margin for body measurements
      minRangeThreshold: 0.2, // More likely to use min-max scaling
      forceMin: undefined // Will be set dynamically in MeasurementChartsGrid
    };
  }

  if (nutritionMetrics.includes(dataKey.toLowerCase())) {
    return {
      useSmartScaling: true,
      excludeIncompleteDay: false,
      marginPercent: 0.1,
      minRangeThreshold: 0.3
    };
  }

  if (vitaminMetrics.includes(dataKey.toLowerCase())) {
    return {
      useSmartScaling: true,
      excludeIncompleteDay: false,
      marginPercent: 0.15, // Larger margin for micronutrients
      minRangeThreshold: 0.4
    };
  }

  // Default configuration
  return {
    useSmartScaling: true,
    excludeIncompleteDay: false,
    marginPercent: 0.1,
    minRangeThreshold: 0.3
  };
}