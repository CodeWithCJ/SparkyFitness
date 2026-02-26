import { query } from "../../db.js";

/**
 * Logging helper for the Food/Nutrition domain
 */
export const log = (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[Nutrition] [${timestamp}] ${message}${data ? ': ' + JSON.stringify(data, null, 2) : ''}`;
    console.error(logMessage);
};

/**
 * Helper to get meal type ID from name
 */
export const getMealTypeId = async (name: string) => {
    log(`Getting meal type ID for: ${name}`);
    const res = await query("SELECT id FROM meal_types WHERE LOWER(name) = LOWER($1) LIMIT 1", [name || 'breakfast']);
    if (res.rows.length === 0) {
        log(`No exact match for meal type "${name}", fetching default.`);
        const defaultRes = await query("SELECT id FROM meal_types ORDER BY sort_order LIMIT 1");
        return defaultRes.rows[0]?.id;
    }
    return res.rows[0].id;
};

export const NUTRIENT_KEYS = [
    'calories', 'protein', 'carbs', 'fat', 'saturated_fat', 'polyunsaturated_fat', 
    'monounsaturated_fat', 'trans_fat', 'cholesterol', 'sodium', 'potassium', 
    'dietary_fiber', 'sugars', 'vitamin_a', 'vitamin_c', 'calcium', 'iron'
];

/**
 * Unit Conversion Helpers
 */
export const convertUnit = (value: number, fromUnit: string, toUnit: string): number | null => {
    if (!fromUnit || !toUnit) return value;
    const from = fromUnit.toLowerCase();
    const to = toUnit.toLowerCase();

    if (from === to) return value;

    // Volume conversions (Base: ml)
    const volumeRates: Record<string, number> = {
        'ml': 1,
        'l': 1000,
        'liter': 1000,
        'oz': 29.5735, // US fluid ounce
        'cup': 236.588, // US cup
        'tbsp': 14.7868,
        'tsp': 4.9289
    };

    if (volumeRates[from] && volumeRates[to]) {
        const mlValue = value * volumeRates[from];
        return mlValue / volumeRates[to];
    }

    // Mass conversions (Base: g)
    const massRates: Record<string, number> = {
        'g': 1,
        'kg': 1000,
        'mg': 0.001,
        'lb': 453.592,
        'lbs': 453.592,
        'oz': 28.3495
    };
    
    // Check for "oz" ambiguity - usually context dependent, but we'll try mass if volume failed
    if (massRates[from] && massRates[to]) {
        const gValue = value * massRates[from];
        return gValue / massRates[to];
    }

    return null; // Conversion not possible or unknown units
};
