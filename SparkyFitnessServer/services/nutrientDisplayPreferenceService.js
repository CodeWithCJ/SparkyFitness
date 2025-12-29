const nutrientDisplayPreferenceRepository = require('../models/nutrientDisplayPreferenceRepository');
const customNutrientService = require('./customNutrientService');

const defaultNutrients = ['calories', 'protein', 'carbs', 'fat', 'dietary_fiber'];

const predefinedNutrients = [
    'calories', 'protein', 'carbs', 'fat', 'dietary_fiber', 'sugars', 'sodium',
    'cholesterol', 'saturated_fat', 'trans_fat', 'potassium',
    'vitamin_a', 'vitamin_c', 'iron', 'calcium', 'glycemic_index'
];

async function getAllNutrients(userId) {
    const customNutrients = await customNutrientService.getCustomNutrients(userId);
    const customNutrientNames = customNutrients.filter(cn => cn && cn.nutrient_name).map(cn => cn.nutrient_name.toLowerCase());
    return [...predefinedNutrients, ...customNutrientNames];
}

const defaultPreferences = [
    // Desktop
    { view_group: 'summary', platform: 'desktop', visible_nutrients: defaultNutrients },
    { view_group: 'quick_info', platform: 'desktop', visible_nutrients: defaultNutrients },
    { view_group: 'food_database', platform: 'desktop', visible_nutrients: [] }, // Will be populated dynamically
    { view_group: 'goal', platform: 'desktop', visible_nutrients: [] }, // Will be populated dynamically
    { view_group: 'report_tabular', platform: 'desktop', visible_nutrients: [] }, // Will be populated dynamically
    { view_group: 'report_chart', platform: 'desktop', visible_nutrients: [] }, // Will be populated dynamically
    // Mobile
    { view_group: 'summary', platform: 'mobile', visible_nutrients: defaultNutrients },
    { view_group: 'quick_info', platform: 'mobile', visible_nutrients: defaultNutrients },
    { view_group: 'food_database', platform: 'mobile', visible_nutrients: [] }, // Will be populated dynamically
    { view_group: 'goal', platform: 'mobile', visible_nutrients: [] }, // Will be populated dynamically
    { view_group: 'report_tabular', platform: 'mobile', visible_nutrients: [] }, // Will be populated dynamically
    { view_group: 'report_chart', platform: 'mobile', visible_nutrients: [] }, // Will be populated dynamically
];

async function getNutrientDisplayPreferences(userId) {
    const userPreferences = await nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences(userId);
    const allNutrientsDynamic = await getAllNutrients(userId);

    // Create a deep copy of defaultPreferences to avoid modifying the original
    const dynamicDefaultPreferences = JSON.parse(JSON.stringify(defaultPreferences));

    // Populate the dynamically set visible_nutrients
    dynamicDefaultPreferences.forEach(pref => {
        if (pref.view_group === 'food_database' || pref.view_group === 'goal' || pref.view_group === 'report_tabular' || pref.view_group === 'report_chart') {
            pref.visible_nutrients = allNutrientsDynamic;
        }
    });

    if (userPreferences && userPreferences.length > 0) {
        return userPreferences.map(p => ({...p, visible_nutrients: typeof p.visible_nutrients === 'string' ? JSON.parse(p.visible_nutrients) : p.visible_nutrients}));
    }
    return dynamicDefaultPreferences;
}

async function upsertNutrientDisplayPreference(userId, viewGroup, platform, visibleNutrients) {
    return await nutrientDisplayPreferenceRepository.upsertNutrientDisplayPreference(userId, viewGroup, platform, visibleNutrients);
}

async function resetNutrientDisplayPreference(userId, viewGroup, platform) {
    await nutrientDisplayPreferenceRepository.deleteNutrientDisplayPreference(userId, viewGroup, platform);
    return defaultPreferences.find(p => p.view_group === viewGroup && p.platform === platform);
}

async function createDefaultNutrientPreferencesForUser(userId) {
    return await nutrientDisplayPreferenceRepository.createDefaultNutrientPreferences(userId, defaultPreferences);
}

module.exports = {
    getNutrientDisplayPreferences,
    upsertNutrientDisplayPreference,
    resetNutrientDisplayPreference,
    createDefaultNutrientPreferencesForUser,
    getAllNutrients
};