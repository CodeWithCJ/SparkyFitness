import { z } from 'zod';
import {
  HR_ZONE_COUNT,
  HR_ZONE_METHODS,
  MAX_MAX_HR,
  MAX_RESTING_HR,
  MIN_MAX_HR,
  MIN_RESTING_HR,
  customFloorsProblem,
} from '../../utils/heartRateZones.ts';

export const hrZoneMethodSchema = z.enum(HR_ZONE_METHODS);

/** Where the maximum heart rate in use came from. */
export const maxHrSourceSchema = z.enum([
  'user',
  'age',
  'observed',
  'fallback',
]);

/** What the person saved. Null / default means "work it out". */
export const heartRateZoneSettingsResponseSchema = z.object({
  max_heart_rate: z.number().int().nullable(),
  resting_heart_rate: z.number().int().nullable(),
  method: hrZoneMethodSchema,
  custom_floors: z.array(z.number().int()).length(HR_ZONE_COUNT).nullable(),
  /** Five zones or four tiers in the app's displays. */
  display_zones: z.union([z.literal(4), z.literal(5)]),
});
export type HeartRateZoneSettingsResponse = z.infer<
  typeof heartRateZoneSettingsResponseSchema
>;

export const heartRateZoneResponseSchema = z.object({
  zone: z.number().int().min(1).max(HR_ZONE_COUNT),
  lower_bpm: z.number().int(),
  /** null for the open-ended top zone. */
  upper_bpm: z.number().int().nullable(),
});

/** The zones those settings (plus date of birth) produce today. */
export const resolvedHeartRateZonesResponseSchema = z.object({
  max_hr: z.number().int(),
  max_hr_source: maxHrSourceSchema,
  resting_hr: z.number().int().nullable(),
  method: hrZoneMethodSchema,
  /** The method actually in use; differs from `method` when the chosen one lacked what it needs. */
  effective_method: hrZoneMethodSchema,
  zones: z.array(heartRateZoneResponseSchema).length(HR_ZONE_COUNT),
});
export type ResolvedHeartRateZonesResponse = z.infer<
  typeof resolvedHeartRateZonesResponseSchema
>;

export const heartRateZonesResponseSchema = z.object({
  settings: heartRateZoneSettingsResponseSchema,
  resolved: resolvedHeartRateZonesResponseSchema,
});
export type HeartRateZonesResponse = z.infer<
  typeof heartRateZonesResponseSchema
>;

/**
 * PUT body. Every field is optional; a field that is present replaces the
 * stored one and `null` clears it (back to "work it out"). `reset: true`
 * returns everything to the defaults and ignores the other fields.
 */
export const updateHeartRateZonesBodySchema = z
  .object({
    max_heart_rate: z
      .number()
      .int()
      .min(MIN_MAX_HR)
      .max(MAX_MAX_HR)
      .nullable()
      .optional(),
    resting_heart_rate: z
      .number()
      .int()
      .min(MIN_RESTING_HR)
      .max(MAX_RESTING_HR)
      .nullable()
      .optional(),
    method: hrZoneMethodSchema.optional(),
    custom_floors: z.array(z.number().int()).nullable().optional(),
    display_zones: z.union([z.literal(4), z.literal(5)]).optional(),
    reset: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.reset) return;
    if (body.custom_floors != null) {
      const problem = customFloorsProblem(body.custom_floors);
      if (problem) {
        ctx.addIssue({
          code: 'custom',
          path: ['custom_floors'],
          message: problem,
        });
      }
    }
  });
export type UpdateHeartRateZonesBody = z.infer<
  typeof updateHeartRateZonesBodySchema
>;

/** How a stored time-in-zone breakdown was worked out. */
export const storedZoneMethodSchema = z.enum([...HR_ZONE_METHODS, 'device']);
export type StoredZoneMethod = z.infer<typeof storedZoneMethodSchema>;
