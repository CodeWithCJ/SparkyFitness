import { z } from "zod";

/**
 * One row of `GET /measurements/custom-entries/latest-manual-on-or-before-date`:
 * the newest manual value for a single custom category on or before the
 * requested day.
 *
 * The server resolves one row per category in a single query, which is what
 * makes previous-value hints usable without an N+1 request per category on
 * screen (the custom-entries list has no date filter, and `most-recent` only
 * knows the fixed check-in columns).
 *
 * Deliberately narrower than a custom entry: there is no category join, no
 * notes, and no timestamps, because a hint only needs a value to suggest.
 * `source` is present so a consumer can assert the manual guarantee rather than
 * assume it; the server filters to `manual` before returning.
 */
export const latestManualCustomEntrySchema = z.object({
  id: z.string(),
  category_id: z.string(),
  /** Stored verbatim as the API represents it, so a consumer can adopt it as-is. */
  value: z.string(),
  /** Calendar day (`YYYY-MM-DD`) the value was recorded on. */
  entry_date: z.string(),
  source: z.string(),
});

export const latestManualCustomEntriesResponseSchema = z.array(
  latestManualCustomEntrySchema,
);

export type LatestManualCustomEntry = z.infer<
  typeof latestManualCustomEntrySchema
>;

export type LatestManualCustomEntriesResponse = z.infer<
  typeof latestManualCustomEntriesResponseSchema
>;
