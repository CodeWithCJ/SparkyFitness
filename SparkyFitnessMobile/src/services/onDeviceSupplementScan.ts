import {
  supplementLabelExtractionSchema,
  type SupplementLabelExtraction,
} from '@workspace/shared';
import OnDeviceNutritionModule, {
  type OnDeviceSupplementExtraction,
} from '../../modules/on-device-nutrition';
import { addLog } from './LogService';
import { isOnDeviceLabelScanAvailable } from './onDeviceLabelScan';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

// Largest amount a single Supplement Facts line can plausibly print (mcg of a
// B vitamin or IU of vitamin A reach the thousands, never millions).
const MAX_AMOUNT = 1_000_000;
// More than this share of lines the label text does not back up means the
// model is guessing, and the server's vision provider reads the photo instead.
const MAX_UNGROUNDED_SHARE = 1 / 3;

const FORMS = new Set([
  'tablet',
  'capsule',
  'softgel',
  'gummy',
  'powder',
  'liquid',
]);

// A comma or a space between groups of three is a thousands separator
// ("1,000", "1 200"). Any other comma is a decimal comma ("1,5"). A leading
// dot (".5") is part of the number, so the digits after it are not a separate
// amount.
const NUMBER_PATTERN =
  /[1-9]\d{0,2}(?:[ \u00A0\u202F]\d{3})+(?:[.,]\d+)?|[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?|\.\d+/g;

function parsePrinted(printed: string): number {
  const compact = printed.replace(/[ \u00A0\u202F]/g, '');
  return Number(
    /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(compact)
      ? compact.replace(/,/g, '')
      : compact.replace(',', '.')
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every letter or number in the name, so "Vitamin D" is not just "vitamin". */
function nameTokens(name: string): string[] {
  return name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Numbers that consume the whole printed token, so "5" is not found inside ".5". */
function completeNumbers(
  text: string
): { index: number; raw: string; value: number }[] {
  const found: { index: number; raw: string; value: number }[] = [];
  for (const match of text.matchAll(new RegExp(NUMBER_PATTERN.source, 'g'))) {
    const index = match.index ?? 0;
    const raw = match[0];
    const prev = index > 0 ? text[index - 1] : '';
    const next = text[index + raw.length] ?? '';
    if (/[\d.,]/.test(prev) || /[\d.,]/.test(next)) continue;
    // "200" in "1 200" is the rest of the thousands group, not its own amount.
    const before = text.slice(0, index);
    if (/^\d{3}$/.test(raw) && /\d[ \u00A0\u202F]+$/.test(before)) continue;
    if (/^[ \u00A0\u202F]+\d{3}(?!\d)/.test(text.slice(index + raw.length))) {
      continue;
    }
    const value = parsePrinted(raw);
    if (Number.isFinite(value)) found.push({ index, raw, value });
  }
  return found;
}

/** Every amount on the slice except a %DV, whatever its unit. */
function ingredientAmounts(text: string): { value: number; unit: string }[] {
  const found: { value: number; unit: string }[] = [];
  for (const num of completeNumbers(text)) {
    const after = text.slice(num.index + num.raw.length);
    const unitMatch = /^\s*([^\s\d,.;|]+)/.exec(after);
    if (!unitMatch) continue;
    const printed = unitMatch[1].replace(/[^a-zA-Z%µμ]+$/g, '').toLowerCase();
    if (!printed || printed.startsWith('%') || printed === 'dv') continue;
    found.push({ value: num.value, unit: printed });
  }
  return found;
}

/**
 * True only when one slice of the row (split on ";" or "|") names this
 * ingredient once and that slice has exactly one amount. A second amount,
 * even in another unit, makes the slice ambiguous, so the server scan runs.
 */
function rowGroundsIngredient(
  row: string,
  name: string,
  amount: number,
  unit: string | null
): boolean {
  const normalized = unit?.trim().toLowerCase();
  const tokens = nameTokens(name);
  if (!normalized || tokens.length === 0) return false;
  const namePattern = new RegExp(
    `(?:^|[^a-z0-9])${tokens.map(escapeRegExp).join('[^a-z0-9]+')}(?![a-z0-9])`,
    'gi'
  );
  let grounded = 0;
  for (const segment of row.split(/[;|]/)) {
    if (segment.match(namePattern)?.length !== 1) continue;
    const amounts = ingredientAmounts(segment);
    if (
      amounts.length === 1 &&
      amounts[0].unit === normalized &&
      amounts[0].value === amount
    ) {
      grounded += 1;
    }
  }
  return grounded === 1;
}

/**
 * Keeps an ingredient only when one slice of a recognised line names it and
 * prints that amount with its unit. A %DV, a digit inside ".5", or another
 * ingredient's amount on the same slice does not count. Null when too few
 * lines check out, so the caller falls back to the server.
 */
export function groundSupplementLabel(
  r: OnDeviceSupplementExtraction
): SupplementLabelExtraction | null {
  const text = r.ocr_text?.trim();
  if (!text) return null;
  const ocrRows = text.split(/\r?\n/);

  const lines = r.ingredients.filter((i) => i.name.trim() !== '');
  const grounded = lines.filter((ingredient) => {
    const { amount, unit } = ingredient;
    if (amount === null) return true;
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      return false;
    }
    return ocrRows.some((row) =>
      rowGroundsIngredient(row, ingredient.name, amount, unit)
    );
  });
  const withAmount = grounded.filter((i) => i.amount !== null);
  if (withAmount.length === 0) return null;
  if (lines.length - grounded.length > lines.length * MAX_UNGROUNDED_SHARE) {
    return null;
  }

  const form = r.form?.trim().toLowerCase() ?? null;
  const parsed = supplementLabelExtractionSchema.safeParse({
    name: r.name.trim() || null,
    brand: r.brand.trim() || null,
    form:
      form && FORMS.has(form)
        ? (form as SupplementLabelExtraction['form'])
        : null,
    serving: r.serving?.trim() || null,
    ingredients: grounded.map((i) => ({
      name: i.name.trim(),
      amount: i.amount,
      unit: i.unit?.trim() || null,
    })),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Reads a Supplement Facts panel with Apple's on-device model. Returns null
 * whenever the on-device path is off, unavailable, fails, or returns lines the
 * label text does not back up; the caller then uses the server scan. Shares the
 * "Scan Labels On Device" setting with the food label scan.
 */
export async function scanSupplementLabelOnDevice(
  base64Image: string
): Promise<SupplementLabelExtraction | null> {
  if (!useAppPreferencesStore.getState().onDeviceLabelScanEnabled) return null;
  if (!OnDeviceNutritionModule || !isOnDeviceLabelScanAvailable()) return null;
  try {
    const extraction =
      await OnDeviceNutritionModule.scanSupplementLabel(base64Image);
    const label = groundSupplementLabel(extraction);
    if (!label) {
      addLog(
        '[Supplement Scan] On-device values not found in the label text; falling back',
        'INFO'
      );
    }
    return label;
  } catch (error) {
    addLog(
      `[Supplement Scan] On-device scan failed: ${error instanceof Error ? error.message : String(error)}`,
      'WARNING'
    );
    return null;
  }
}
