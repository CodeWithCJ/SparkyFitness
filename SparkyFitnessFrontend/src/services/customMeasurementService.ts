import { apiCall } from './api';

export interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

export interface CustomMeasurement {
  id: string;
  category_id: string;
  value: string | number;
  notes?: string;
  entry_date: string;
  entry_hour: number | null;
  entry_timestamp: string;
  custom_categories: {
    name: string;
    display_name?: string | null;
    measurement_type: string;
    frequency: string;
    data_type: string;
  };
}

export interface StressDataPoint {
  time: string;
  stress_level: number;
}

export const getCustomCategories = async (
  userId?: string
): Promise<CustomCategory[]> => {
  const url = userId
    ? `/measurements/custom-categories?userId=${userId}`
    : '/measurements/custom-categories';
  return apiCall(url, {
    method: 'GET',
  });
};

export const getCustomMeasurements = async (
  userId?: string
): Promise<CustomMeasurement[]> => {
  const url = userId
    ? `/measurements/custom-entries?userId=${userId}`
    : '/measurements/custom-entries';
  return apiCall(url, {
    method: 'GET',
  });
};

export const getCustomMeasurementsForDate = async (
  date: string,
  userId?: string
): Promise<CustomMeasurement[]> => {
  const url = userId
    ? `/measurements/custom-entries/${userId}/${date}`
    : `/measurements/custom-entries/${date}`;
  return apiCall(url, {
    method: 'GET',
  });
};

export const saveCustomMeasurement = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurementData: any
): Promise<CustomMeasurement> => {
  return apiCall('/measurements/custom-entries', {
    method: 'POST', // Always use POST for new entries, backend will handle upsert logic
    body: measurementData,
  });
};

export const deleteCustomMeasurement = async (
  measurementId: string
): Promise<void> => {
  return apiCall(`/measurements/custom-entries/${measurementId}`, {
    method: 'DELETE',
  });
};

export const getRawStressData = async (
  userId?: string
): Promise<StressDataPoint[]> => {
  const categories = await getCustomCategories(userId);
  const rawStressCategory = categories.find(
    (cat) => cat.name === 'Raw Stress Data'
  );

  if (!rawStressCategory) {
    console.warn('Raw Stress Data category not found.');
    return [];
  }
  // console.log('Identified rawStressCategory:', rawStressCategory);

  const params = new URLSearchParams({ category_id: rawStressCategory.id });
  if (userId) params.append('userId', userId);

  const customMeasurements: CustomMeasurement[] = await apiCall(
    `/measurements/custom-entries?${params.toString()}`,
    {
      method: 'GET',
    }
  );

  let allStressDataPoints: StressDataPoint[] = [];
  // console.log('Custom measurements received for raw stress data:', customMeasurements);

  customMeasurements.forEach((measurement) => {
    try {
      if (typeof measurement.value === 'string') {
        let cleanedValue = measurement.value.trim();

        // Handle specific malformation: wrapper braces around a stringified object/array
        // e.g., '{"{...}"}' which causes "Expected ':'" errors in JSON.parse
        if (cleanedValue.startsWith('{"{') && cleanedValue.endsWith('}"}')) {
          cleanedValue = cleanedValue.substring(1, cleanedValue.length - 1);
        }

        // New logic to handle multiple JSON objects concatenated together
        // or a JSON object wrapped in quotes but with extra characters
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parseRobustly = (str: string): any => {
          try {
            return JSON.parse(str);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (e: any) {
            // Check if error is "unexpected character after JSON"
            // This happens if multiple JSON objects are joined together like {"a":1}{"b":2}
            if (
              e.message?.includes('Unexpected non-whitespace character') ||
              e.message?.includes('after JSON')
            ) {
              // Try to find if it's a sequence of objects
              // This is a naive but often effective way for simple objects
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const points: any[] = [];
              let remaining = str;
              while (remaining.length > 0) {
                try {
                  // This is tricky in JS, but we can try to find the matching brace
                  // or just try prefixes of decreasing length
                  let success = false;
                  for (let i = remaining.length; i > 0; i--) {
                    const chunk = remaining.substring(0, i);
                    const parsed = JSON.parse(chunk);
                    points.push(parsed);
                    remaining = remaining.substring(i).trim();
                    success = true;
                    break;
                  }
                  if (!success) break; // Cannot parse any more
                } catch (err) {
                  break;
                }
              }
              if (points.length > 0) return points;
            }
            throw e;
          }
        };

        let parsedValue;
        try {
          parsedValue = parseRobustly(cleanedValue);
        } catch (initialError) {
          // If it's still failing, try removing JUST the outer braces if they seem like extraneous wrappers
          if (
            cleanedValue.startsWith('{') &&
            cleanedValue.endsWith('}') &&
            !cleanedValue.includes(':')
          ) {
            const alternativeValue = cleanedValue.substring(
              1,
              cleanedValue.length - 1
            );
            parsedValue = parseRobustly(alternativeValue);
          } else {
            throw initialError;
          }
        }

        // Handle double-encoded JSON strings
        if (typeof parsedValue === 'string') {
          try {
            parsedValue = JSON.parse(parsedValue);
          } catch (e) {
            // Not a JSON string, keep as is
          }
        }

        if (Array.isArray(parsedValue)) {
          // Flatten if we got an array of arrays from the robust parser
          parsedValue.forEach((val) => {
            if (Array.isArray(val)) {
              allStressDataPoints = allStressDataPoints.concat(val);
            } else {
              allStressDataPoints.push(val as StressDataPoint);
            }
          });
        } else if (typeof parsedValue === 'object' && parsedValue !== null) {
          // If it's a single data point instead of an array
          allStressDataPoints.push(parsedValue as StressDataPoint);
        }
      }
    } catch (error) {
      console.error('Error parsing stress data point JSON:', {
        error: error instanceof Error ? error.message : error,
        value: measurement.value,
        id: measurement.id,
      });
    }
  });

  return allStressDataPoints;
};
