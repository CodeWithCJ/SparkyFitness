import { getConversionFactor } from '@workspace/shared';

export interface PortionVariant {
  id?: string;
  food_id?: string;
  serving_size?: number | string | null;
  serving_unit?: string | null;
  is_default?: boolean | null;
  calories?: number | string | null;
  protein?: number | string | null;
  carbs?: number | string | null;
  fat?: number | string | null;
  alcohol_g?: number | string | null;
}

const aliases: Readonly<Record<string, string>> = {
  gram: 'g',
  grams: 'g',
  gm: 'g',
  grm: 'g',
  gr: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  servings: 'serving',
  slices: 'slice',
  pieces: 'piece',
  portions: 'portion',
  cups: 'cup',
  tablespoons: 'tbsp',
  tablespoon: 'tbsp',
  teaspoons: 'tsp',
  teaspoon: 'tsp',
  cans: 'can',
  bottles: 'bottle',
  units: 'unit',
  items: 'item',
  packs: 'pack',
  packets: 'packet',
  scoops: 'scoop',
  bars: 'bar',
};

export function normalizePortionUnit(value: unknown): string {
  const unit =
    typeof value === 'string'
      ? value.trim().toLowerCase().replace(/\s+/g, ' ')
      : '';
  const suffix = unit.match(
    /^(slices?|pieces?)[,\s]+(extra[ -]large|small|medium|large|regular|thin|thick)$/
  );
  const prefix = unit.match(
    /^(extra[ -]large|small|medium|large|regular|thin|thick)\s+(slices?|pieces?)$/
  );
  const count = suffix?.[1] ?? prefix?.[2],
    qualifier = suffix?.[2] ?? prefix?.[1];
  if (count && qualifier) {
    // Both "large slices" and FatSecret's "slice large" retain the qualifier.
    return `${aliases[count] ?? count} ${qualifier.replace('-', ' ')}`;
  }
  return aliases[unit] ?? unit;
}

export function nutrientNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateNutritionReference(
  variant: PortionVariant
): string | null {
  const size = nutrientNumber(variant.serving_size);
  const unit = normalizePortionUnit(variant.serving_unit);
  if (size === null || size <= 0 || !unit || /^\d/.test(unit)) {
    return 'The reference serving must have a positive size and a separate unit.';
  }
  if (['mg', 'mcg', 'µg', 'ug'].includes(unit)) {
    return 'The provider reports a food serving in milli/micrograms; verify the label.';
  }
  const nutrients = [
    variant.calories,
    variant.protein,
    variant.carbs,
    variant.fat,
    variant.alcohol_g,
  ];
  for (const value of nutrients) {
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      (nutrientNumber(value) === null || Number(value) < 0)
    ) {
      return 'The nutrition reference contains a negative or non-finite value.';
    }
  }
  const [calories, protein, carbs, fat, alcohol] =
    nutrients.map(nutrientNumber);
  const gramsFactor = getConversionFactor('g', unit);
  if (gramsFactor !== null) {
    const grams = size * gramsFactor;
    if (calories !== null && calories / grams > 10) {
      return 'The reported energy exceeds 1,000 kcal per 100 g; verify the source and units.';
    }
    if (
      protein !== null &&
      carbs !== null &&
      fat !== null &&
      protein + carbs + fat > grams * 1.15 + 1
    ) {
      return 'The reported macros exceed the serving weight; verify the source and units.';
    }
  }
  // A generous tolerance allows label rounding, fibre and polyols. Include
  // only source-reported alcohol, using the FAO general factor of 7 kcal/g:
  // https://www.fao.org/4/Y5022E/y5022e04.htm
  // This is a research trigger, never a formula for filling missing calories
  // or inferring alcohol grams from ABV or a guessed density.
  if (calories !== null && protein !== null && carbs !== null && fat !== null) {
    const macroEnergy = protein * 4 + carbs * 4 + fat * 9 + (alcohol ?? 0) * 7;
    if (macroEnergy > calories * 2 + 30 || calories > macroEnergy * 2 + 100) {
      return 'Calories and macros disagree substantially; verify the source before saving.';
    }
  }
  return null;
}

export type PortionResolution<T extends PortionVariant> =
  | { ok: true; variant: T; quantity: number; unit: string }
  | { ok: false; message: string };

/** Resolve to the SAME unit as the nutrient reference, without density guesses. */
export function resolveFoodPortion<T extends PortionVariant>(args: {
  quantity: number;
  unit?: string;
  variants: readonly T[];
  preferredVariant?: T | null;
  explicitVariant?: T;
}): PortionResolution<T> {
  if (!Number.isFinite(args.quantity) || args.quantity <= 0) {
    return {
      ok: false,
      message: 'Consumed quantity must be a finite positive number.',
    };
  }
  const requested = normalizePortionUnit(args.unit || 'serving');
  if (/^\d/.test(requested)) {
    return {
      ok: false,
      message: `Unit "${args.unit}" includes a reference size. Supply the consumed quantity and bare unit separately.`,
    };
  }
  const candidates = args.explicitVariant
    ? [args.explicitVariant]
    : args.variants;
  const convert = (variant: T): { quantity: number; unit: string } | null => {
    const size = nutrientNumber(variant.serving_size);
    const unit = normalizePortionUnit(variant.serving_unit);
    if (size === null || size <= 0 || !unit || /^\d/.test(unit)) return null;
    if (requested === 'serving')
      return { quantity: args.quantity * size, unit: variant.serving_unit! };
    if (requested === unit)
      return { quantity: args.quantity, unit: variant.serving_unit! };
    const factor = getConversionFactor(unit, requested);
    if (factor === null) return null;
    return { quantity: args.quantity * factor, unit: variant.serving_unit! };
  };
  const preferred =
    args.explicitVariant ??
    args.preferredVariant ??
    candidates.find((v) => v.is_default);
  const exact = candidates.filter(
    (variant) =>
      normalizePortionUnit(variant.serving_unit) === requested &&
      convert(variant)
  );
  if (!args.explicitVariant && requested !== 'serving' && exact.length > 1) {
    const totals = exact.map((variant) => {
      const factor = args.quantity / Number(variant.serving_size);
      return ['calories', 'protein', 'carbs', 'fat'].map((field) => {
        const value = nutrientNumber(variant[field as keyof PortionVariant]);
        return value === null ? null : value * factor;
      });
    });
    const differs = totals.slice(1).some((values) =>
      values.some((value, index) => {
        const first = totals[0][index];
        return value === null || first === null
          ? value !== first
          : Math.abs(value - first) >
              Math.max(index === 0 ? 2 : 0.5, Math.max(value, first) * 0.1);
      })
    );
    if (differs)
      return {
        ok: false,
        message: `Several verified references for ${args.unit} have different nutrition. Select the exact serving ID or ask which portion the user means before saving.`,
      };
  }
  // Prefer an exact count unit over any metric conversion; a provider's slice
  // reference already includes its verified weight and nutrient equivalents.
  const selected =
    requested === 'serving'
      ? (preferred ?? candidates[0])
      : (candidates.find(
          (v) =>
            normalizePortionUnit(v.serving_unit) === requested && convert(v)
        ) ?? candidates.find((v) => convert(v)));
  const resolved = selected && convert(selected);
  if (!selected || !resolved || !Number.isFinite(resolved.quantity)) {
    const available = candidates
      .map((v) => `${v.serving_size} ${v.serving_unit}`)
      .join(', ');
    return {
      ok: false,
      message: `Cannot safely convert ${args.quantity} ${args.unit || 'serving'} to a verified reference serving. Available: ${available || 'none'}. Try up to three source candidates, then ask for the portion weight or label. Never guess a count-to-weight or grams-to-millilitres conversion.`,
    };
  }
  return { ok: true, variant: selected, ...resolved };
}
