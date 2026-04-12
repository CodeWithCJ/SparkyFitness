import nutrientDisplayPreferenceRepository from '../models/nutrientDisplayPreferenceRepository.js';
import { log } from '../config/logging.js';
import customNutrientService from './customNutrientService.js';
const defaultNutrients = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
];
const predefinedNutrients = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
  'sugars',
  'sodium',
  'cholesterol',
  'saturated_fat',
  'monounsaturated_fat',
  'polyunsaturated_fat',
  'trans_fat',
  'potassium',
  'vitamin_a',
  'vitamin_c',
  'iron',
  'calcium',
  'glycemic_index',
];
/**
 * Automatically adds a nutrient to specific view groups if it's not already present.
 * Target views: food_database, goal, report_tabular, report_chart
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function addNutrientToSpecificViews(userId: any, nutrientName: any) {
  const targetGroups = [
    'food_database',
    'goal',
    'report_tabular',
    'report_chart',
  ];
  const platforms = ['desktop', 'mobile'];
  log(
    'debug',
    `addNutrientToSpecificViews: Start for user ${userId}, nutrient: ${nutrientName}`
  );
  // Get raw customizations from DB to avoid fallback logic interference
  const rawUserPrefs =
    await nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences(
      userId
    );
  // Get all currently known nutrients to build a full list for new records
  const allKnownNutrients = await getAllNutrients(userId);
  if (!allKnownNutrients.includes(nutrientName)) {
    allKnownNutrients.push(nutrientName);
  }
  for (const group of targetGroups) {
    for (const platform of platforms) {
      const existing = rawUserPrefs.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.view_group === group && p.platform === platform
      );
      let visibleNutrients;
      if (existing) {
        // User has a custom record, append to it if missing
        visibleNutrients =
          typeof existing.visible_nutrients === 'string'
            ? JSON.parse(existing.visible_nutrients)
            : existing.visible_nutrients;
        if (!visibleNutrients.includes(nutrientName)) {
          visibleNutrients.push(nutrientName);
          log(
            'debug',
            `addNutrientToSpecificViews: Updating existing record for ${group}/${platform}`
          );
          await upsertNutrientDisplayPreference(
            userId,
            group,
            platform,
            visibleNutrients
          );
        }
      } else {
        // No custom record, create one using the full current list
        log(
          'debug',
          `addNutrientToSpecificViews: Creating new record for ${group}/${platform} with all nutrients`
        );
        await upsertNutrientDisplayPreference(
          userId,
          group,
          platform,
          allKnownNutrients
        );
      }
    }
  }
}
/**
 * Removes a nutrient from all display preferences for a user.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function removeNutrientFromAllViews(userId: any, nutrientName: any) {
  log(
    'info',
    `removeNutrientFromAllViews: Removing nutrient ${nutrientName} for user ${userId}`
  );
  const rawUserPrefs =
    await nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences(
      userId
    );
  for (const pref of rawUserPrefs) {
    const visibleNutrients =
      typeof pref.visible_nutrients === 'string'
        ? JSON.parse(pref.visible_nutrients)
        : pref.visible_nutrients;
    if (visibleNutrients.includes(nutrientName)) {
      const updatedNutrients = visibleNutrients.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n: any) => n !== nutrientName
      );
      log(
        'debug',
        `removeNutrientFromAllViews: Updating ${pref.view_group}/${pref.platform} for user ${userId}`
      );
      await upsertNutrientDisplayPreference(
        userId,
        pref.view_group,
        pref.platform,
        updatedNutrients
      );
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAllNutrients(userId: any) {
  const customNutrients =
    await customNutrientService.getCustomNutrients(userId);
  const customNutrientNames = customNutrients
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((cn: any) => cn && cn.name)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((cn: any) => cn.name); // Keep original casing for custom nutrients
  return [...predefinedNutrients, ...customNutrientNames];
}
const defaultPreferences = [
  // Desktop
  {
    view_group: 'summary',
    platform: 'desktop',
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: 'quick_info',
    platform: 'desktop',
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: 'food_database',
    platform: 'desktop',
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: 'goal',
    platform: 'desktop',
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: 'report_tabular',
    platform: 'desktop',
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: 'report_chart',
    platform: 'desktop',
    visible_nutrients: predefinedNutrients,
  },
  // Mobile
  {
    view_group: 'summary',
    platform: 'mobile',
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: 'quick_info',
    platform: 'mobile',
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: 'food_database',
    platform: 'mobile',
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: 'goal',
    platform: 'mobile',
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: 'report_tabular',
    platform: 'mobile',
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: 'report_chart',
    platform: 'mobile',
    visible_nutrients: predefinedNutrients,
  },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNutrientDisplayPreferences(userId: any) {
  const userPreferencesRaw =
    await nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences(
      userId
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userPreferences = userPreferencesRaw.map((p: any) => ({
    ...p,

    visible_nutrients:
      typeof p.visible_nutrients === 'string'
        ? JSON.parse(p.visible_nutrients)
        : p.visible_nutrients,
  }));
  const allNutrientsDynamic = await getAllNutrients(userId);
  // Return a complete list of 12 preferences (6 groups x 2 platforms)
  const viewGroups = [
    'summary',
    'quick_info',
    'food_database',
    'goal',
    'report_tabular',
    'report_chart',
  ];
  const platforms = ['desktop', 'mobile'];
  const completePreferences = [];
  for (const group of viewGroups) {
    for (const platform of platforms) {
      const userPref = userPreferences.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.view_group === group && p.platform === platform
      );
      if (userPref) {
        completePreferences.push(userPref);
      } else {
        // Fallback to default
        const defaultMatch = defaultPreferences.find(
          (p) => p.view_group === group && p.platform === platform
        );
        const prefToPush = JSON.parse(JSON.stringify(defaultMatch));
        // Ensure defaults for specific groups include all current nutrients
        if (
          group === 'food_database' ||
          group === 'goal' ||
          group === 'report_tabular' ||
          group === 'report_chart'
        ) {
          prefToPush.visible_nutrients = allNutrientsDynamic;
        }
        completePreferences.push(prefToPush);
      }
    }
  }
  return completePreferences;
}
async function upsertNutrientDisplayPreference(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewGroup: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  platform: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visibleNutrients: any
) {
  return await nutrientDisplayPreferenceRepository.upsertNutrientDisplayPreference(
    userId,
    viewGroup,
    platform,
    visibleNutrients
  );
}

async function resetNutrientDisplayPreference(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewGroup: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  platform: any
) {
  await nutrientDisplayPreferenceRepository.deleteNutrientDisplayPreference(
    userId,
    viewGroup,
    platform
  );
  const allNutrientsDynamic = await getAllNutrients(userId);
  let defaultVisibleNutrients;
  if (viewGroup === 'summary' || viewGroup === 'quick_info') {
    defaultVisibleNutrients = defaultNutrients; // Use the smaller default set for these
  } else {
    defaultVisibleNutrients = allNutrientsDynamic; // Use all nutrients for other view groups
  }
  const newDefaultPreference =
    await nutrientDisplayPreferenceRepository.upsertNutrientDisplayPreference(
      userId,
      viewGroup,
      platform,
      defaultVisibleNutrients
    );
  return newDefaultPreference;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createDefaultNutrientPreferencesForUser(userId: any) {
  const allNutrientsDynamic = await getAllNutrients(userId);
  const dynamicDefaultPreferences = JSON.parse(
    JSON.stringify(defaultPreferences)
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dynamicDefaultPreferences.forEach((pref: any) => {
    if (
      pref.view_group === 'food_database' ||
      pref.view_group === 'goal' ||
      pref.view_group === 'report_tabular' ||
      pref.view_group === 'report_chart'
    ) {
      pref.visible_nutrients = allNutrientsDynamic;
    }
  });
  return await nutrientDisplayPreferenceRepository.createDefaultNutrientPreferences(
    userId,
    dynamicDefaultPreferences
  );
}
export { getNutrientDisplayPreferences };
export { upsertNutrientDisplayPreference };
export { resetNutrientDisplayPreference };
export { createDefaultNutrientPreferencesForUser };
export { getAllNutrients };
export { addNutrientToSpecificViews };
export { removeNutrientFromAllViews };
export default {
  getNutrientDisplayPreferences,
  upsertNutrientDisplayPreference,
  resetNutrientDisplayPreference,
  createDefaultNutrientPreferencesForUser,
  getAllNutrients,
  addNutrientToSpecificViews,
  removeNutrientFromAllViews,
};
