import { useCallback } from 'react';
import { isShownByFeature } from '@workspace/shared';

import { useMobileFeatures } from './useMobileFeatures';
import {
  ADD_MENU_ITEM_FEATURES,
  type AddMenuItemKey,
} from '../constants/addMenuItems';

/**
 * Whether the + sheet can show an item right now. An item of an optional
 * feature (`ADD_MENU_ITEM_FEATURES`, the cycle row) needs that feature on in
 * Settings → Features; every other item is always offered, and hiding one is
 * the user's call in Quick Actions. Settings and its preview use this to
 * match the sheet.
 */
export function useAddMenuItemAvailable(): (key: AddMenuItemKey) => boolean {
  const { isEnabled } = useMobileFeatures();
  return useCallback(
    (key) => isShownByFeature(ADD_MENU_ITEM_FEATURES[key], isEnabled),
    [isEnabled]
  );
}
