import { z } from 'zod';
import {
  BARS_MAX,
  BAR_KINDS,
  BAR_WEIGHT_MAX,
  isValidPlateWeight,
  PLATE_DENOMINATIONS_MAX,
  PLATE_PAIRS_MAX,
  PLATE_WEIGHT_DECIMALS,
  PLATE_WEIGHT_MAX,
  PLATE_WEIGHT_MIN,
} from '../../utils/plateCalculator.ts';

export const plateUnitSchema = z.enum(['kg', 'lbs']);
export const barKindSchema = z.enum(BAR_KINDS);

const weightStep = `at most ${PLATE_WEIGHT_DECIMALS} decimals`;

const plateWeightSchema = z
  .number()
  .min(PLATE_WEIGHT_MIN)
  .max(PLATE_WEIGHT_MAX)
  .refine(isValidPlateWeight, { message: weightStep });

export const plateDenominationSchema = z.object({
  weight: plateWeightSchema,
  /** Pairs owned (one plate per side); 0 keeps the size listed but unused. */
  pairs: z.number().int().min(0).max(PLATE_PAIRS_MAX),
});

export const plateBarSchema = z.object({
  id: z.string().min(1).max(64),
  /** Typed by the person; null shows the translated label for `kind`. */
  name: z.string().trim().min(1).max(60).nullable(),
  kind: barKindSchema,
  weight: z
    .number()
    .min(0)
    .max(BAR_WEIGHT_MAX)
    .refine(isValidPlateWeight, { message: weightStep }),
});

/** Most dumbbell sizes or stack steps one gym lists. */
export const GYM_WEIGHT_STEPS_MAX = 80;
/** Most machines with their own weight stack one gym lists. */
export const GYM_MACHINE_STACKS_MAX = 60;

/** Sorted, distinct weights (dumbbells or one machine's stack steps). */
const weightStepsSchema = z
  .array(plateWeightSchema)
  .max(GYM_WEIGHT_STEPS_MAX)
  .transform((weights) => [...new Set(weights)].sort((a, b) => a - b));

/** A machine's real weight stack, odd steps included, in `weight_unit`. */
export const machineStackSchema = z.object({
  exercise_id: z.string().uuid(),
  /** The exercise's name when saved, so lists can show it without a lookup. */
  exercise_name: z.string().trim().max(120).nullable().optional(),
  weights: weightStepsSchema,
});

/**
 * Full replacement of the active gym's equipment. `name`, `dumbbells` and
 * `machine_stacks` came with gym profiles; leaving them out keeps what the
 * gym has, so older apps that only send plates and bars lose nothing.
 */
export const savePlateInventoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).nullable().optional(),
    dumbbells: weightStepsSchema.optional(),
    machine_stacks: z
      .array(machineStackSchema)
      .max(GYM_MACHINE_STACKS_MAX)
      .optional(),
    weight_unit: plateUnitSchema,
    bars: z.array(plateBarSchema).min(1).max(BARS_MAX),
    plates: z.array(plateDenominationSchema).max(PLATE_DENOMINATIONS_MAX),
    collars_enabled: z.boolean(),
    /** Weight of one collar, in `weight_unit`. */
    collar_weight: z
      .number()
      .min(0)
      .max(PLATE_WEIGHT_MAX)
      .refine(isValidPlateWeight, { message: weightStep }),
  })
  .superRefine((value, ctx) => {
    const weights = new Set<number>();
    value.plates.forEach((plate, index) => {
      if (weights.has(plate.weight)) {
        ctx.addIssue({
          code: 'custom',
          path: ['plates', index, 'weight'],
          message: 'Each plate weight can be listed once',
        });
      }
      weights.add(plate.weight);
    });
    const ids = new Set<string>();
    value.bars.forEach((bar, index) => {
      if (ids.has(bar.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['bars', index, 'id'],
          message: 'Bar ids must be unique',
        });
      }
      ids.add(bar.id);
    });
  });
export type SavePlateInventoryBody = z.infer<
  typeof savePlateInventoryBodySchema
>;

export const plateInventoryResponseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  // Gym profile fields. Optional: servers from before gym profiles omit them.
  name: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  dumbbells: z.array(z.number()).optional(),
  machine_stacks: z
    .array(
      z.object({
        exercise_id: z.string(),
        exercise_name: z.string().nullable().optional(),
        weights: z.array(z.number()),
      })
    )
    .optional(),
  weight_unit: plateUnitSchema,
  bars: z.array(plateBarSchema),
  plates: z.array(plateDenominationSchema),
  collars_enabled: z.boolean(),
  collar_weight: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PlateInventoryResponse = z.infer<
  typeof plateInventoryResponseSchema
>;

/** `inventory` is null until the person saves one. */
export const getPlateInventoryResponseSchema = z.object({
  inventory: plateInventoryResponseSchema.nullable(),
});
export type GetPlateInventoryResponse = z.infer<
  typeof getPlateInventoryResponseSchema
>;

/** All of a person's gyms; exactly one is active (the one the calculator uses). */
export const listGymsResponseSchema = z.object({
  gyms: z.array(plateInventoryResponseSchema),
});
export type ListGymsResponse = z.infer<typeof listGymsResponseSchema>;
