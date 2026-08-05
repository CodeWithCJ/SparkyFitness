import { z } from "zod";

// Branded so a public.medications id cannot be passed where another table's id belongs.
// z.string().and(z.object(...)) was the shape here, but an intersection of a
// primitive and an object cannot parse any value, so the schema rejected every
// UUID it was given.
export const medicationsIdSchema = z
  .string()
  .uuid()
  .brand<"public.medications">();

// A user id is a UUID string. z.any() accepted anything and inferred as any,
// which erased the contract for every consumer of these types.
const userIdSchema = z.string().uuid();
const nutrientValueSchema = z.number().nonnegative();

export const medicationNutrientsSchema = z.object({
  calories: nutrientValueSchema.optional(),
  protein: nutrientValueSchema.optional(),
  carbs: nutrientValueSchema.optional(),
  fat: nutrientValueSchema.optional(),
  saturated_fat: nutrientValueSchema.optional(),
  polyunsaturated_fat: nutrientValueSchema.optional(),
  monounsaturated_fat: nutrientValueSchema.optional(),
  trans_fat: nutrientValueSchema.optional(),
  cholesterol: nutrientValueSchema.optional(),
  sodium: nutrientValueSchema.optional(),
  potassium: nutrientValueSchema.optional(),
  dietary_fiber: nutrientValueSchema.optional(),
  sugars: nutrientValueSchema.optional(),
  vitamin_a: nutrientValueSchema.optional(),
  vitamin_c: nutrientValueSchema.optional(),
  calcium: nutrientValueSchema.optional(),
  iron: nutrientValueSchema.optional(),
  custom_nutrients: z.record(z.string(), nutrientValueSchema).optional(),
});

const medicationsFieldsSchema = z.object({
  user_id: userIdSchema,
  name: z.string(),
  display_name: z.string().nullable(),
  type_id: z.string().nullable(),
  route_id: z.string().nullable(),
  strength_value: z.number().nullable(),
  strength_unit: z.string().nullable(),
  dose_amount: z.number().nullable(),
  dose_unit: z.string().nullable(),
  rxnorm_rxcui: z.string().nullable(),
  ndc: z.string().nullable(),
  prescriber: z.string().nullable(),
  pharmacy: z.string().nullable(),
  rx_number: z.string().nullable(),
  reason_text: z.string().nullable(),
  effectiveness_rating: z.number().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  photo_path: z.string().nullable(),
  is_active: z.boolean(),
  is_quick: z.boolean(),
  is_glp1: z.boolean(),
  is_supplement: z.boolean(),
  nutrients: medicationNutrientsSchema,
  notes: z.string().nullable(),
  source: z.string(),
  custom_fields: z.unknown(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const medicationsSchema = medicationsFieldsSchema.extend({
  id: medicationsIdSchema,
});

export const medicationsInitializerSchema = medicationsFieldsSchema
  .partial()
  .extend({
    user_id: userIdSchema,
    name: z.string(),
  });

export const medicationsMutatorSchema = medicationsFieldsSchema
  .partial()
  .extend({
    id: medicationsIdSchema.optional(),
  });

export type Medications = z.infer<typeof medicationsSchema>;
export type MedicationsInitializer = z.infer<
  typeof medicationsInitializerSchema
>;
export type MedicationsMutator = z.infer<typeof medicationsMutatorSchema>;
