import { z } from 'zod';

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

// Date validation (YYYY-MM-DD)
export const dateSchema = z
  .string()
  .regex(DAY_INPUT_REGEX, DAY_INPUT_MESSAGE)
  .describe('Date in YYYY-MM-DD format, or "today"/"yesterday"/"tomorrow"');

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

export const entryTypeEnum = z
  .enum(['food_entry', 'food_entry_meal'])
  .describe('Type of diary entry');

// UUID validation
export const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID')
  .describe('UUID identifier');

// Optional date with today default
export const optionalDateSchema = z
  .string()
  .regex(DAY_INPUT_REGEX, DAY_INPUT_MESSAGE)
  .optional()
  .describe('Date in YYYY-MM-DD format (defaults to today)');
