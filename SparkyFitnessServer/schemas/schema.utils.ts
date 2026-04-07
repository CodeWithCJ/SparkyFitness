/**
 * Reusable Zod schema utilities for the SparkyFitness application
 * These utilities can be imported and used across different schema files
 */

import { z } from 'zod/v4';

/**
 * A number that can be null or omitted entirely.
 * Useful for optional numeric fields where null is a valid value.
 */
export const optionalNullableNumber = z.number().nullable().optional();

/**
 * A nullable integer that can be omitted entirely.
 * Useful for optional integer fields where null is a valid value.
 */
export const optionalNullableInt = z.number().int().nullable().optional();

/**
 * A number that can be null but must be provided (not optional).
 * Useful for required numeric fields where null is a valid value.
 */
export const nullableNumber = z.number().nullable();

/**
 * A nullable integer that must be provided (not optional).
 * Useful for required integer fields where null is a valid value.
 */
export const nullableInt = z.number().int().nullable();