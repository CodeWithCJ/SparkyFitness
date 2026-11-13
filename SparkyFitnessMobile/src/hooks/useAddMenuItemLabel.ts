import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useCycleMode } from './useCycleMode';
import {
  ADD_MENU_ITEM_LABELS,
  type AddMenuItemKey,
} from '../constants/addMenuItems';

/**
 * The name of the cycle row in the + sheet: Wellness in discreet mode, Log
 * Pregnancy Entry while pregnant or postpartum, otherwise Log Cycle.
 */
export function useCycleSheetLabel(): string {
  const { t } = useTranslation();
  const { mode, discreetMode } = useCycleMode();
  if (discreetMode) {
    return t('addSheet.wellness', { defaultValue: 'Wellness' });
  }
  return mode === 'pregnant' || mode === 'postpartum'
    ? t('addSheet.logPregnancyEntry', { defaultValue: 'Log Pregnancy Entry' })
    : t('addSheet.logCycle', { defaultValue: 'Log Cycle' });
}

/**
 * Names an item as the + sheet does, for its settings and preview. The cycle
 * row carries the sheet's own name while cycle tracking is on; with it off the
 * row never shows in the sheet, so it keeps the plain name.
 */
export function useAddMenuItemLabel(): (key: AddMenuItemKey) => string {
  const { t } = useTranslation();
  const { enabled } = useCycleMode();
  const cycleLabel = useCycleSheetLabel();
  return useCallback(
    (key) =>
      key === 'wellness' && enabled ? cycleLabel : ADD_MENU_ITEM_LABELS[key](t),
    [cycleLabel, enabled, t]
  );
}
