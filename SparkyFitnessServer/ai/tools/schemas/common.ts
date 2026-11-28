import { z } from 'zod';
import { VALID_PROVIDER_TYPES } from '../../../constants/foodProviders.js';

// Models send flags as strings, and z.coerce.boolean() reads "false" as
// true. Accepted: booleans, the numbers 1/0, and the strings true/false/1/0
// (trimmed, any case). null and blank strings mean not set. Anything else is
// left for z.boolean() to reject.
export function parseFlag(value: unknown): unknown {
  if (value === null) return undefined;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value !== 'string') return value;
  const word = value.trim().toLowerCase();
  if (word === '') return undefined;
  if (word === 'true' || word === '1') return true;
  if (word === 'false' || word === '0') return false;
  return value;
}

export const flagSchema = z.preprocess(parseFlag, z.boolean().optional());

// Day-string input. Accepts strict YYYY-MM-DD plus the forgiving forms small
// local models commonly emit: "today"/"yesterday"/"tomorrow" keywords and ISO
// timestamps ("2026-07-10T00:00:00"). Handlers call normalizeDayKeywords()
// (ai/tools/dates.ts) on rawArgs before their strict per-action parse, so
// services always receive plain YYYY-MM-DD day strings. Rejecting these forms
// at the published-schema layer instead would fail inside the AI SDK before
// execute() runs, surfacing a raw Zod dump the model can't recover from.
const DAY_INPUT_REGEX =
  /^(?:\d{4}-\d{2}-\d{2}(?:[T ].*)?|today|yesterday|tomorrow)$/i;
const DAY_INPUT_MESSAGE =
  'Date must be in YYYY-MM-DD format (or "today", "yesterday", "tomorrow")';

// Shared by the date params: "today" and an omitted date both resolve with the
// timezone from the active account's profile (loadUserTimezone, which returns UTC when
// none is set or it is invalid).
export const DAY_TIMEZONE_NOTE =
  'Days are calendar days in the active account\'s profile timezone (UTC if none is set), so "today" resolves there.';

// Use at call sites that re-describe a shared date schema: zod's describe()
// replaces the shared description, so the note has to be added again.
export const withDayNote = (text: string) =>
  `${text.replace(/[.\s]+$/, '')}. ${DAY_TIMEZONE_NOTE}`;

// Date validation (YYYY-MM-DD)
export const dateSchema = z
  .string()
  .regex(DAY_INPUT_REGEX, DAY_INPUT_MESSAGE)
  .describe(
    `Date in YYYY-MM-DD format, or "today"/"yesterday"/"tomorrow". ${DAY_TIMEZONE_NOTE}`
  );

// Wall-clock time of day for a diary entry. Matches the web contract
// (timeStringSchema in shared/schemas/api/ExerciseEntries.api.zod.ts): 24-hour
// HH:MM, optionally with seconds. Optional everywhere — entries logged without
// a time keep a NULL entry_time, exactly as they do from the web.
export const optionalEntryTimeSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    'Entry time must be in 24-hour HH:MM format.'
  )
  .optional()
  .describe(
    'Time of day for the entry in 24-hour HH:MM format (e.g. "08:30", "19:45"). Only set this when the user states or clearly implies a time; omit it otherwise.'
  );

// Pagination
export const paginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Maximum results to return (1-50)'),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of results to skip for pagination'),
});

// Enums
export const mealTypeEnum = z
  .enum(['breakfast', 'lunch', 'dinner', 'snacks'])
  .describe('Meal type category');

export const setTypeEnum = z
  .enum(['Working Set', 'Warmup', 'Drop Set', 'Failure'])
  .describe('Type of exercise set');

export const fastingStatusEnum = z
  .enum(['ACTIVE', 'COMPLETED', 'CANCELLED'])
  .describe('Current status of a fasting window');

export const giIndexEnum = z
  .enum(['None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'])
  .describe('Glycemic Index classification');

export const weightUnitEnum = z
  .enum(['kg', 'lbs', 'lb', 'g'])
  .describe('Unit for weight measurement');

export const heightUnitEnum = z
  .enum(['cm', 'in', 'inch', 'ft'])
  .describe('Unit for height measurement');

export const measurementsUnitEnum = z
  .enum(['cm', 'in', 'inch'])
  .describe('Unit for body measurements');

export const searchTypeEnum = z
  .enum(['exact', 'broad'])
  .describe('Type of search to perform');

// Food providers the chatbot tools may target explicitly: every searchable
// external provider, plus SparkyFitness' own database. Derived from the
// canonical list so the tool schema can never drift from what
// externalFoodSearchService actually handles.
export const foodProviderTypeEnum = z
  .enum(['internal', ...VALID_PROVIDER_TYPES])
  .describe('Food provider to search');

export const entryTypeEnum = z
  .enum(['food_entry', 'food_entry_meal'])
  .describe('Type of diary entry');

// UUID validation. The published JSON schema keeps `format: uuid` but drops
// Zod's ~170-character UUID regex, which every chat request would otherwise
// resend once per id field; validation still uses it.
export const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID')
  .describe('UUID identifier')
  .meta({ pattern: undefined });

// Optional date with today default
export const optionalDateSchema = z
  .string()
  .regex(DAY_INPUT_REGEX, DAY_INPUT_MESSAGE)
  .optional()
  .describe(
    `Date in YYYY-MM-DD format (defaults to today). ${DAY_TIMEZONE_NOTE}`
  );
