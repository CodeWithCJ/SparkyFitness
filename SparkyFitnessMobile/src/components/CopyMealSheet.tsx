import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useUniwind, useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import Button from './ui/Button';
import Icon from './Icon';
import { useMealTypes } from '../hooks/useMealTypes';
import { getMealTypeLabel } from '../constants/meals';
import { formatDateLabel } from '../utils/dateUtils';
import { dayToPickerDate, localDateToDay } from '@workspace/shared';
import type { CopyFoodEntriesPayload } from '../services/api/foodEntriesApi';

// Render the sheet inside an iOS UIWindow so it sits above any native modal
// presentation. No-op on Android.
const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => <FullWindowOverlay>{children}</FullWindowOverlay>
    : undefined;

export interface CopyMealSheetRef {
  present: (sourceDate: string, sourceMealType: string) => void;
  dismiss: () => void;
}

interface CopyMealSheetProps {
  isPending?: boolean;
  onCopy: (payload: CopyFoodEntriesPayload) => void;
}

const CopyMealSheet = forwardRef<CopyMealSheetRef, CopyMealSheetProps>(
  ({ isPending = false, onCopy }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUniwind();
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [
      surfaceBg,
      textMuted,
      accentPrimary,
      textPrimary,
      textSecondary,
    ] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
      '--color-text-primary',
      '--color-text-secondary',
    ]) as [string, string, string, string, string];

    const [source, setSource] = useState<{ date: string; mealType: string } | null>(null);
    const [targetDate, setTargetDate] = useState<string>('');
    const [targetMealType, setTargetMealType] = useState<string>('');

    const { mealTypes } = useMealTypes();

    useImperativeHandle(ref, () => ({
      present: (sourceDate: string, sourceMealType: string) => {
        setSource({ date: sourceDate, mealType: sourceMealType });
        // Default to the same slot the user is viewing; they pick a new date/meal
        // before copying.
        setTargetDate(sourceDate);
        setTargetMealType(sourceMealType);
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode]
    );

    const handleDateChange = useCallback(({ date }: { date: DateType }) => {
      if (!date) return;
      // The picker hands back a dayjs object; convert it to a Date, then to a
      // local YYYY-MM-DD day string via the shared helper so there is no
      // timezone day shift. A YYYY-MM-DD string is parsed with the same helper.
      let jsDate: Date;
      if (date instanceof Date) {
        jsDate = date;
      } else if (typeof date === 'object' && 'toDate' in date) {
        jsDate = date.toDate();
      } else if (typeof date === 'string') {
        jsDate = dayToPickerDate(date);
      } else {
        jsDate = new Date(date);
      }
      setTargetDate(localDateToDay(jsDate));
    }, []);

    const dateValue = useMemo(
      () => (targetDate ? dayToPickerDate(targetDate) : new Date()),
      [targetDate],
    );

    const handleCopy = useCallback(() => {
      if (!source || !targetDate || !targetMealType) return;
      onCopy({
        sourceDate: source.date,
        sourceMealType: source.mealType,
        targetDate,
        targetMealType,
      });
    }, [source, targetDate, targetMealType, onCopy]);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetScrollView contentContainerClassName="pb-safe-or-8">
          {source && (
            <View className="px-5">
              <View className="items-center mb-4">
                <Text className="text-text-primary text-lg font-semibold text-center">
                  Copy {getMealTypeLabel(source.mealType)}
                </Text>
                <Text className="text-text-secondary text-sm mt-1 text-center">
                  From {formatDateLabel(source.date)}
                </Text>
              </View>

              {/* Target date */}
              <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
                Target date
              </Text>
              <DateTimePicker
                mode="single"
                date={dateValue}
                onChange={handleDateChange}
                components={{
                  IconPrev: <Icon name="chevron-back" size={18} color={textPrimary} />,
                  IconNext: <Icon name="chevron-forward" size={18} color={textPrimary} />,
                }}
                styles={{
                  selected: { backgroundColor: accentPrimary },
                  selected_label: { color: '#FFFFFF' },
                  today: { borderColor: accentPrimary, borderWidth: 1 },
                  day_label: { color: textPrimary },
                  weekday_label: { color: textSecondary },
                  month_selector_label: { color: textPrimary, fontWeight: '600' },
                  year_selector_label: { color: textPrimary, fontWeight: '600' },
                  disabled_label: { color: textMuted },
                  month_label: { color: textPrimary },
                  year_label: { color: textPrimary },
                  selected_month: { backgroundColor: accentPrimary },
                  selected_month_label: { color: '#FFFFFF' },
                  selected_year: { backgroundColor: accentPrimary },
                  selected_year_label: { color: '#FFFFFF' },
                }}
              />

              {/* Target meal type */}
              <Text className="text-xs font-semibold uppercase text-text-muted mt-4 mb-2">
                Target meal
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-6">
                {mealTypes.map((mt) => {
                  const isSelected = mt.name.toLowerCase() === targetMealType.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={mt.id}
                      onPress={() => setTargetMealType(mt.name)}
                      activeOpacity={0.7}
                      className={`px-4 py-2 rounded-full border ${
                        isSelected
                          ? 'bg-accent-primary border-accent-primary'
                          : 'bg-raised border-border-subtle'
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          isSelected ? 'text-white font-semibold' : 'text-text-primary'
                        }`}
                      >
                        {getMealTypeLabel(mt.name)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Button
                variant="primary"
                onPress={handleCopy}
                disabled={
                  isPending ||
                  !targetDate ||
                  !targetMealType ||
                  (source.date === targetDate &&
                    source.mealType.toLowerCase() === targetMealType.toLowerCase())
                }
              >
                {isPending ? 'Copying...' : 'Copy'}
              </Button>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

CopyMealSheet.displayName = 'CopyMealSheet';

export default CopyMealSheet;
