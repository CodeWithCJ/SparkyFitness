/**
 * Canonical quick-add drink preset catalog.
 *
 * Provides template reference data for common caffeinated and alcoholic drinks.
 * Presets are materialized on-demand into per-user custom foods and water containers,
 * avoiding public food catalog search pollution while allowing full per-user customization.
 */

export interface DrinkPresetCatalogEntry {
  /** Stable identifier (e.g., 'espresso', 'drip_coffee', 'beer_pint') */
  id: string;
  /** Translation key for UI displays */
  displayNameKey: string;
  /** Default English display name */
  defaultName: string;
  /** Volume in millilitres */
  volumeMl: number;
  /** Serving unit for food and container */
  servingUnit: string;
  /** Caffeine amount in mg, if applicable */
  caffeineMg?: number;
  /** Alcohol by volume percentage, if applicable */
  abvPercent?: number;
  /** Pure ethanol in grams, if applicable */
  alcoholG?: number;
  /** Explicit water volume in ml, if distinct from volumeMl */
  waterMl?: number;
  /**
   * Energy and macros for the stated serving.
   *
   * Generic values for the drink as commonly served -- a latte is milk, a pint
   * is malt and ethanol -- because a preset that logs a 180 kcal latte as
   * 0 kcal is worse than no preset at all in a calorie tracker. The
   * materialized food is per-user and editable, the same contract as any
   * database entry. Ethanol's 7 kcal/g is already inside `caloriesKcal`; it is
   * never added on top of it.
   */
  caloriesKcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sugarsG?: number;
  saturatedFatG?: number;
  /**
   * How much of the drink's water counts toward the hydration goal (0.0 - 2.0).
   *
   * A preference, not a claim: the Beverage Hydration Index found coffee and
   * tea at normal doses about as hydrating as water, so every non-alcoholic
   * preset ships at 1 and the user can discount it if they disagree. Only the
   * alcoholic ones are discounted by default, where the diuretic effect is far
   * better established.
   *
   * Distinct from the food's own `waterMl`, which is a fact about the drink. An
   * espresso holds ~60 ml of water whatever a user decides to count.
   */
  hydrationFactor: number;
  /** Primary category kind */
  kind: "caffeine" | "alcohol" | "both" | "hydration";
}

export const DRINK_PRESET_CATALOG: readonly DrinkPresetCatalogEntry[] = [
  {
    id: "espresso",
    displayNameKey: "drink_presets.espresso",
    defaultName: "Espresso",
    volumeMl: 30,
    servingUnit: "ml",
    caffeineMg: 63,
    caloriesKcal: 3,
    proteinG: 0.1,
    carbsG: 0.5,
    fatG: 0.1,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "double_espresso",
    displayNameKey: "drink_presets.double_espresso",
    defaultName: "Double Espresso",
    volumeMl: 60,
    servingUnit: "ml",
    caffeineMg: 126,
    caloriesKcal: 5,
    proteinG: 0.1,
    carbsG: 1.0,
    fatG: 0.1,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "drip_coffee",
    displayNameKey: "drink_presets.drip_coffee",
    defaultName: "Drip Coffee",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 95,
    caloriesKcal: 2,
    proteinG: 0.3,
    carbsG: 0.0,
    fatG: 0.0,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "instant_coffee",
    displayNameKey: "drink_presets.instant_coffee",
    defaultName: "Instant Coffee",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 60,
    caloriesKcal: 4,
    proteinG: 0.2,
    carbsG: 0.7,
    fatG: 0.0,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "latte",
    displayNameKey: "drink_presets.latte",
    defaultName: "Latte",
    volumeMl: 350,
    servingUnit: "ml",
    caffeineMg: 75,
    caloriesKcal: 180,
    proteinG: 9.5,
    carbsG: 14.5,
    fatG: 9.5,
    sugarsG: 14.5,
    saturatedFatG: 5.5,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "cappuccino",
    displayNameKey: "drink_presets.cappuccino",
    defaultName: "Cappuccino",
    volumeMl: 200,
    servingUnit: "ml",
    caffeineMg: 75,
    caloriesKcal: 80,
    proteinG: 4.3,
    carbsG: 6.4,
    fatG: 4.2,
    sugarsG: 6.4,
    saturatedFatG: 2.5,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "black_tea",
    displayNameKey: "drink_presets.black_tea",
    defaultName: "Black Tea",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 47,
    caloriesKcal: 2,
    proteinG: 0.0,
    carbsG: 0.5,
    fatG: 0.0,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "green_tea",
    displayNameKey: "drink_presets.green_tea",
    defaultName: "Green Tea",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 28,
    caloriesKcal: 2,
    proteinG: 0.0,
    carbsG: 0.0,
    fatG: 0.0,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "energy_drink",
    displayNameKey: "drink_presets.energy_drink",
    defaultName: "Energy Drink",
    volumeMl: 250,
    servingUnit: "ml",
    caffeineMg: 80,
    caloriesKcal: 112,
    proteinG: 0.5,
    carbsG: 27.5,
    fatG: 0.0,
    sugarsG: 27.0,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "cola",
    displayNameKey: "drink_presets.cola",
    defaultName: "Cola",
    volumeMl: 330,
    servingUnit: "ml",
    caffeineMg: 32,
    caloriesKcal: 139,
    proteinG: 0.0,
    carbsG: 35.0,
    fatG: 0.0,
    sugarsG: 35.0,
    hydrationFactor: 1,
    kind: "caffeine",
  },
  {
    id: "beer_pint",
    displayNameKey: "drink_presets.beer_pint",
    defaultName: "Beer (Pint 4.5%)",
    volumeMl: 568,
    servingUnit: "ml",
    abvPercent: 4.5,
    alcoholG: 20.2,
    caloriesKcal: 215,
    proteinG: 1.7,
    carbsG: 17.0,
    fatG: 0.0,
    hydrationFactor: 0.7,
    kind: "alcohol",
  },
  {
    id: "beer_bottle",
    displayNameKey: "drink_presets.beer_bottle",
    defaultName: "Beer (Bottle 5%)",
    volumeMl: 330,
    servingUnit: "ml",
    abvPercent: 5.0,
    alcoholG: 13.0,
    caloriesKcal: 140,
    proteinG: 1.0,
    carbsG: 10.6,
    fatG: 0.0,
    hydrationFactor: 0.7,
    kind: "alcohol",
  },
  {
    id: "wine_glass",
    displayNameKey: "drink_presets.wine_glass",
    defaultName: "Wine (175 ml 12%)",
    volumeMl: 175,
    servingUnit: "ml",
    abvPercent: 12.0,
    alcoholG: 16.6,
    caloriesKcal: 147,
    proteinG: 0.1,
    carbsG: 4.5,
    fatG: 0.0,
    hydrationFactor: 0.5,
    kind: "alcohol",
  },
  {
    id: "spirit_single",
    displayNameKey: "drink_presets.spirit_single",
    defaultName: "Spirit (Single 40%)",
    volumeMl: 25,
    servingUnit: "ml",
    abvPercent: 40.0,
    alcoholG: 7.9,
    caloriesKcal: 56,
    proteinG: 0.0,
    carbsG: 0.0,
    fatG: 0.0,
    hydrationFactor: 0.1,
    kind: "alcohol",
  },
];

export function getDrinkPresetCatalogEntry(
  id: string,
): DrinkPresetCatalogEntry | undefined {
  return DRINK_PRESET_CATALOG.find((entry) => entry.id === id);
}
