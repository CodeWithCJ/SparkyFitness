import { useEffect, useState } from 'react';
import SideBarMetricsModule, {
  type SideBarMetrics,
} from '../../modules/side-bar-metrics';

/** Height of the previous / calendar / next group when all three are shown. */
export const DATE_COLUMN_EXPANDED_HEIGHT = 152;
/** Clear space kept between the column and the Add button. */
export const DATE_COLUMN_MIN_GAP = 8;
const POLL_MS = 500;

/**
 * Whether the full three-button date group still fits between where iOS put
 * the column and the Add button. `null` means "could not measure" — callers
 * keep whatever they last decided. The column's top does not depend on how
 * many buttons it holds, so the answer cannot flip itself.
 */
export function dateColumnFits(
  m: SideBarMetrics | null | undefined
): boolean | null {
  if (m?.columnTop == null || m.addTop == null) return null;
  return (
    m.columnTop + DATE_COLUMN_EXPANDED_HEIGHT + DATE_COLUMN_MIN_GAP <= m.addTop
  );
}

/**
 * True when the date group must collapse to the calendar icon because a live
 * activity (or anything else that lengthens the status cluster) pushed the
 * column down onto the Add button. Polls only while `active`: the measurement
 * reads whatever column is on screen, so a tab that is not showing agrees with
 * the one that is.
 */
export function useDateColumnCollapsed(active: boolean): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const native = SideBarMetricsModule;
    if (!active || native == null) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fits = dateColumnFits(await native.measure());
        if (!cancelled && fits != null) setCollapsed(!fits);
      } catch {
        // Keep the last answer.
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  // Off the side bar the buttons never collapse, whatever was last measured.
  return active && collapsed;
}
