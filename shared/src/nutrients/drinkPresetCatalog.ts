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
   * Hydration scaling factor (0.0 - 2.0).
   * 0 = no water credit (e.g. espresso)
   * 1 = full water credit (e.g. water, tea)
   * partial = partial hydration (e.g. beer, coffee)
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
    hydrationFactor: 0,
    kind: "caffeine",
  },
  {
    id: "double_espresso",
    displayNameKey: "drink_presets.double_espresso",
    defaultName: "Double Espresso",
    volumeMl: 60,
    servingUnit: "ml",
    caffeineMg: 126,
    hydrationFactor: 0,
    kind: "caffeine",
  },
  {
    id: "drip_coffee",
    displayNameKey: "drink_presets.drip_coffee",
    defaultName: "Drip Coffee",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 95,
    hydrationFactor: 0.8,
    kind: "caffeine",
  },
  {
    id: "instant_coffee",
    displayNameKey: "drink_presets.instant_coffee",
    defaultName: "Instant Coffee",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 60,
    hydrationFactor: 0.9,
    kind: "caffeine",
  },
  {
    id: "latte",
    displayNameKey: "drink_presets.latte",
    defaultName: "Latte",
    volumeMl: 350,
    servingUnit: "ml",
    caffeineMg: 75,
    hydrationFactor: 0.85,
    kind: "caffeine",
  },
  {
    id: "cappuccino",
    displayNameKey: "drink_presets.cappuccino",
    defaultName: "Cappuccino",
    volumeMl: 200,
    servingUnit: "ml",
    caffeineMg: 75,
    hydrationFactor: 0.85,
    kind: "caffeine",
  },
  {
    id: "black_tea",
    displayNameKey: "drink_presets.black_tea",
    defaultName: "Black Tea",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 47,
    hydrationFactor: 0.95,
    kind: "caffeine",
  },
  {
    id: "green_tea",
    displayNameKey: "drink_presets.green_tea",
    defaultName: "Green Tea",
    volumeMl: 240,
    servingUnit: "ml",
    caffeineMg: 28,
    hydrationFactor: 0.95,
    kind: "caffeine",
  },
  {
    id: "energy_drink",
    displayNameKey: "drink_presets.energy_drink",
    defaultName: "Energy Drink",
    volumeMl: 250,
    servingUnit: "ml",
    caffeineMg: 80,
    hydrationFactor: 0.6,
    kind: "caffeine",
  },
  {
    id: "cola",
    displayNameKey: "drink_presets.cola",
    defaultName: "Cola",
    volumeMl: 330,
    servingUnit: "ml",
    caffeineMg: 32,
    hydrationFactor: 0.7,
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
    hydrationFactor: 0.1,
    kind: "alcohol",
  },
];

export function getDrinkPresetCatalogEntry(
  id: string,
): DrinkPresetCatalogEntry | undefined {
  return DRINK_PRESET_CATALOG.find((entry) => entry.id === id);
}
