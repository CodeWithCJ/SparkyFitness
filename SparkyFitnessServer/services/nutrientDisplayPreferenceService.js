const nutrientDisplayPreferenceRepository = require("../models/nutrientDisplayPreferenceRepository");
const { log } = require("../config/logging");

const defaultNutrients = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "dietary_fiber",
];

const predefinedNutrients = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "dietary_fiber",
  "sugars",
  "sodium",
  "cholesterol",
  "saturated_fat",
  "monounsaturated_fat",
  "polyunsaturated_fat",
  "trans_fat",
  "potassium",
  "vitamin_a",
  "vitamin_c",
  "iron",
  "calcium",
  "glycemic_index",
];

/**
 * Automatically adds a nutrient to specific view groups if it's not already present.
 * Target views: food_database, goal, report_tabular, report_chart
 */
async function addNutrientToSpecificViews(userId, nutrientName) {
  const targetGroups = [
    "food_database",
    "goal",
    "report_tabular",
    "report_chart",
  ];
  const platforms = ["desktop", "mobile"];

  log(
    "debug",
    `addNutrientToSpecificViews: Start for user ${userId}, nutrient: ${nutrientName}`,
  );

  // Get raw customizations from DB to avoid fallback logic interference
  const rawUserPrefs =
    await nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences(
      userId,
    );

  // Get all currently known nutrients to build a full list for new records
  const allKnownNutrients = await getAllNutrients(userId);
  if (!allKnownNutrients.includes(nutrientName)) {
    allKnownNutrients.push(nutrientName);
  }

  for (const group of targetGroups) {
    for (const platform of platforms) {
      const existing = rawUserPrefs.find(
        (p) => p.view_group === group && p.platform === platform,
      );

      let visibleNutrients;
      if (existing) {
        // User has a custom record, append to it if missing
        visibleNutrients =
          typeof existing.visible_nutrients === "string"
            ? JSON.parse(existing.visible_nutrients)
            : existing.visible_nutrients;

        if (!visibleNutrients.includes(nutrientName)) {
          visibleNutrients.push(nutrientName);
          log(
            "debug",
            `addNutrientToSpecificViews: Updating existing record for ${group}/${platform}`,
          );
          await upsertNutrientDisplayPreference(
            userId,
            group,
            platform,
            visibleNutrients,
          );
        }
      } else {
        // No custom record, create one using the full current list
        log(
          "debug",
          `addNutrientToSpecificViews: Creating new record for ${group}/${platform} with all nutrients`,
        );
        await upsertNutrientDisplayPreference(
          userId,
          group,
          platform,
          allKnownNutrients,
        );
      }
    }
  }
}

async function getAllNutrients(userId) {
  const customNutrientService = require("./customNutrientService");
  const customNutrients =
    await customNutrientService.getCustomNutrients(userId);
  const customNutrientNames = customNutrients
    .filter((cn) => cn && cn.name)
    .map((cn) => cn.name); // Keep original casing for custom nutrients
  return [...predefinedNutrients, ...customNutrientNames];
}

const defaultPreferences = [
  // Desktop
  {
    view_group: "summary",
    platform: "desktop",
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: "quick_info",
    platform: "desktop",
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: "food_database",
    platform: "desktop",
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: "goal",
    platform: "desktop",
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: "report_tabular",
    platform: "desktop",
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: "report_chart",
    platform: "desktop",
    visible_nutrients: predefinedNutrients,
  },
  // Mobile
  {
    view_group: "summary",
    platform: "mobile",
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: "quick_info",
    platform: "mobile",
    visible_nutrients: defaultNutrients,
  },
  {
    view_group: "food_database",
    platform: "mobile",
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: "goal",
    platform: "mobile",
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: "report_tabular",
    platform: "mobile",
    visible_nutrients: predefinedNutrients,
  },
  {
    view_group: "report_chart",
    platform: "mobile",
    visible_nutrients: predefinedNutrients,
  },
];

async function getNutrientDisplayPreferences(userId) {
  const userPreferencesRaw =
    await nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences(
      userId,
    );

  const userPreferences = userPreferencesRaw.map((p) => ({
    ...p,
    visible_nutrients:
      typeof p.visible_nutrients === "string"
        ? JSON.parse(p.visible_nutrients)
        : p.visible_nutrients,
  }));

  const allNutrientsDynamic = await getAllNutrients(userId);

  // Return a complete list of 12 preferences (6 groups x 2 platforms)
  const viewGroups = [
    "summary",
    "quick_info",
    "food_database",
    "goal",
    "report_tabular",
    "report_chart",
  ];
  const platforms = ["desktop", "mobile"];

  const completePreferences = [];

  for (const group of viewGroups) {
    for (const platform of platforms) {
      const userPref = userPreferences.find(
        (p) => p.view_group === group && p.platform === platform,
      );

      if (userPref) {
        completePreferences.push(userPref);
      } else {
        // Fallback to default
        const defaultMatch = defaultPreferences.find(
          (p) => p.view_group === group && p.platform === platform,
        );

        const prefToPush = JSON.parse(JSON.stringify(defaultMatch));

        // Ensure defaults for specific groups include all current nutrients
        if (
          group === "food_database" ||
          group === "goal" ||
          group === "report_tabular" ||
          group === "report_chart"
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
  userId,
  viewGroup,
  platform,
  visibleNutrients,
) {
  return await nutrientDisplayPreferenceRepository.upsertNutrientDisplayPreference(
    userId,
    viewGroup,
    platform,
    visibleNutrients,
  );
}

async function resetNutrientDisplayPreference(userId, viewGroup, platform) {
  await nutrientDisplayPreferenceRepository.deleteNutrientDisplayPreference(
    userId,
    viewGroup,
    platform,
  );

  const allNutrientsDynamic = await getAllNutrients(userId);

  let defaultVisibleNutrients = [];
  if (viewGroup === "summary" || viewGroup === "quick_info") {
    defaultVisibleNutrients = defaultNutrients; // Use the smaller default set for these
  } else {
    defaultVisibleNutrients = allNutrientsDynamic; // Use all nutrients for other view groups
  }

  const newDefaultPreference =
    await nutrientDisplayPreferenceRepository.upsertNutrientDisplayPreference(
      userId,
      viewGroup,
      platform,
      defaultVisibleNutrients,
    );
  return newDefaultPreference;
}

async function createDefaultNutrientPreferencesForUser(userId) {
  const allNutrientsDynamic = await getAllNutrients(userId);
  const dynamicDefaultPreferences = JSON.parse(
    JSON.stringify(defaultPreferences),
  );

  dynamicDefaultPreferences.forEach((pref) => {
    if (
      pref.view_group === "food_database" ||
      pref.view_group === "goal" ||
      pref.view_group === "report_tabular" ||
      pref.view_group === "report_chart"
    ) {
      pref.visible_nutrients = allNutrientsDynamic;
    }
  });

  return await nutrientDisplayPreferenceRepository.createDefaultNutrientPreferences(
    userId,
    dynamicDefaultPreferences,
  );
}

module.exports = {
  getNutrientDisplayPreferences,
  upsertNutrientDisplayPreference,
  resetNutrientDisplayPreference,
  createDefaultNutrientPreferencesForUser,
  getAllNutrients,
  addNutrientToSpecificViews,
};
