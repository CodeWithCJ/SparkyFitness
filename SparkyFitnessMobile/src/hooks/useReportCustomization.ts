import { useCallback, useMemo, useState } from 'react';

import type { ReportSectionKey } from '../constants/reports';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  resolveReportWindow,
  type CustomRange,
  type ReportRange,
} from '../utils/trendRange';
import { useTodayOnFocus } from './useTodayOnFocus';

/**
 * What a report screen reads from Reports → Customize: the window it opens on (still
 * switchable on the screen, including to days the user picks, without changing the saved
 * default) and a way to ask whether a section is turned on.
 *
 * `rangeProps` spreads straight onto `ReportScreenLayout`; `window` is what the report's
 * hook loads and what its charts and counts use. Today comes from `useTodayOnFocus`, so a
 * preset window left open past midnight does not stay on yesterday.
 */
export function useReportCustomization() {
  const defaultRange = useAppPreferencesStore((s) => s.reportDefaultRange);
  const hiddenSections = useAppPreferencesStore((s) => s.hiddenReportSections);
  const [range, setRange] = useState<ReportRange>(defaultRange);
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const today = useTodayOnFocus();
  const window = useMemo(
    () => resolveReportWindow(range, customRange, today),
    [range, customRange, today]
  );
  const isSectionShown = useCallback(
    (key: ReportSectionKey) => !hiddenSections.includes(key),
    [hiddenSections]
  );
  return {
    window,
    isSectionShown,
    rangeProps: {
      range,
      onRangeChange: setRange,
      customRange,
      onCustomRangeChange: setCustomRange,
    },
  };
}
