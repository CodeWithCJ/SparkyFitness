/** The All | Meds | Supplements view filter on the medications screens. */
export type MedSubtype = 'all' | 'meds' | 'supplements';

/**
 * Partitions the medication list for the segmented filter. Supplements are
 * `is_supplement` medication rows, so this is a view filter over the same list, not a
 * separate data source.
 */
export const filterMedsBySubtype = <T extends { is_supplement?: boolean }>(
  meds: T[],
  subtype: MedSubtype
): T[] =>
  meds.filter((med) =>
    subtype === 'all'
      ? true
      : subtype === 'supplements'
        ? Boolean(med.is_supplement)
        : !med.is_supplement
  );

/**
 * Whether a logged entry belongs to the subtype currently on screen. `all` always says
 * yes and deliberately never consults the id set: an entry outlives the medication it
 * came from, so an orphan matches no visible id and filtering the mixed view would
 * silently drop history that view exists to show. The narrowed views do filter, because
 * an orphan cannot be classified once its row is gone.
 */
export const isEntryVisibleForSubtype = (
  medicationId: string | null | undefined,
  visibleMedIds: Set<string>,
  subtype: MedSubtype
): boolean =>
  subtype === 'all' || (!!medicationId && visibleMedIds.has(medicationId));

/** Array form of the rule above, for entry lists. */
export const filterEntriesBySubtype = <T extends { medication_id: string }>(
  entries: T[],
  visibleMedIds: Set<string>,
  subtype: MedSubtype
): T[] =>
  entries.filter((entry) =>
    isEntryVisibleForSubtype(entry.medication_id, visibleMedIds, subtype)
  );

/**
 * Which of the two dose cards (medications, supplements) to show for the active filter.
 * The medications card doubles as the "nothing scheduled at all" empty state, so it stays
 * in the All view even with no medications; the supplements card is only worth its
 * header once there is something to put under it.
 */
export const visibleDoseCards = (
  subtype: MedSubtype,
  hasSupplementContent: boolean
): { medications: boolean; supplements: boolean } => ({
  medications: subtype !== 'supplements',
  supplements:
    subtype === 'supplements' || (subtype === 'all' && hasSupplementContent),
});
