import {
  MACRO_PICKER_FIELDS,
  MICRONUTRIENT_CATALOG,
  getMicronutrientById,
  type FoodVariantNutrientField,
  type MacroPickerField,
  type MedicationNutrients,
  type MicronutrientCatalogEntry,
  type SupplementLookupProduct,
} from '@workspace/shared';
import { NUTRIENT_META } from '../constants/nutrients';
import { parseDecimalInput } from './numericInput';

/** Dose forms offered for a supplement; stored in the medication's `type_id`. */
export const SUPPLEMENT_FORMS = [
  'tablet',
  'capsule',
  'softgel',
  'gummy',
  'powder',
  'liquid',
] as const;

export type MedSubtype = 'all' | 'meds' | 'supplements';

/** Splits the medication list for the All | Meds | Supplements filter. */
export function filterMedsBySubtype<T extends { is_supplement?: boolean }>(
  meds: T[],
  subtype: MedSubtype
): T[] {
  if (subtype === 'all') return meds;
  return meds.filter((med) =>
    subtype === 'supplements' ? Boolean(med.is_supplement) : !med.is_supplement
  );
}

/** One nutrient line in the supplement editor. */
export interface NutrientRow {
  /** Unique within the editor. */
  id: string;
  label: string;
  unit: string;
  /** Set for nutrients stored on a built-in column of the payload. */
  fixedField?: FoodVariantNutrientField;
  /**
   * Set for a nutrient picked from the catalog that is not a built-in column.
   * Its custom nutrient is created on save.
   */
  catalogId?: string;
  /** Set for a custom nutrient the user already has, by its name. */
  customName?: string;
  /** The amount as typed. */
  value: string;
}

const COMPONENT_IDS = new Set(
  MICRONUTRIENT_CATALOG.flatMap((entry) => entry.components ?? [])
);

/** Catalog entries offered by the picker. Components appear only under their parent. */
export function pickerCatalogEntries(): MicronutrientCatalogEntry[] {
  return MICRONUTRIENT_CATALOG.filter((entry) => !COMPONENT_IDS.has(entry.id));
}

export function macroRow(field: MacroPickerField): NutrientRow {
  return {
    id: `fixed:${field.fieldKey}`,
    label: field.displayName,
    unit: field.unit,
    fixedField: field.fieldKey,
    value: '',
  };
}

function catalogRow(entry: MicronutrientCatalogEntry): NutrientRow {
  return entry.fixedField
    ? {
        id: `fixed:${entry.fixedField}`,
        label: entry.displayName,
        unit: entry.unit,
        fixedField: entry.fixedField,
        value: '',
      }
    : {
        id: `catalog:${entry.id}`,
        label: entry.displayName,
        unit: entry.unit,
        catalogId: entry.id,
        value: '',
      };
}

/** The rows picking a catalog entry adds. A compound adds its components. */
export function rowsForCatalogId(catalogId: string): NutrientRow[] {
  const entry = getMicronutrientById(catalogId);
  if (!entry) return [];
  if (entry.components && entry.components.length > 0) {
    return entry.components.flatMap(rowsForCatalogId);
  }
  return [catalogRow(entry)];
}

/** Adds rows that are not already in the list, keeping the order. */
export function addRows(
  current: NutrientRow[],
  added: NutrientRow[]
): NutrientRow[] {
  const known = new Set(current.map((row) => row.id));
  const fresh = added.filter((row) => !known.has(row.id));
  return fresh.length > 0 ? [...current, ...fresh] : current;
}

function fixedMeta(field: FoodVariantNutrientField): {
  label: string;
  unit: string;
} {
  const macro = MACRO_PICKER_FIELDS.find((m) => m.fieldKey === field);
  if (macro) return { label: macro.displayName, unit: macro.unit };
  const catalog = MICRONUTRIENT_CATALOG.find((e) => e.fixedField === field);
  if (catalog) return { label: catalog.displayName, unit: catalog.unit };
  const meta = NUTRIENT_META[field];
  return { label: meta?.defaultLabel ?? field, unit: meta?.unit ?? '' };
}

/** Rows for a saved supplement, with the amounts as strings. */
export function rowsFromNutrients(
  nutrients: MedicationNutrients | undefined,
  customDefs: { name: string; unit: string }[]
): NutrientRow[] {
  if (!nutrients) return [];
  const rows: NutrientRow[] = [];
  for (const [key, value] of Object.entries(nutrients)) {
    if (key === 'custom_nutrients' || typeof value !== 'number') continue;
    const field = key as FoodVariantNutrientField;
    const meta = fixedMeta(field);
    rows.push({
      id: `fixed:${field}`,
      label: meta.label,
      unit: meta.unit,
      fixedField: field,
      value: String(value),
    });
  }
  for (const [name, value] of Object.entries(
    nutrients.custom_nutrients ?? {}
  )) {
    const def = customDefs.find((d) => d.name === name);
    rows.push({
      id: `custom:${name}`,
      label: name,
      unit: def?.unit ?? '',
      customName: name,
      value: String(value),
    });
  }
  return rows;
}

/** A typed amount as a number, or null when blank or not a non-negative number. */
export function parseAmount(text: string): number | null {
  if (text.trim() === '') return null;
  // Not Number(): it would take hex and exponent notation from pasted text.
  const value = parseDecimalInput(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Catalog ids whose custom nutrient must exist before the supplement is saved. */
export function catalogIdsToProvision(rows: NutrientRow[]): string[] {
  return rows
    .filter((row) => row.catalogId && parseAmount(row.value) != null)
    .map((row) => row.catalogId as string);
}

/**
 * The payload to save. `resolvedNames` maps a catalog id to the name of the
 * custom nutrient the server found or created for it, which can pre-date the
 * catalog's spelling. Blank rows are left out.
 */
export function buildNutrients(
  rows: NutrientRow[],
  resolvedNames: Record<string, string> = {}
): MedicationNutrients {
  const nutrients: MedicationNutrients = {};
  const custom: Record<string, number> = {};
  for (const row of rows) {
    const amount = parseAmount(row.value);
    if (amount == null) continue;
    if (row.fixedField) {
      nutrients[row.fixedField] = amount;
      continue;
    }
    const name =
      row.customName ??
      (row.catalogId ? resolvedNames[row.catalogId] : undefined);
    if (!name) continue;
    custom[name] = (custom[name] ?? 0) + amount;
  }
  if (Object.keys(custom).length > 0) nutrients.custom_nutrients = custom;
  return nutrients;
}

/** How many nutrients a supplement carries, for the compact "12 nutrients" line. */
export function countNutrients(nutrients: MedicationNutrients | undefined) {
  if (!nutrients) return 0;
  let count = Object.keys(nutrients.custom_nutrients ?? {}).length;
  for (const [key, value] of Object.entries(nutrients)) {
    if (key !== 'custom_nutrients' && typeof value === 'number') count += 1;
  }
  return count;
}

/** Rows for the nutrients a barcode lookup found, with their amounts filled in. */
export function rowsFromLookup(
  product: SupplementLookupProduct
): NutrientRow[] {
  const rows: NutrientRow[] = [];
  for (const { key, amount } of product.fixed) {
    const meta = fixedMeta(key);
    rows.push({
      id: `fixed:${key}`,
      label: meta.label,
      unit: meta.unit,
      fixedField: key,
      value: String(amount),
    });
  }
  for (const { catalogId, amount } of product.catalog) {
    const [row] = rowsForCatalogId(catalogId);
    if (row) rows.push({ ...row, value: String(amount) });
  }
  return rows;
}

/** The label's ingredients that were not added, for a short note. */
export function unmatchedSummary(
  product: SupplementLookupProduct,
  limit = 4
): { names: string; extra: number } | null {
  if (product.unmatched.length === 0) return null;
  const shown = product.unmatched.slice(0, limit).map((item) => item.name);
  return {
    names: shown.join(', '),
    extra: product.unmatched.length - shown.length,
  };
}
