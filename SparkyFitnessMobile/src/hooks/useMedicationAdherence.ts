import { useCallback, useMemo } from 'react';
import {
  DEFAULT_ADHERENCE_WINDOW_DAYS,
  computeAdherence,
  computeChecklistProgress,
  filterEntriesBySubtype,
  filterMedsBySubtype,
  getDueDosesForDate,
  type MedSubtype,
} from '@workspace/shared';
import { useMedicationEntries, useMedications } from './useMedications';
import { addDays, getDeviceTimezone } from '../utils/dateUtils';
import { selectPrnMedications } from '../utils/medicationAdherence';

/**
 * Everything the medication adherence screen shows for one day: the due and as-needed
 * doses, the checklist, the rolling adherence window and the day's logged entries.
 *
 * One entries query covers the whole window ending on `selectedDate`, so logging, editing
 * or deleting a dose refreshes the checklist, the adherence numbers and the day log
 * together through the shared entry-cache invalidation.
 */
export function useMedicationAdherence(
  selectedDate: string,
  subtype: MedSubtype
) {
  const timezone = getDeviceTimezone();

  const medsQuery = useMedications();
  const entriesQuery = useMedicationEntries({
    fromDate: addDays(selectedDate, -(DEFAULT_ADHERENCE_WINDOW_DAYS - 1)),
    toDate: selectedDate,
    // Picking another day must not blank the screen: that would unmount the calendar
    // and lose its medication filter.
    keepPrevious: true,
  });

  const medications = useMemo(
    () => filterMedsBySubtype(medsQuery.data ?? [], subtype),
    [medsQuery.data, subtype]
  );

  const windowEntries = useMemo(
    () =>
      filterEntriesBySubtype(
        entriesQuery.data ?? [],
        new Set(medications.map((m) => m.id)),
        subtype
      ),
    [entriesQuery.data, medications, subtype]
  );

  const dayEntries = useMemo(
    () =>
      windowEntries.filter((e) => e.entry_date.slice(0, 10) === selectedDate),
    [windowEntries, selectedDate]
  );

  const dueDoses = useMemo(
    () => getDueDosesForDate(medications, selectedDate, timezone),
    [medications, selectedDate, timezone]
  );

  const prnMedications = useMemo(
    () => selectPrnMedications(medications, dueDoses),
    [medications, dueDoses]
  );

  const checklist = useMemo(
    () => computeChecklistProgress(dueDoses, dayEntries),
    [dueDoses, dayEntries]
  );

  const summary = useMemo(
    () =>
      computeAdherence({
        medications,
        entries: windowEntries,
        endDate: selectedDate,
        timezone,
      }),
    [medications, windowEntries, selectedDate, timezone]
  );

  const { refetch: refetchMeds } = medsQuery;
  const { refetch: refetchEntries } = entriesQuery;
  const refetch = useCallback(
    () => Promise.all([refetchMeds(), refetchEntries()]),
    [refetchMeds, refetchEntries]
  );

  return {
    allMedications: medsQuery.data ?? [],
    medications,
    dueDoses,
    prnMedications,
    dayEntries,
    checklist,
    summary,
    isLoading: medsQuery.isLoading || entriesQuery.isLoading,
    isError: medsQuery.isError || entriesQuery.isError,
    // True while another day's window is shown until the selected one loads; its
    // entries are not the selected day's, so doses must not be logged against them.
    isPlaceholderData: entriesQuery.isPlaceholderData,
    refetch,
  };
}
