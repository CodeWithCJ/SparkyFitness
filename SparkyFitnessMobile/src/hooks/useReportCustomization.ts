import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

import type { ReportSectionKey } from '../constants/reports';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import {
  resolveReportWindow,
  type CustomRange,
  type ReportRange,
} from '../utils/trendRange';

/**
 * What a report screen reads from Reports → Customize: the window it opens on (still
 * switchable on the screen, including to days the user picks, without changing the saved
 * default) and a way to ask whether a section is turned on.
 *
 * `rangeProps` spreads straight onto `ReportScreenLayout`; `window` is what the report's
 * hook loads and what its charts and counts use. Today moves forward the next time the
 * screen is focused, so a preset window left open past midnight does not stay on yesterday.
 * The listener reads `NavigationContext` rather than `useFocusEffect`, which throws when a
 * screen test renders without a navigator.
 */
export function useReportCustomization() {
  const defaultRange = useAppPreferencesStore((s) => s.reportDefaultRange);
  const hiddenSections = useAppPreferencesStore((s) => s.hiddenReportSections);
  const [range, setRange] = useState<ReportRange>(defaultRange);
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [today, setToday] = useState(getTodayDate);
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation) return;
    return navigation.addListener('focus', () => {
      const now = getTodayDate();
      setToday((current) => (current === now ? current : now));
    });
  }, [navigation]);
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
