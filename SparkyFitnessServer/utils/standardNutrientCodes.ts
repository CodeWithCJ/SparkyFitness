// Fills the standard nutrition columns from a provider that identifies its
// nutrients by code (Swiss Food, Livsmedelsverket). Codes stay the same in
// every language a provider serves, unlike the nutrient names, so the label map
// this returns lets the client badge a field in whatever language it came in.

export interface StandardNutrientsByCode<Field extends string> {
  // Value per standard column; 0 when the food reports none of its codes.
  values: Record<Field, number>;
  // Standard column per provider label, for the code that filled it. Sent to
  // the client as provider_nutrient_standard.
  providerNutrientStandard: Record<string, string>;
}

// codeTable lists the provider codes behind each standard column, in order of
// preference; the first code the food reports wins. valuesByCode and
// labelsByCode must use the same code spelling as codeTable.
export function mapStandardNutrientsByCode<Field extends string>(
  codeTable: Readonly<Record<Field, readonly string[]>>,
  valuesByCode: Readonly<Record<string, number>>,
  labelsByCode: Readonly<Record<string, string>>
): StandardNutrientsByCode<Field> {
  const values = {} as Record<Field, number>;
  const providerNutrientStandard: Record<string, string> = {};
  for (const field of Object.keys(codeTable) as Field[]) {
    const code = codeTable[field].find((c) => valuesByCode[c] !== undefined);
    values[field] = code ? (valuesByCode[code] ?? 0) : 0;
    const label = code ? labelsByCode[code] : undefined;
    if (label) providerNutrientStandard[label] = field;
  }
  return { values, providerNutrientStandard };
}
