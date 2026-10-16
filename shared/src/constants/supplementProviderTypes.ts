// The external provider that backs the supplement barcode lookup (NIH Dietary
// Supplement Label Database). It is a provider like the food ones: an
// `external_data_providers` row of this type has to be active and visible to the
// user for `GET /api/v2/medications/supplement-lookup` to answer.
export const SUPPLEMENT_LOOKUP_PROVIDER_TYPE = "dsld";
