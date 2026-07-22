/**
 * Canonical micronutrient catalog — the reference data behind the supplement
 * "nutrition per dose" picker, shared by the web client (picker) and the server
 * (lazily creating the matching `user_custom_nutrients` row).
 *
 * Values are the FDA Reference Daily Intakes used on the Nutrition/Supplement
 * Facts label for adults and children 4+ (21 CFR 101.9(c)(8)(iv)). They are the
 * denominator for %DV, not a clinical recommendation.
 *
 * WHY THIS EXISTS: `user_custom_nutrients` is free-text per user. Left to itself,
 * every user invents their own "Vitamin D" with their own unit and no daily-value
 * target, and the names diverge across users — which makes label import (see
 * `aliases` below) impossible. Seeding from this catalog gives every user the same
 * canonical name, unit and RDI for the nutrients that actually appear on labels,
 * while free-text creation stays available for everything else (creatine,
 * ashwagandha, ...).
 *
 * `aliases` feed the existing provider-import matcher (`buildAliasIndex` in the
 * server's foodUtils), so a nutrient seeded from this catalog is matchable against
 * the spellings that supplement/food providers actually emit.
 */

import type { FoodVariantNutrientField } from "../constants/foodVariantNutrients.ts";

export interface MicronutrientCatalogEntry {
  /** stable id used in code/data; not shown to the user */
  id: string;
  /** canonical name — becomes `user_custom_nutrients.name` when seeded */
  displayName: string;
  /** unit the amount is entered and stored in */
  unit: "g" | "mg" | "µg" | "IU";
  /** FDA Daily Value for adults & children 4+, or null when the FDA sets none */
  rdi: number | null;
  /**
   * Alternate spellings seen on labels and from import providers (DSLD ingredient
   * groups, OpenFoodFacts, USDA, ...). Matched case/punctuation-insensitively via
   * `normalizeNutrientName`.
   */
  aliases: string[];
  /**
   * Set when the nutrient is already a first-class column on `food_variants`
   * (and therefore on a supplement's `nutrients` payload). These MUST NOT be
   * seeded as custom nutrients — doing so would create a second, divergent
   * "Vitamin C" alongside the built-in one.
   */
  fixedField?: FoodVariantNutrientField;
  /** part of the "standard multivitamin" bulk preset */
  inMultivitaminPanel?: boolean;
  /**
   * When set, this entry is a compound: it has no amount of its own, and picking it in
   * the nutrition-per-dose picker adds its component nutrients as their own individual
   * rows (e.g. Omega-3 -> EPA + DHA), so the user enters each amount separately. The
   * component ids must themselves be catalog entries; components are hidden from the
   * picker's standalone list so they only appear as the expansion of their parent.
   */
  components?: string[];
}

export const MICRONUTRIENT_CATALOG: MicronutrientCatalogEntry[] = [
  // --- Fat-soluble vitamins ---
  {
    id: "vitamin_a",
    displayName: "Vitamin A",
    unit: "µg",
    rdi: 900,
    aliases: [
      "Vitamin A",
      "Retinol",
      "Retinyl palmitate",
      "Beta-carotene",
      "Vitamin A (RAE)",
    ],
    fixedField: "vitamin_a",
    inMultivitaminPanel: true,
  },
  {
    id: "vitamin_d",
    displayName: "Vitamin D",
    unit: "µg",
    rdi: 20,
    aliases: [
      "Vitamin D",
      "Vitamin D3",
      "Vitamin D2",
      "Cholecalciferol",
      "Ergocalciferol",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "vitamin_e",
    displayName: "Vitamin E",
    unit: "mg",
    rdi: 15,
    aliases: [
      "Vitamin E",
      "Alpha-tocopherol",
      "d-alpha-tocopheryl",
      "Tocopherol",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "vitamin_k",
    displayName: "Vitamin K",
    unit: "µg",
    rdi: 120,
    aliases: [
      "Vitamin K",
      "Vitamin K1",
      "Vitamin K2",
      "Phylloquinone",
      "Menaquinone",
      "MK-7",
      "MK-4",
    ],
    inMultivitaminPanel: true,
  },

  // --- Water-soluble vitamins ---
  {
    id: "vitamin_c",
    displayName: "Vitamin C",
    unit: "mg",
    rdi: 90,
    aliases: [
      "Vitamin C",
      "Ascorbic acid",
      "L-ascorbic acid",
      "Sodium ascorbate",
    ],
    fixedField: "vitamin_c",
    inMultivitaminPanel: true,
  },
  {
    id: "thiamin",
    displayName: "Thiamin (B1)",
    unit: "mg",
    rdi: 1.2,
    aliases: [
      "Thiamin",
      "Thiamine",
      "Vitamin B1",
      "Thiamine mononitrate",
      "Thiamin HCl",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "riboflavin",
    displayName: "Riboflavin (B2)",
    unit: "mg",
    rdi: 1.3,
    aliases: ["Riboflavin", "Vitamin B2"],
    inMultivitaminPanel: true,
  },
  {
    id: "niacin",
    displayName: "Niacin (B3)",
    unit: "mg",
    rdi: 16,
    aliases: [
      "Niacin",
      "Vitamin B3",
      "Niacinamide",
      "Nicotinamide",
      "Nicotinic acid",
      "Niacin (NE)",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "vitamin_b6",
    displayName: "Vitamin B6",
    unit: "mg",
    rdi: 1.7,
    aliases: [
      "Vitamin B6",
      "Pyridoxine",
      "Pyridoxine HCl",
      "Pyridoxal 5-phosphate",
      "P5P",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "folate",
    displayName: "Folate (B9)",
    unit: "µg",
    rdi: 400,
    aliases: [
      "Folate",
      "Folic acid",
      "Vitamin B9",
      "Folate (DFE)",
      "Methylfolate",
      "L-5-MTHF",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "vitamin_b12",
    displayName: "Vitamin B12",
    unit: "µg",
    rdi: 2.4,
    aliases: ["Vitamin B12", "Cobalamin", "Cyanocobalamin", "Methylcobalamin"],
    inMultivitaminPanel: true,
  },
  {
    id: "biotin",
    displayName: "Biotin (B7)",
    unit: "µg",
    rdi: 30,
    aliases: ["Biotin", "Vitamin B7", "Vitamin H"],
    inMultivitaminPanel: true,
  },
  {
    id: "pantothenic_acid",
    displayName: "Pantothenic Acid (B5)",
    unit: "mg",
    rdi: 5,
    aliases: [
      "Pantothenic acid",
      "Vitamin B5",
      "Calcium pantothenate",
      "Pantothenate",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "choline",
    displayName: "Choline",
    unit: "mg",
    rdi: 550,
    aliases: ["Choline", "Choline bitartrate", "Citicoline"],
  },

  // --- Minerals ---
  {
    id: "calcium",
    displayName: "Calcium",
    unit: "mg",
    rdi: 1300,
    aliases: ["Calcium", "Calcium carbonate", "Calcium citrate"],
    fixedField: "calcium",
    inMultivitaminPanel: true,
  },
  {
    id: "iron",
    displayName: "Iron",
    unit: "mg",
    rdi: 18,
    aliases: [
      "Iron",
      "Ferrous sulfate",
      "Ferrous bisglycinate",
      "Ferrous fumarate",
    ],
    fixedField: "iron",
    inMultivitaminPanel: true,
  },
  {
    id: "magnesium",
    displayName: "Magnesium",
    unit: "mg",
    rdi: 420,
    aliases: [
      "Magnesium",
      "Magnesium oxide",
      "Magnesium citrate",
      "Magnesium glycinate",
      "Magnesium, Mg",
    ],
    inMultivitaminPanel: true,
  },
  {
    id: "zinc",
    displayName: "Zinc",
    unit: "mg",
    rdi: 11,
    aliases: ["Zinc", "Zinc oxide", "Zinc picolinate", "Zinc gluconate"],
    inMultivitaminPanel: true,
  },
  {
    id: "selenium",
    displayName: "Selenium",
    unit: "µg",
    rdi: 55,
    aliases: ["Selenium", "Selenomethionine", "Sodium selenite"],
    inMultivitaminPanel: true,
  },
  {
    id: "copper",
    displayName: "Copper",
    unit: "mg",
    rdi: 0.9,
    aliases: ["Copper", "Copper gluconate", "Cupric oxide"],
    inMultivitaminPanel: true,
  },
  {
    id: "manganese",
    displayName: "Manganese",
    unit: "mg",
    rdi: 2.3,
    aliases: ["Manganese", "Manganese sulfate"],
    inMultivitaminPanel: true,
  },
  {
    id: "chromium",
    displayName: "Chromium",
    unit: "µg",
    rdi: 35,
    aliases: ["Chromium", "Chromium picolinate", "Chromium chloride"],
    inMultivitaminPanel: true,
  },
  {
    id: "molybdenum",
    displayName: "Molybdenum",
    unit: "µg",
    rdi: 45,
    aliases: ["Molybdenum", "Sodium molybdate"],
    inMultivitaminPanel: true,
  },
  {
    id: "iodine",
    displayName: "Iodine",
    unit: "µg",
    rdi: 150,
    aliases: ["Iodine", "Potassium iodide", "Kelp"],
    inMultivitaminPanel: true,
  },
  {
    id: "phosphorus",
    displayName: "Phosphorus",
    unit: "mg",
    rdi: 1250,
    aliases: ["Phosphorus", "Dicalcium phosphate"],
  },
  {
    id: "potassium",
    displayName: "Potassium",
    unit: "mg",
    rdi: 4700,
    aliases: ["Potassium", "Potassium chloride", "Potassium citrate"],
    fixedField: "potassium",
  },
  {
    id: "sodium",
    displayName: "Sodium",
    unit: "mg",
    rdi: 2300,
    aliases: ["Sodium", "Salt"],
    fixedField: "sodium",
  },

  // --- Common non-RDI supplement ingredients ---
  // No FDA Daily Value exists for these, so they carry rdi: null and simply have
  // no %DV. They are here because they are among the most commonly supplemented
  // ingredients and benefit from a canonical name + unit for import matching.
  {
    id: "omega_3",
    displayName: "Omega-3 (EPA+DHA)",
    unit: "mg",
    rdi: null,
    // A compound: picking it drops in individual EPA and DHA rows to fill separately.
    // The component names are NOT aliased here — they live on the epa/dha entries — so
    // the three stay distinct on save. The label already contains "EPA"/"DHA", so a
    // search for either still surfaces this entry.
    aliases: [
      "Omega-3",
      "Omega 3",
      "EPA+DHA",
      "Fish oil",
      "Omega-3 fatty acids",
    ],
    components: ["epa", "dha"],
  },
  {
    // Named "Omega-3 EPA" (not bare "EPA") so that once it lands as its own row in the
    // nutrition editor and in reports, it still reads as an Omega-3 component.
    id: "epa",
    displayName: "Omega-3 EPA",
    unit: "mg",
    rdi: null,
    aliases: ["EPA", "Eicosapentaenoic acid"],
  },
  {
    id: "dha",
    displayName: "Omega-3 DHA",
    unit: "mg",
    rdi: null,
    aliases: ["DHA", "Docosahexaenoic acid"],
  },
  {
    id: "coenzyme_q10",
    displayName: "Coenzyme Q10",
    unit: "mg",
    rdi: null,
    aliases: ["Coenzyme Q10", "CoQ10", "Ubiquinone", "Ubiquinol"],
  },
  {
    id: "creatine",
    displayName: "Creatine",
    unit: "g",
    rdi: null,
    aliases: ["Creatine", "Creatine monohydrate"],
  },
];

const CATALOG_BY_ID = new Map(
  MICRONUTRIENT_CATALOG.map((entry) => [entry.id, entry]),
);

export function getMicronutrientById(
  id: string,
): MicronutrientCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id);
}

/**
 * The bulk "standard multivitamin panel" preset — the nutrients a typical
 * multivitamin lists. Amounts are left blank; the user fills them from the label.
 */
export const MULTIVITAMIN_PANEL_IDS: string[] = MICRONUTRIENT_CATALOG.filter(
  (entry) => entry.inMultivitaminPanel,
).map((entry) => entry.id);

/**
 * Where a nutrient created for a SUPPLEMENT becomes visible.
 *
 * Deliberately excludes `food_database`. That group drives the food search cards, the
 * diary rows and the custom-food editor, so registering there would put a column of
 * `0.0` on every food for each nutrient in the user's multivitamin — foods carry no
 * data for most micronutrients. Adding a supplement is a statement about the
 * supplement, not about how the user wants FOOD rendered.
 *
 * Goals and reports are kept: that is where the supplement's contribution and its %DV
 * against the seeded RDI actually surface, which is the whole point of the feature.
 * A user who does want the nutrient on food rows can enable it in
 * Settings > Nutrient Display.
 */
export const SUPPLEMENT_NUTRIENT_VIEW_GROUPS: string[] = [
  "goal",
  "report_tabular",
  "report_chart",
];
