import { useCallback } from 'react';

import { useCycleMode } from './useCycleMode';
import type { AddMenuItemKey } from '../constants/addMenuItems';

/**
 * Whether the + sheet can show an item right now. The cycle row needs cycle
 * tracking; every other item is always offered, and hiding one is the user's
 * call in Quick Actions. Settings and its preview use this to match the sheet.
 */
export function useAddMenuItemAvailable(): (key: AddMenuItemKey) => boolean {
  const { enabled: cycleEnabled } = useCycleMode();
  return useCallback(
    (key) => (key === 'wellness' ? cycleEnabled : true),
    [cycleEnabled]
  );
}
