import { z } from "zod/v4";

const coerceLegacyNumber = (value: unknown) => {
  if (typeof value !== "string") {
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
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, `${fieldName} is required`),
  );

const optionalLegacyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const nullableOptionalLegacyString = z.preprocess(
  (value) => {
    if (value === "") {
      return null;
    }

    return value;
  },
  z.string().nullable().optional(),
);

const requiredLegacyNumber = z.preprocess(coerceLegacyNumber, z.number());

const optionalLegacyNumber = z.preprocess(
  (value) => {
    if (value === "") {
      return undefined;
    }

    return coerceLegacyNumber(value);
  },
  z.number().optional(),
);

const nullableLegacyNumber = z.preprocess(
  (value) => {
    if (value === null || value === "") {
      return null;
    }

    return coerceLegacyNumber(value);
  },
  z.number().nullable(),
);

const nullableOptionalLegacyNumber = z.preprocess(
  (value) => {
    if (value === "") {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return coerceLegacyNumber(value);
  },
  z.number().nullable().optional(),
);

export const UpsertWaterIntakeBodySchema = z.object({
  entry_date: requiredLegacyString("entry_date"),
  change_drinks: requiredLegacyNumber,
  container_id: nullableLegacyNumber,
  user_id: optionalLegacyString,
}).loose();

export type UpsertWaterIntakeBody = z.infer<typeof UpsertWaterIntakeBodySchema>;

export const UpdateWaterIntakeBodySchema = z.object({
  water_ml: optionalLegacyNumber,
  entry_date: optionalLegacyString,
  source: optionalLegacyString,
}).loose();

export type UpdateWaterIntakeBody = z.infer<typeof UpdateWaterIntakeBodySchema>;

export const UpsertCheckInBodySchema = z.object({
  entry_date: requiredLegacyString("entry_date"),
  weight: optionalLegacyNumber,
  neck: optionalLegacyNumber,
  waist: optionalLegacyNumber,
  hips: optionalLegacyNumber,
  steps: optionalLegacyNumber,
  height: optionalLegacyNumber,
  body_fat_percentage: optionalLegacyNumber,
  user_id: optionalLegacyString,
}).loose();

export type UpsertCheckInBody = z.infer<typeof UpsertCheckInBodySchema>;

export const UpdateCheckInBodySchema = z.object({
  entry_date: optionalLegacyString,
  weight: nullableOptionalLegacyNumber,
  neck: nullableOptionalLegacyNumber,
  waist: nullableOptionalLegacyNumber,
  hips: nullableOptionalLegacyNumber,
  steps: nullableOptionalLegacyNumber,
  height: nullableOptionalLegacyNumber,
  body_fat_percentage: nullableOptionalLegacyNumber,
  user_id: optionalLegacyString,
}).loose();

export type UpdateCheckInBody = z.infer<typeof UpdateCheckInBodySchema>;

export const CreateCustomCategoryBodySchema = z.object({
  name: requiredLegacyString("name"),
  display_name: nullableOptionalLegacyString,
  frequency: requiredLegacyString("frequency"),
  measurement_type: requiredLegacyString("measurement_type"),
  data_type: nullableOptionalLegacyString,
}).loose();

export type CreateCustomCategoryBody = z.infer<typeof CreateCustomCategoryBodySchema>;

export const UpdateCustomCategoryBodySchema = z.object({
  name: optionalLegacyString,
  display_name: nullableOptionalLegacyString,
  frequency: optionalLegacyString,
  measurement_type: optionalLegacyString,
  data_type: nullableOptionalLegacyString,
}).loose();

export type UpdateCustomCategoryBody = z.infer<typeof UpdateCustomCategoryBodySchema>;

export const UpsertCustomEntryBodySchema = z.object({
  category_id: requiredLegacyString("category_id"),
  value: z.union([requiredLegacyNumber, requiredLegacyString("value"), z.boolean()]),
  entry_date: requiredLegacyString("entry_date"),
  entry_hour: nullableOptionalLegacyNumber,
  entry_timestamp: optionalLegacyString,
  notes: optionalLegacyString,
  source: optionalLegacyString,
}).loose();

export type UpsertCustomEntryBody = z.infer<typeof UpsertCustomEntryBodySchema>;

export const DateParamSchema = z.object({
  date: requiredLegacyString("date"),
}).loose();

export type DateParam = z.infer<typeof DateParamSchema>;

export const UuidParamSchema = z.object({
  id: requiredLegacyString("id"),
}).loose();

export type UuidParam = z.infer<typeof UuidParamSchema>;

export const DateRangeParamSchema = z.object({
  startDate: requiredLegacyString("startDate"),
  endDate: requiredLegacyString("endDate"),
}).loose();

export type DateRangeParam = z.infer<typeof DateRangeParamSchema>;

export const CustomMeasurementsRangeParamSchema = z.object({
  categoryId: requiredLegacyString("categoryId"),
  startDate: requiredLegacyString("startDate"),
  endDate: requiredLegacyString("endDate"),
}).loose();

export type CustomMeasurementsRangeParam = z.infer<typeof CustomMeasurementsRangeParamSchema>;
