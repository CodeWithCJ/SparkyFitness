import { z } from 'zod/v4';

const coerceLegacyNumber = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? value : parsed;
};

const requiredLegacyString = (fieldName: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1, `${fieldName} is required`)
  );

const optionalLegacyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional()
);

const nullableOptionalLegacyString = z.preprocess((value) => {
  if (value === '') {
    return null;
  }

  return value;
}, z.string().nullable().optional());

const requiredLegacyNumber = z.preprocess(coerceLegacyNumber, z.number());

const optionalLegacyNumber = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  return coerceLegacyNumber(value);
}, z.number().optional());

const nullableOptionalLegacyNumber = z.preprocess((value) => {
  if (value === '') {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return coerceLegacyNumber(value);
}, z.number().nullable().optional());

export const UpsertWaterIntakeBodySchema = z
  .object({
    entry_date: requiredLegacyString('entry_date'),
    change_drinks: requiredLegacyNumber,
    container_id: nullableOptionalLegacyNumber,
    user_id: optionalLegacyString,
  })
  .loose();

export type UpsertWaterIntakeBody = z.infer<typeof UpsertWaterIntakeBodySchema>;

export const UpdateWaterIntakeBodySchema = z
  .object({
    water_ml: optionalLegacyNumber,
    entry_date: optionalLegacyString,
    source: optionalLegacyString,
  })
  .loose();

export type UpdateWaterIntakeBody = z.infer<typeof UpdateWaterIntakeBodySchema>;

export const UpsertCheckInBodySchema = z
  .object({
    entry_date: requiredLegacyString('entry_date'),
    weight: nullableOptionalLegacyNumber,
    neck: nullableOptionalLegacyNumber,
    waist: nullableOptionalLegacyNumber,
    hips: nullableOptionalLegacyNumber,
    steps: nullableOptionalLegacyNumber,
    height: nullableOptionalLegacyNumber,
    body_fat_percentage: nullableOptionalLegacyNumber,
  })
  .loose();

export type UpsertCheckInBody = z.infer<typeof UpsertCheckInBodySchema>;

export const UpdateCheckInBodySchema = z
  .object({
    entry_date: optionalLegacyString,
    weight: nullableOptionalLegacyNumber,
    neck: nullableOptionalLegacyNumber,
    waist: nullableOptionalLegacyNumber,
    hips: nullableOptionalLegacyNumber,
    steps: nullableOptionalLegacyNumber,
    height: nullableOptionalLegacyNumber,
    body_fat_percentage: nullableOptionalLegacyNumber,
  })
  .loose();

export type UpdateCheckInBody = z.infer<typeof UpdateCheckInBodySchema>;

export const CreateCustomCategoryBodySchema = z
  .object({
    name: requiredLegacyString('name'),
    display_name: nullableOptionalLegacyString,
    frequency: requiredLegacyString('frequency'),
    measurement_type: requiredLegacyString('measurement_type'),
    data_type: nullableOptionalLegacyString,
  })
  .loose();

export type CreateCustomCategoryBody = z.infer<
  typeof CreateCustomCategoryBodySchema
>;

export const UpdateCustomCategoryBodySchema = z
  .object({
    name: optionalLegacyString,
    display_name: nullableOptionalLegacyString,
    frequency: optionalLegacyString,
    measurement_type: optionalLegacyString,
    data_type: nullableOptionalLegacyString,
  })
  .loose();

export type UpdateCustomCategoryBody = z.infer<
  typeof UpdateCustomCategoryBodySchema
>;

export const UpsertCustomEntryBodySchema = z
  .object({
    category_id: requiredLegacyString('category_id'),
    value: z.union([
      requiredLegacyNumber,
      requiredLegacyString('value'),
      z.boolean(),
    ]),
    entry_date: requiredLegacyString('entry_date'),
    entry_hour: nullableOptionalLegacyNumber,
    entry_timestamp: optionalLegacyString,
    notes: optionalLegacyString,
    source: optionalLegacyString,
  })
  .loose();

export type UpsertCustomEntryBody = z.infer<typeof UpsertCustomEntryBodySchema>;

export const DateParamSchema = z
  .object({
    date: requiredLegacyString('date'),
  })
  .loose();

export type DateParam = z.infer<typeof DateParamSchema>;

export const UuidParamSchema = z
  .object({
    id: z.string().uuid(),
  })
  .loose();

export type UuidParam = z.infer<typeof UuidParamSchema>;

export const DateRangeParamSchema = z
  .object({
    startDate: requiredLegacyString('startDate'),
    endDate: requiredLegacyString('endDate'),
  })
  .loose();

export type DateRangeParam = z.infer<typeof DateRangeParamSchema>;

export const CustomMeasurementsRangeParamSchema = z
  .object({
    categoryId: requiredLegacyString('categoryId'),
    startDate: requiredLegacyString('startDate'),
    endDate: requiredLegacyString('endDate'),
  })
  .loose();

export type CustomMeasurementsRangeParam = z.infer<
  typeof CustomMeasurementsRangeParamSchema
>;

export const UpdateWaterIntakeLogTimeBodySchema = z
  .object({
    loggedAt: z.string().datetime({
      message: 'loggedAt must be a valid ISO 8601 datetime string',
    }),
  })
  .strict();

export type UpdateWaterIntakeLogTimeBody = z.infer<
  typeof UpdateWaterIntakeLogTimeBodySchema
>;

// CSV import of health data (measurements, sleep, vitals, activity, hydration).
// Rows are parsed client-side into flat HealthDataPayloadItem-shaped objects and
// fed straight into measurementService.processHealthData, which owns the real
// per-type validation, timezone resolution, and dedup. The schema is therefore
// deliberately permissive (.loose()) and only enforces the invariants the
// pipeline itself assumes: a type, and at least one date/timestamp field.
export const ImportHealthDataItemSchema = z
  .object({
    type: requiredLegacyString('type'),
    value: nullableOptionalLegacyNumber,
    unit: optionalLegacyString,
    date: optionalLegacyString,
    entry_date: optionalLegacyString,
    timestamp: optionalLegacyString,
    source: optionalLegacyString,
    source_id: optionalLegacyString,
    record_timezone: nullableOptionalLegacyString,
    record_utc_offset_minutes: nullableOptionalLegacyNumber,
    // Sleep session fields (only present on SleepSession rows).
    bedtime: optionalLegacyString,
    wake_time: optionalLegacyString,
    duration_in_seconds: nullableOptionalLegacyNumber,
    time_asleep_in_seconds: nullableOptionalLegacyNumber,
    deep_sleep_seconds: nullableOptionalLegacyNumber,
    light_sleep_seconds: nullableOptionalLegacyNumber,
    rem_sleep_seconds: nullableOptionalLegacyNumber,
    awake_sleep_seconds: nullableOptionalLegacyNumber,
    sleep_score: nullableOptionalLegacyNumber,
    entry_hour: nullableOptionalLegacyNumber,
    notes: optionalLegacyString,
  })
  .loose()
  .refine((item) => Boolean(item.date || item.entry_date || item.timestamp), {
    message: 'Each row needs a date, entry_date, or timestamp',
    path: ['date'],
  });

export type ImportHealthDataItem = z.infer<typeof ImportHealthDataItemSchema>;

export const ImportHealthDataBodySchema = z
  .object({
    items: z
      .array(ImportHealthDataItemSchema)
      .min(1, 'items must contain at least one row')
      .max(5000, 'items cannot exceed 5000 rows per request'),
  })
  .loose();

export type ImportHealthDataBody = z.infer<typeof ImportHealthDataBodySchema>;
