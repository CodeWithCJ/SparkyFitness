import { z } from 'zod';
import { isDayString } from '../../utils/timezone.ts';

export const MOOD_RATING_MIN = 1;
export const MOOD_RATING_MAX = 5;

export const moodRatingSchema = z
  .number()
  .int()
  .min(MOOD_RATING_MIN)
  .max(MOOD_RATING_MAX);

// Optional energy and focus ratings on a mood entry. An absent key means "keep
// the stored value"; an explicit null means "clear it".
export const moodRatingsBodySchema = z.object({
  energy_value: moodRatingSchema.nullable().optional(),
  focus_value: moodRatingSchema.nullable().optional(),
});

export type MoodRatingsBody = z.infer<typeof moodRatingsBodySchema>;

// Clients that send this header with a value of 2 or more get several check-ins
// per day (arrays, mood-less check-ins). Without it the API keeps one mood per
// day.
export const MOOD_MODEL_VERSION_HEADER = 'X-Mood-Model-Version';
export const MOOD_MODEL_VERSION = 2;

const moodDaySchema = z
  .string()
  .refine(isDayString, { message: 'Expected a real YYYY-MM-DD date' });
// A number or numeric string; the route clamps it onto the stored 10-100 scale.
const moodValueInputSchema = z.union([z.number(), z.string()]);

const moodCheckinFieldsShape = {
  mood_value: moodValueInputSchema,
  energy_value: moodRatingSchema,
  focus_value: moodRatingSchema,
  notes: z.string(),
  mood_tags: z.array(z.string()),
  entry_date: moodDaySchema,
  entry_timestamp: z.iso.datetime({ offset: true }),
};

// v2 POST: every field optional; the route requires at least one of mood,
// energy, focus, notes or tags.
export const moodCheckinCreateBodySchema = z.object({
  mood_value: moodCheckinFieldsShape.mood_value.optional(),
  energy_value: moodCheckinFieldsShape.energy_value.optional(),
  focus_value: moodCheckinFieldsShape.focus_value.optional(),
  notes: moodCheckinFieldsShape.notes.optional(),
  mood_tags: moodCheckinFieldsShape.mood_tags.optional(),
  entry_date: moodCheckinFieldsShape.entry_date.optional(),
  entry_timestamp: moodCheckinFieldsShape.entry_timestamp.optional(),
});

// v2 PUT: an absent field is kept and an explicit null clears it. entry_date and
// entry_timestamp are never null (the columns are NOT NULL).
export const moodCheckinUpdateBodySchema = z.object({
  mood_value: moodCheckinFieldsShape.mood_value.nullable().optional(),
  energy_value: moodCheckinFieldsShape.energy_value.nullable().optional(),
  focus_value: moodCheckinFieldsShape.focus_value.nullable().optional(),
  notes: moodCheckinFieldsShape.notes.nullable().optional(),
  mood_tags: moodCheckinFieldsShape.mood_tags.nullable().optional(),
  entry_date: moodCheckinFieldsShape.entry_date.optional(),
  entry_timestamp: moodCheckinFieldsShape.entry_timestamp.optional(),
});

export type MoodCheckinCreateBody = z.infer<typeof moodCheckinCreateBodySchema>;
export type MoodCheckinUpdateBody = z.infer<typeof moodCheckinUpdateBodySchema>;
