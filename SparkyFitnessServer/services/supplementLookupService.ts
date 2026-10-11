import {
  MICRONUTRIENT_CATALOG,
  convertNutrientAmount,
  normalizeNutrientName,
  type FoodVariantNutrientField,
  type MicronutrientCatalogEntry,
  type SupplementLabelExtraction,
  type SupplementLookupProduct,
} from '@workspace/shared';

// NIH Office of Dietary Supplements, Dietary Supplement Label Database. Public,
// no key. A label carries its UPC, serving size and the amount of every
// ingredient per serving.
const DSLD_BASE_URL = 'https://api.ods.od.nih.gov/dsld/v9';
const REQUEST_TIMEOUT_MS = 8000;
// How many search hits are opened to find the one with the scanned code.
const MAX_CANDIDATES = 5;
const MAX_UNMATCHED = 25;

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface DsldQuantity {
  servingSizeOrder?: number;
  operator?: string;
  quantity?: number | null;
  unit?: string | null;
}

interface DsldIngredientRow {
  name?: string;
  notes?: string | null;
  ingredientGroup?: string | null;
  category?: string | null;
  quantity?: DsldQuantity[] | null;
  nestedRows?: DsldIngredientRow[] | null;
  forms?: { name?: string }[] | null;
}

export interface DsldLabel {
  id: number | string;
  fullName?: string | null;
  brandName?: string | null;
  upcSku?: string | null;
  offMarket?: number | null;
  physicalState?: { langualCodeDescription?: string | null } | null;
  servingSizes?:
    | {
        order?: number;
        minQuantity?: number | null;
        maxQuantity?: number | null;
        unit?: string | null;
      }[]
    | null;
  ingredientRows?: DsldIngredientRow[] | null;
}

type SupplementForm = NonNullable<SupplementLookupProduct['form']>;

// --- Barcode handling -------------------------------------------------------

const isMissing = (value: unknown): value is null | undefined =>
  value === null || value === undefined;

const digitsOf = (value: string): string => value.replace(/\D/g, '');
const withoutLeadingZeros = (digits: string): string =>
  digits.replace(/^0+/, '');

/**
 * The scanned code as the digits to search for. A 13-digit EAN that starts with
 * 0 is a UPC-A with a prefix, which is how a US label is usually scanned.
 * Returns null for a code too short or long to be a product code.
 */
export function normalizeUpc(raw: string): string | null {
  const digits = digitsOf(raw);
  if (digits.length === 13 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 || digits.length === 13) return digits;
  return null;
}

/**
 * The phrases to search the label database for. The database tokenizes on
 * spaces and hyphens, so one grouped phrase matches a code written either way;
 * the plain digits cover a code stored without separators.
 */
export function upcSearchPhrases(digits: string): string[] {
  const grouped =
    digits.length === 12
      ? `${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits.slice(11)}`
      : `${digits.slice(0, 1)} ${digits.slice(1, 7)} ${digits.slice(7, 12)} ${digits.slice(12)}`;
  return [grouped, digits];
}

/** Whether a label's stored code is the scanned one. */
export function sameUpc(labelUpc: string | null | undefined, digits: string) {
  if (!labelUpc) return false;
  return (
    withoutLeadingZeros(digitsOf(labelUpc)) === withoutLeadingZeros(digits)
  );
}

// --- Label -> nutrients -----------------------------------------------------

interface FixedTarget {
  key: FoodVariantNutrientField;
  unit: string;
}

// Built-in columns that are not micronutrients in the catalog. Matched on the
// ingredient's name only; its group is too loose ("Fat (unspecified)").
const FIXED_BY_NAME = new Map<string, FixedTarget>(
  (
    [
      [['calories', 'calorie', 'energy', 'total calories'], 'calories', 'kcal'],
      [['protein', 'proteins'], 'protein', 'g'],
      [
        [
          'total carbohydrates',
          'total carbohydrate',
          'carbohydrate',
          'carbohydrates',
        ],
        'carbs',
        'g',
      ],
      [['total fat', 'fat'], 'fat', 'g'],
      [['saturated fat'], 'saturated_fat', 'g'],
      [['trans fat'], 'trans_fat', 'g'],
      [['cholesterol'], 'cholesterol', 'mg'],
      [['dietary fiber', 'fiber', 'total dietary fiber'], 'dietary_fiber', 'g'],
      [['sugar', 'sugars', 'total sugars'], 'sugars', 'g'],
    ] as [string[], FoodVariantNutrientField, string][]
  ).flatMap(([names, key, unit]) =>
    names.map((name) => [normalizeNutrientName(name), { key, unit }] as const)
  )
);

const CATALOG_BY_NAME = (() => {
  const index = new Map<string, MicronutrientCatalogEntry>();
  for (const entry of MICRONUTRIENT_CATALOG) {
    for (const name of [entry.displayName, ...entry.aliases]) {
      const key = normalizeNutrientName(name);
      if (!index.has(key)) index.set(key, entry);
    }
  }
  return index;
})();

/** The label's unit as one the converter understands, or null. */
function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase();
  if (u === 'np' || u === 'not present') return null;
  if (u.startsWith('microgram') || u.startsWith('mcg') || u.startsWith('µg'))
    return 'µg';
  if (u.startsWith('milligram') || u === 'mg' || u.startsWith('mg '))
    return 'mg';
  if (u.startsWith('gram') || u === 'g') return 'g';
  if (u.startsWith('calorie') || u === 'kcal' || u === '{calories}')
    return 'kcal';
  if (u === 'iu') return 'IU';
  return null;
}

/** International units into the catalog's unit, where a conversion exists. */
function convertIu(
  amount: number,
  catalogId: string | undefined,
  hint: string
): number | null {
  switch (catalogId) {
    case 'vitamin_d':
      return amount * 0.025;
    case 'vitamin_a':
      // Per the NIH fact sheet: retinol 0.3 mcg RAE, supplemental
      // beta-carotene 0.15 mcg RAE.
      return amount * (/carotene/i.test(hint) ? 0.15 : 0.3);
    case 'vitamin_e':
      // Natural d-alpha is 0.67 mg per IU, synthetic dl-alpha 0.45 mg.
      return amount * (/\bdl-|synthetic/i.test(hint) ? 0.45 : 0.67);
    default:
      return null;
  }
}

function toTargetUnit(
  amount: number,
  fromUnit: string | null | undefined,
  target: { unit: string; catalogId?: string },
  hint: string
): number | null {
  const from = normalizeUnit(fromUnit);
  if (!from) return null;
  const converted =
    from === 'IU'
      ? convertIu(amount, target.catalogId, hint)
      : convertNutrientAmount(amount, from, target.unit);
  if (isMissing(converted) || !Number.isFinite(converted)) return null;
  return Math.round(converted * 1e4) / 1e4;
}

function flattenRows(rows: DsldIngredientRow[]): DsldIngredientRow[] {
  return rows.flatMap((row) => [row, ...flattenRows(row.nestedRows ?? [])]);
}

function servingAmount(
  row: DsldIngredientRow,
  servingOrder: number
): DsldQuantity | undefined {
  const quantities = row.quantity ?? [];
  return (
    quantities.find((q) => q.servingSizeOrder === servingOrder) ?? quantities[0]
  );
}

function formFromLabel(label: DsldLabel): SupplementForm | null {
  const state = (
    label.physicalState?.langualCodeDescription ?? ''
  ).toLowerCase();
  if (state.includes('softgel')) return 'softgel';
  if (state.includes('gummy')) return 'gummy';
  if (state.includes('powder')) return 'powder';
  if (state.includes('liquid')) return 'liquid';
  if (state.includes('tablet')) return 'tablet';
  if (state.includes('capsule')) return 'capsule';
  return null;
}

function servingText(label: DsldLabel): string | null {
  const serving = label.servingSizes?.[0];
  if (!serving || isMissing(serving.minQuantity)) return null;
  const range =
    !isMissing(serving.maxQuantity) &&
    serving.maxQuantity !== serving.minQuantity
      ? `${serving.minQuantity}–${serving.maxQuantity}`
      : `${serving.minQuantity}`;
  return serving.unit ? `${range} ${serving.unit}` : range;
}

function productName(label: DsldLabel): string {
  const brand = label.brandName?.trim() ?? '';
  const full = label.fullName?.trim() ?? '';
  if (!brand) return full;
  if (!full) return brand;
  return full.toLowerCase().startsWith(brand.toLowerCase())
    ? full
    : `${brand} ${full}`;
}

/** One ingredient line, reduced to what the nutrient matching needs. */
export interface IngredientLine {
  name: string;
  amount: number | null | undefined;
  /** The unit as printed. */
  unit: string | null | undefined;
  /** Extra words that settle an IU conversion (forms, notes). */
  hint: string;
  /** The label's own grouping, a second chance to name the nutrient. */
  group?: string | null;
}

export type NutrientTotals = Pick<
  SupplementLookupProduct,
  'fixed' | 'catalog' | 'unmatched'
>;

/**
 * Matches ingredient lines to nutrient fields and totals them in the app's
 * units. `reportUnreadable` lists a line whose unit is missing or cannot be
 * converted (a photographed label's "%DV" or "CFU") as unmatched, so the app
 * can say it was left out. "NP" and "not present" are never listed: they say
 * the ingredient is absent.
 */
export function totalIngredients(
  lines: IngredientLine[],
  reportUnreadable: boolean
): NutrientTotals {
  const fixed = new Map<FoodVariantNutrientField, number>();
  const catalog = new Map<string, number>();
  const unmatched: SupplementLookupProduct['unmatched'] = [];
  const addUnmatched = (line: IngredientLine) => {
    if (unmatched.length < MAX_UNMATCHED) {
      unmatched.push({
        name: line.name,
        amount: line.amount ?? null,
        unit: line.unit ?? null,
      });
    }
  };

  for (const line of lines) {
    const { name, amount, unit, hint } = line;
    if (isMissing(amount) || !(amount > 0)) continue;
    if (normalizeUnit(unit) === null) {
      const notPresent = /^(np|not present)$/i.test(unit?.trim() ?? '');
      if (reportUnreadable && !notPresent) addUnmatched(line);
      continue;
    }

    const normalizedName = normalizeNutrientName(name);
    const fixedTarget = FIXED_BY_NAME.get(normalizedName);
    const found =
      CATALOG_BY_NAME.get(normalizedName) ??
      (line.group
        ? CATALOG_BY_NAME.get(normalizeNutrientName(line.group))
        : undefined);
    // A compound has no amount of its own; its parts are listed on their own.
    const entry = found?.components?.length ? undefined : found;

    const target = fixedTarget
      ? { key: fixedTarget.key, unit: fixedTarget.unit }
      : entry
        ? {
            key: entry.fixedField,
            unit: entry.unit,
            catalogId: entry.id,
          }
        : null;
    const converted = target ? toTargetUnit(amount, unit, target, hint) : null;

    if (!target || isMissing(converted)) {
      addUnmatched(line);
      continue;
    }

    if (target.key) {
      fixed.set(target.key, (fixed.get(target.key) ?? 0) + converted);
    } else if ('catalogId' in target && target.catalogId) {
      catalog.set(
        target.catalogId,
        (catalog.get(target.catalogId) ?? 0) + converted
      );
    }
  }

  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  return {
    fixed: [...fixed].map(([key, amount]) => ({ key, amount: round(amount) })),
    catalog: [...catalog].map(([catalogId, amount]) => ({
      catalogId,
      amount: round(amount),
    })),
    unmatched,
  };
}

/** Turns a label into the nutrients of one serving, in the app's units. */
export function mapDsldLabel(label: DsldLabel): SupplementLookupProduct {
  const servingOrder = label.servingSizes?.[0]?.order ?? 1;
  const lines: IngredientLine[] = [];
  for (const row of flattenRows(label.ingredientRows ?? [])) {
    const name = row.name?.trim();
    if (!name) continue;
    const quantity = servingAmount(row, servingOrder);
    lines.push({
      name,
      amount: quantity?.quantity,
      unit: quantity?.unit,
      hint: [name, row.notes, ...(row.forms ?? []).map((f) => f.name)]
        .filter(Boolean)
        .join(' '),
      group: row.ingredientGroup,
    });
  }
  return {
    source: 'dsld',
    sourceId: String(label.id),
    name: productName(label),
    brand: label.brandName?.trim() || null,
    form: formFromLabel(label),
    serving: servingText(label),
    ...totalIngredients(lines, true),
  };
}

/** Turns a Supplement Facts panel read from a photo into the same product. */
export function mapScannedLabel(
  label: SupplementLabelExtraction
): SupplementLookupProduct {
  return {
    source: 'label',
    sourceId: 'label',
    name: label.name?.trim() ?? '',
    brand: label.brand?.trim() || null,
    form: label.form,
    serving: label.serving?.trim() || null,
    ...totalIngredients(
      label.ingredients.map((ingredient) => ({
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        hint: ingredient.name,
      })),
      true
    ),
  };
}

// --- Lookup -----------------------------------------------------------------

async function getJson<T>(
  fetchImpl: FetchLike,
  url: string,
  signal: AbortSignal
): Promise<T> {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) {
    throw new Error(`Supplement label database answered ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Finds the supplement with the scanned barcode in the NIH label database.
 * Resolves null when the code is not a product code or no label carries it.
 * Throws when the database cannot be reached.
 */
export async function lookupSupplementByUpc(
  upc: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<SupplementLookupProduct | null> {
  const digits = normalizeUpc(upc);
  if (!digits) return null;

  // One deadline for the whole scan. A fresh timeout on every search and
  // label request can outlast the client's wait before the fallback answers.
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const seen = new Set<string>();
  const matches: DsldLabel[] = [];
  for (const phrase of upcSearchPhrases(digits)) {
    const url = `${DSLD_BASE_URL}/search-filter?q=${encodeURIComponent(`"${phrase}"`)}&size=${MAX_CANDIDATES}`;
    const result = await getJson<{ hits?: { _id: string | number }[] }>(
      fetchImpl,
      url,
      deadline
    );
    for (const hit of result.hits ?? []) {
      const id = String(hit._id);
      if (seen.has(id)) continue;
      seen.add(id);
      // The search is free text, so the label's own code has to agree.
      const label = await getJson<DsldLabel>(
        fetchImpl,
        `${DSLD_BASE_URL}/label/${encodeURIComponent(id)}`,
        deadline
      );
      if (sameUpc(label.upcSku, digits)) matches.push(label);
    }
    if (matches.length > 0) break;
  }
  if (matches.length === 0) return null;

  // Several entries can share a code as a product is re-registered; the one
  // still on the market is the current label.
  const current = matches.find((label) => !label.offMarket) ?? matches[0];
  return mapDsldLabel(current);
}
