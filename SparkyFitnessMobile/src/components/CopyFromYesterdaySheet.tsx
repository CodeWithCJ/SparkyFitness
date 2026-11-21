import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { addDays } from '@workspace/shared';
import Button from './ui/Button';
import {
  sheetContainer,
  useSheetBackdrop,
  useSheetHardwareBack,
} from './ui/sheetChrome';
import Icon from './Icon';
import { useMealTypes } from '../hooks/useMealTypes';
import { useDailySummary } from '../hooks/useDailySummary';
import { getLocalizedMealLabel } from '../constants/meals';
import type { CopyFromYesterdayPayload } from '../hooks/useCopyFromYesterday';

export interface CopyFromYesterdaySheetRef {
  present: (targetDate: string) => void;
  dismiss: () => void;
}

interface CopyFromYesterdaySheetProps {
  isPending?: boolean;
  onCopy: (payload: CopyFromYesterdayPayload) => void;
}

/**
 * Target-oriented copy: pick which of yesterday's meals to bring into the day
 * you're viewing, or copy the whole day. Meets the empty-day case where the
 * source-oriented Copy Meal sheet offers nothing to open.
 */
const CopyFromYesterdaySheet = forwardRef<
  CopyFromYesterdaySheetRef,
  CopyFromYesterdaySheetProps
>(({ isPending = false, onCopy }, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const [surfaceBg, textMuted, accentPrimary, textPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string, string, string];

  const [targetDate, setTargetDate] = useState<string>('');
  const [checkedMealIds, setCheckedMealIds] = useState<Set<string>>(new Set());

  const [isOpen, setIsOpen] = useState(false);

  const { mealTypes, defaultMealTypeId } = useMealTypes();
  // The source day is the day before the target, computed locally; the server
  // computes the same for the request.
  const sourceDate = targetDate ? addDays(targetDate, -1) : '';
  const {
    summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useDailySummary({
    date: sourceDate,
    enabled: Boolean(sourceDate),
  });

  // Which meal-type names have entries on the source day, so an empty meal can
  // be greyed out. Loaded lazily: while it is still loading nothing is disabled.
  const sourceMealNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of summary?.foodEntries ?? []) {
      if (entry.meal_type) names.add(entry.meal_type);
    }
    return names;
  }, [summary]);

  const hasAnySourceEntries = sourceMealNames.size > 0;

  useImperativeHandle(ref, () => ({
    present: (date: string) => {
      setTargetDate(date);
      // Pre-check the clock-guess meal; the rest start unchecked.
      setCheckedMealIds(
        defaultMealTypeId ? new Set([defaultMealTypeId]) : new Set()
      );
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  // Track the open state so Android's hardware Back can dismiss the sheet
  // instead of falling through to navigation. Set from both onAnimate and
  // onChange (the library drops onAnimate when the open finishes before it
  // reaches JS), cleared only in onDismiss.
  const markOpen = useCallback(() => setIsOpen(true), []);
  const handleAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      if (toIndex >= 0) markOpen();
    },
    [markOpen]
  );
  const handleChange = useCallback(
    (index: number) => {
      if (index >= 0) markOpen();
    },
    [markOpen]
  );
  const handleDismiss = useCallback(() => setIsOpen(false), []);

  useSheetHardwareBack(isOpen, () => bottomSheetRef.current?.dismiss());

  const renderBackdrop = useSheetBackdrop();

  const displayMealType = useCallback(
    (mealType: { name: string; user_id: string | null }) => {
      if (mealType.user_id != null) return mealType.name;
      const key =
        mealType.name.toLowerCase() === 'snack'
          ? 'snacks'
          : mealType.name.toLowerCase();
      return getLocalizedMealLabel(t, key);
    },
    [t]
  );

  const isMealEnabled = useCallback(
    (name: string) => (summaryLoading ? true : sourceMealNames.has(name)),
    [summaryLoading, sourceMealNames]
  );

  const toggleMeal = useCallback(
    (mealId: string, name: string) => {
      if (!isMealEnabled(name)) return;
      setCheckedMealIds((prev) => {
        const next = new Set(prev);
        if (next.has(mealId)) {
          next.delete(mealId);
        } else {
          next.add(mealId);
        }
        return next;
      });
    },
    [isMealEnabled]
  );

  const checkedIds = useMemo(() => {
    const ids: string[] = [];
    for (const mealType of mealTypes) {
      if (checkedMealIds.has(mealType.id) && isMealEnabled(mealType.name)) {
        ids.push(mealType.id);
      }
    }
    return ids;
  }, [mealTypes, checkedMealIds, isMealEnabled]);

  const handleCopySelected = useCallback(() => {
    if (checkedIds.length === 0) return;
    onCopy({ kind: 'selected', mealIds: checkedIds, targetDate });
  }, [checkedIds, targetDate, onCopy]);

  const handleCopyAll = useCallback(() => {
    if (!hasAnySourceEntries) return;
    onCopy({ kind: 'all', targetDate });
  }, [hasAnySourceEntries, targetDate, onCopy]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      enableContentPanningGesture={Platform.OS !== 'android'}
      backdropComponent={renderBackdrop}
      containerComponent={sheetContainer}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
      onAnimate={handleAnimate}
      onChange={handleChange}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView contentContainerClassName="pb-safe-or-8">
        {targetDate && (
          <View className="px-5">
            <View className="items-center mb-4">
              <Text className="text-text-primary text-lg font-semibold text-center">
                {t('copyFromYesterday.title', {
                  defaultValue: 'Copy from yesterday',
                })}
              </Text>
              <Text className="text-text-secondary text-sm mt-1 text-center">
                {t('copyFromYesterday.subtitle', {
                  defaultValue: 'Bring yesterday’s meals into this day',
                })}
              </Text>
            </View>

            {summaryError && !summary ? (
              <View className="mb-4 items-center">
                <Text className="text-text-secondary text-sm mb-3 text-center">
                  {t('copyFromYesterday.loadError', {
                    defaultValue: 'Could not load yesterday’s meals.',
                  })}
                </Text>
                <Button
                  variant="secondary"
                  accessibilityLabel={t('common.retry', {
                    defaultValue: 'Retry',
                  })}
                  onPress={() => refetchSummary()}
                >
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              </View>
            ) : !summaryLoading && !hasAnySourceEntries ? (
              <Text className="text-text-secondary text-sm mb-4 text-center">
                {t('copyFromYesterday.emptySource', {
                  defaultValue: 'There is nothing to copy from yesterday.',
                })}
              </Text>
            ) : (
              <View className="mb-4">
                {mealTypes.map((mealType) => {
                  const enabled = isMealEnabled(mealType.name);
                  const isChecked = checkedMealIds.has(mealType.id);
                  return (
                    <TouchableOpacity
                      key={mealType.id}
                      accessibilityRole="checkbox"
                      accessibilityLabel={displayMealType(mealType)}
                      accessibilityState={{
                        checked: isChecked,
                        disabled: !enabled,
                      }}
                      onPress={() => toggleMeal(mealType.id, mealType.name)}
                      activeOpacity={0.7}
                      testID={`copy-yesterday-meal-${mealType.id}`}
                      className="flex-row items-center px-4 py-3"
                    >
                      <View
                        className="w-6 h-6 items-center justify-center rounded-md border"
                        style={{
                          borderWidth: 2,
                          borderColor: isChecked ? accentPrimary : textMuted,
                          backgroundColor: isChecked
                            ? accentPrimary
                            : 'transparent',
                        }}
                      >
                        {isChecked ? (
                          <Icon name="checkmark" size={14} color="#FFFFFF" />
                        ) : null}
                      </View>
                      <Text
                        className="flex-1 text-base font-medium ml-3"
                        style={{ color: enabled ? textPrimary : textMuted }}
                      >
                        {displayMealType(mealType)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button
                  variant="secondary"
                  onPress={handleCopySelected}
                  accessibilityLabel={t('copyFromYesterday.copySelected', {
                    defaultValue: 'Copy Selected',
                  })}
                  disabled={isPending || checkedIds.length === 0}
                >
                  {t('copyFromYesterday.copySelected', {
                    defaultValue: 'Copy Selected',
                  })}
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  variant="primary"
                  onPress={handleCopyAll}
                  accessibilityLabel={t('copyFromYesterday.copyAll', {
                    defaultValue: 'Copy All',
                  })}
                  disabled={isPending || !hasAnySourceEntries}
                >
                  {isPending
                    ? t('copyFromYesterday.copying', {
                        defaultValue: 'Copying...',
                      })
                    : t('copyFromYesterday.copyAll', {
                        defaultValue: 'Copy All',
                      })}
                </Button>
              </View>
            </View>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

CopyFromYesterdaySheet.displayName = 'CopyFromYesterdaySheet';

export default CopyFromYesterdaySheet;
