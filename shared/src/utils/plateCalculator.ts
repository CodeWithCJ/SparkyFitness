/**
 * Plate calculator: which plates go on each side of a bar for a target weight,
 * given what a person owns.
 *
 * Greedy loading is wrong once plate counts are limited or odd plates exist
 * (with one 20 and two 15s, 30 per side is 15 + 15, not 20 + the rest), so the
 * loadable per-side weights are found with a bounded knapsack over the
 * denominations. The result names the exact loadable set: either the target
 * is loadable, or the nearest loadable weights below and above it are given.
 * Nothing is rounded to make a target fit.
 */

const KG_PER_LB = 0.45359237;

export type PlateUnit = 'kg' | 'lbs';

/** Plate and bar weights keep at most three decimals (1/8 lb is 0.125). */
export const PLATE_WEIGHT_DECIMALS = 3;
export const PLATE_WEIGHT_MIN = 0.01;
export const PLATE_WEIGHT_MAX = 100;
export const BAR_WEIGHT_MAX = 100;
export const PLATE_PAIRS_MAX = 20;
export const PLATE_DENOMINATIONS_MAX = 20;
export const BARS_MAX = 10;

export const BAR_KINDS = ['barbell', 'womens', 'ez', 'trap', 'other'] as const;
export type BarKind = (typeof BAR_KINDS)[number];

/** A kind of plate and how many pairs (one per side) the person owns. */
export interface PlateDenomination {
  weight: number;
  pairs: number;
}

export interface PlateBar {
  id: string;
  /** Typed by the person; apps show a translated label for `kind` when blank. */
  name: string | null;
  kind: BarKind;
  weight: number;
}

export interface PlatePreset {
  unit: PlateUnit;
  plates: PlateDenomination[];
  bars: Omit<PlateBar, 'id'>[];
  /** Weight of one collar (the clips on each end). */
  collarWeight: number;
}

/** Pairs a fresh preset starts with: enough for a normal session. */
const PRESET_PAIRS = 2;

export const PLATE_PRESETS: Record<PlateUnit, PlatePreset> = {
  kg: {
    unit: 'kg',
    plates: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5].map((weight) => ({
      weight,
      pairs: PRESET_PAIRS,
    })),
    bars: [
      { name: null, kind: 'barbell', weight: 20 },
      { name: null, kind: 'womens', weight: 15 },
      { name: null, kind: 'ez', weight: 7.5 },
      { name: null, kind: 'trap', weight: 25 },
    ],
    collarWeight: 2.5,
  },
  lbs: {
    unit: 'lbs',
    plates: [45, 35, 25, 10, 5, 2.5, 1.25].map((weight) => ({
      weight,
      pairs: PRESET_PAIRS,
    })),
    bars: [
      { name: null, kind: 'barbell', weight: 45 },
      { name: null, kind: 'womens', weight: 35 },
      { name: null, kind: 'ez', weight: 20 },
      { name: null, kind: 'trap', weight: 55 },
    ],
    collarWeight: 5,
  },
};

export function convertPlateWeight(
  value: number,
  from: PlateUnit,
  to: PlateUnit
): number {
  if (from === to) return value;
  return from === 'kg' ? value / KG_PER_LB : value * KG_PER_LB;
}

/** A weight typed or stored with at most `PLATE_WEIGHT_DECIMALS` decimals. */
export function isValidPlateWeight(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const scaled = value * 10 ** PLATE_WEIGHT_DECIMALS;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** One kind of plate on one side of the bar. */
export interface PlateCount {
  weight: number;
  count: number;
}

/** A way to load the bar, in the inventory's unit. */
export interface PlateLoad {
  /** Plates on each side, heaviest first. */
  plates: PlateCount[];
  perSideWeight: number;
  /** Bar, both collars (when counted) and plates on both sides. */
  totalWeight: number;
  /** Plates on one side. */
  plateCountPerSide: number;
}

export interface PlateCalcInput {
  /** The weight asked for, in `targetUnit`. */
  targetWeight: number;
  targetUnit: PlateUnit;
  /** Unit the bar, plates and collars are measured in. */
  inventoryUnit: PlateUnit;
  barWeight: number;
  plates: readonly PlateDenomination[];
  /** Weight of one collar; 0 or omitted when collars are not used. */
  collarWeight?: number;
}

export type PlateCalcStatus = 'exact' | 'inexact' | 'invalid' | 'too_large';

export interface PlateCalcResult {
  status: PlateCalcStatus;
  /** Unit of every weight in this result. */
  unit: PlateUnit;
  /** The target converted to `unit`, unrounded. */
  target: number;
  barWeight: number;
  /** Both collars together. */
  collarsWeight: number;
  /** The target load when it can be built exactly. */
  load: PlateLoad | null;
  /** Heaviest loadable weight under the target when it is not loadable. */
  below: PlateLoad | null;
  /** Lightest loadable weight over the target when it is not loadable. */
  above: PlateLoad | null;
  /** target - nearest loadable below; null when exact or nothing is below. */
  shortBy: number | null;
  /** nearest loadable above - target; null when exact or nothing is above. */
  overBy: number | null;
}

/** Work cap: slots x denominations. Past it the search is refused, not cut short. */
const MAX_SEARCH_CELLS = 40_000_000;
const NOT_REACHABLE = 0xffff;
const SCALE = 10 ** PLATE_WEIGHT_DECIMALS;

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return x;
}

function toUnits(value: number): number {
  return Math.round(value * SCALE);
}

/** Merge denominations of the same weight; drop empty or invalid ones. */
export function normalizePlates(
  plates: readonly PlateDenomination[]
): PlateDenomination[] {
  const merged = new Map<number, number>();
  for (const { weight, pairs } of plates) {
    if (!isValidPlateWeight(weight) || weight <= 0) continue;
    if (!Number.isInteger(pairs) || pairs <= 0) continue;
    const key = toUnits(weight);
    merged.set(key, (merged.get(key) ?? 0) + pairs);
  }
  return [...merged.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, pairs]) => ({ weight: key / SCALE, pairs }));
}

/**
 * Every per-side weight that the plates can make, found with a bounded
 * knapsack over the denominations. A weight is made with the fewest plates;
 * among those, the heaviest plates are used first.
 */
class PlateSearch {
  readonly step: number;
  readonly cells: number;
  private readonly kinds: { units: number; pairs: number }[];
  /** `fewest[i][sum]`: fewest plates making `sum` from denominations i.. */
  private readonly fewest: Uint16Array[];

  constructor(plates: readonly PlateDenomination[], cap: number, step: number) {
    this.step = step;
    // Heaviest first, as normalizePlates returns them.
    this.kinds = plates.map((p) => ({
      units: toUnits(p.weight) / step,
      pairs: p.pairs,
    }));
    this.cells = Math.floor(cap / step) + 1;
    const last = new Uint16Array(this.cells).fill(NOT_REACHABLE);
    last[0] = 0;
    this.fewest = new Array<Uint16Array>(this.kinds.length + 1);
    this.fewest[this.kinds.length] = last;
    for (let i = this.kinds.length - 1; i >= 0; i--) {
      const kind = this.kinds[i]!;
      const lighter = this.fewest[i + 1]!;
      const here = new Uint16Array(this.cells).fill(NOT_REACHABLE);
      for (let sum = 0; sum < this.cells; sum++) {
        for (let k = 0; k <= kind.pairs; k++) {
          const from = sum - k * kind.units;
          if (from < 0) break;
          const rest = lighter[from]!;
          if (rest !== NOT_REACHABLE && rest + k < here[sum]!) {
            here[sum] = rest + k;
          }
        }
      }
      this.fewest[i] = here;
    }
  }

  reachable(cell: number): boolean {
    return (
      cell >= 0 && cell < this.cells && this.fewest[0]![cell] !== NOT_REACHABLE
    );
  }

  /** Largest reachable cell at or under `cell`, or -1. */
  floor(cell: number): number {
    for (let c = Math.min(cell, this.cells - 1); c >= 0; c--) {
      if (this.reachable(c)) return c;
    }
    return -1;
  }

  /** Smallest reachable cell at or over `cell`, or -1. */
  ceil(cell: number): number {
    for (let c = Math.max(cell, 0); c < this.cells; c++) {
      if (this.reachable(c)) return c;
    }
    return -1;
  }

  /** The plates making a reachable cell: fewest, then heaviest first. */
  plates(cell: number): PlateCount[] {
    const out: PlateCount[] = [];
    let rest = cell;
    for (let i = 0; i < this.kinds.length; i++) {
      const kind = this.kinds[i]!;
      const need = this.fewest[i]![rest]!;
      const lighter = this.fewest[i + 1]!;
      for (
        let k = Math.min(kind.pairs, Math.floor(rest / kind.units));
        k >= 0;
        k--
      ) {
        const after = lighter[rest - k * kind.units]!;
        if (after !== NOT_REACHABLE && after + k === need) {
          if (k > 0) {
            out.push({ weight: (kind.units * this.step) / SCALE, count: k });
          }
          rest -= k * kind.units;
          break;
        }
      }
    }
    return out;
  }
}

function buildLoad(
  plates: PlateCount[],
  cell: number,
  step: number,
  fixedUnits: number
): PlateLoad {
  const perSideUnits = cell * step;
  return {
    plates,
    perSideWeight: perSideUnits / SCALE,
    totalWeight: (fixedUnits + 2 * perSideUnits) / SCALE,
    plateCountPerSide: plates.reduce((n, p) => n + p.count, 0),
  };
}

function emptyResult(
  input: PlateCalcInput,
  target: number,
  collarsWeight: number,
  status: PlateCalcStatus = 'invalid'
): PlateCalcResult {
  return {
    status,
    unit: input.inventoryUnit,
    target,
    barWeight: input.barWeight,
    collarsWeight,
    load: null,
    below: null,
    above: null,
    shortBy: null,
    overBy: null,
  };
}

/** Largest float error, in thousandths of a unit, still treated as exact. */
const EXACT_NOISE = 1e-9;

/**
 * Plates per side for `targetWeight` on a bar. All result weights are in the
 * inventory's unit; the target is converted exactly (never rounded) when the
 * units differ. When the target cannot be loaded, `below` and `above` are the
 * nearest loadable totals and `shortBy`/`overBy` how far each is from it.
 */
export function calculatePlateLoad(input: PlateCalcInput): PlateCalcResult {
  const target = convertPlateWeight(
    input.targetWeight,
    input.targetUnit,
    input.inventoryUnit
  );
  const collar = input.collarWeight ?? 0;
  const collarsWeight = collar * 2;
  if (
    !Number.isFinite(target) ||
    target <= 0 ||
    !isValidPlateWeight(input.barWeight) ||
    input.barWeight < 0 ||
    !isValidPlateWeight(collar) ||
    collar < 0
  ) {
    return emptyResult(input, target, collarsWeight);
  }

  const plates = normalizePlates(input.plates);
  const fixedUnits = toUnits(input.barWeight) + 2 * toUnits(collar);
  // Per-side target in integer units; may be fractional or negative.
  const sideUnits = (target * SCALE - fixedUnits) / 2;

  const step = plates.reduce((g, p) => gcd(g, toUnits(p.weight)), 0) || 1;
  const maxSide = plates.reduce((n, p) => n + toUnits(p.weight) * p.pairs, 0);
  const heaviest = plates.length > 0 ? toUnits(plates[0]!.weight) : 0;
  // The lightest loadable weight over the target is under target + heaviest
  // plate: dropping a plate from it would otherwise give a closer one.
  const cap = Math.min(maxSide, Math.max(0, Math.ceil(sideUnits)) + heaviest);
  if ((cap / step + 1) * Math.max(plates.length, 1) > MAX_SEARCH_CELLS) {
    return emptyResult(input, target, collarsWeight, 'too_large');
  }

  const search = new PlateSearch(plates, cap, step);
  const load = (cell: number): PlateLoad =>
    buildLoad(search.plates(cell), cell, step, fixedUnits);

  const nearInt = Math.round(sideUnits);
  // Only floating-point noise from a unit conversion (about 1e-11 here) may
  // pass as whole; a target a hair under the loadable weight is not exact.
  const isWhole = Math.abs(sideUnits - nearInt) < EXACT_NOISE;
  if (isWhole && nearInt >= 0 && nearInt % step === 0) {
    const cell = nearInt / step;
    if (search.reachable(cell)) {
      return {
        ...emptyResult(input, target, collarsWeight, 'exact'),
        load: load(cell),
      };
    }
  }

  const belowCell =
    sideUnits < 0 ? -1 : search.floor(Math.floor(sideUnits / step));
  const aboveCell = search.ceil(Math.ceil(sideUnits / step));
  const below = belowCell >= 0 ? load(belowCell) : null;
  const above = aboveCell >= 0 ? load(aboveCell) : null;
  return {
    ...emptyResult(input, target, collarsWeight, 'inexact'),
    below,
    above,
    shortBy: below ? target - below.totalWeight : null,
    overBy: above ? above.totalWeight - target : null,
  };
}

const EZ_BAR = /\be-?z[ -]?(curl )?bar\b|\bsz[ -]?bar\b/;
const TRAP_BAR = /\b(trap|hex) bar\b/;

/** Whether an exercise's equipment list is loaded with plates on a bar. */
export function usesBarbell(
  equipment: readonly string[] | string | null | undefined
): boolean {
  if (equipment == null) return false;
  const list = typeof equipment === 'string' ? [equipment] : equipment;
  return list.some((item) => {
    const name = item.toLowerCase();
    return name.includes('barbell') || EZ_BAR.test(name) || TRAP_BAR.test(name);
  });
}

/**
 * The bar an exercise most likely uses: a trap bar or EZ bar when the
 * equipment says so, otherwise the standard barbell, else the first bar.
 */
export function suggestBar<T extends { kind: BarKind }>(
  equipment: readonly string[] | string | null | undefined,
  bars: readonly T[]
): T | null {
  if (bars.length === 0) return null;
  const list =
    equipment == null
      ? []
      : (typeof equipment === 'string' ? [equipment] : equipment).map((e) =>
          e.toLowerCase()
        );
  const wants: BarKind = list.some((e) => TRAP_BAR.test(e))
    ? 'trap'
    : list.some((e) => EZ_BAR.test(e))
      ? 'ez'
      : 'barbell';
  return (
    bars.find((b) => b.kind === wants) ??
    bars.find((b) => b.kind === 'barbell') ??
    bars[0]!
  );
}

/** What a person owns, in the shape the calculator and both editors use. */
export interface PlateInventoryConfig {
  unit: PlateUnit;
  bars: PlateBar[];
  plates: PlateDenomination[];
  collarsEnabled: boolean;
  /** Weight of one collar. */
  collarWeight: number;
}

/** A starting inventory from the standard kg or lb preset. */
export function presetInventory(unit: PlateUnit): PlateInventoryConfig {
  const preset = PLATE_PRESETS[unit];
  return {
    unit,
    bars: preset.bars.map((bar) => ({ ...bar, id: `preset-${bar.kind}` })),
    plates: preset.plates.map((plate) => ({ ...plate })),
    collarsEnabled: false,
    collarWeight: preset.collarWeight,
  };
}

/** The calculator input for loading `bar` from `inventory`. */
export function plateCalcInputFor(
  inventory: PlateInventoryConfig,
  bar: Pick<PlateBar, 'weight'>,
  targetWeight: number,
  targetUnit: PlateUnit
): PlateCalcInput {
  return {
    targetWeight,
    targetUnit,
    inventoryUnit: inventory.unit,
    barWeight: bar.weight,
    plates: inventory.plates,
    collarWeight: inventory.collarsEnabled ? inventory.collarWeight : 0,
  };
}

/** The shape the API returns and accepts for a saved inventory. */
export interface StoredPlateInventory {
  weight_unit: PlateUnit;
  bars: PlateBar[];
  plates: PlateDenomination[];
  collars_enabled: boolean;
  collar_weight: number;
}

/** A saved inventory as a config, or the preset for `fallbackUnit` when none is saved. */
export function inventoryConfigFrom(
  stored: StoredPlateInventory | null | undefined,
  fallbackUnit: PlateUnit
): PlateInventoryConfig {
  if (!stored) return presetInventory(fallbackUnit);
  return {
    unit: stored.weight_unit,
    bars: stored.bars,
    plates: stored.plates,
    collarsEnabled: stored.collars_enabled,
    collarWeight: stored.collar_weight,
  };
}

/** The body for saving a config. */
export function inventoryConfigToBody(
  config: PlateInventoryConfig
): StoredPlateInventory {
  return {
    weight_unit: config.unit,
    bars: config.bars,
    plates: config.plates,
    collars_enabled: config.collarsEnabled,
    collar_weight: config.collarWeight,
  };
}
