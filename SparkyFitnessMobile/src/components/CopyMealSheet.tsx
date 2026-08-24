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
import Toast from 'react-native-toast-message';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import Button from './ui/Button';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import Icon from './Icon';
import { useMealTypes } from '../hooks/useMealTypes';
import { getLocalizedMealLabel } from '../constants/meals';
import { getHistoricalMealTypeLabel } from '../utils/mealNutrition';
import { formatDateLabel } from '../utils/dateUtils';
import { useCalendarPresentation } from '../utils/calendarLocalization';
import { dayToPickerDate, localDateToDay } from '@workspace/shared';
import type { CopyFoodEntriesPayload } from '../services/api/foodEntriesApi';

export interface CopyMealSheetRef {
  present: (sourceDate: string, sourceMealTypeId: string | null, sourceMealTypeName: string) => void;
  dismiss: () => void;
}

interface CopyMealSheetProps {
  isPending?: boolean;
  onCopy: (payload: CopyFoodEntriesPayload) => void;
}

const CopyMealSheet = forwardRef<CopyMealSheetRef, CopyMealSheetProps>(
  ({ isPending = false, onCopy }, ref) => {
    const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
    const { presentation } = useCalendarPresentation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);

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

    const [source, setSource] = useState<{
      date: string;
      mealTypeId: string | null;
      mealTypeName: string;
    } | null>(null);
    const [targetDate, setTargetDate] = useState<string>('');
    const [targetMealTypeId, setTargetMealTypeId] = useState<string | null>(null);

    const { mealTypes } = useMealTypes();

    useImperativeHandle(ref, () => ({
      present: (sourceDate: string, sourceMealTypeId: string | null, sourceMealTypeName: string) => {
        setSource({ date: sourceDate, mealTypeId: sourceMealTypeId, mealTypeName: sourceMealTypeName });
        // Default to the same slot the user is viewing; they pick a new date/meal
        // before copying.
        setTargetDate(sourceDate);
        setTargetMealTypeId(sourceMealTypeId);
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useSheetBackdrop();

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

    const displayMealType = useCallback(
      (mealType: { name: string; user_id: string | null }) => {
        if (mealType.user_id != null) return mealType.name;
        const key = mealType.name.toLowerCase() === 'snack' ? 'snacks' : mealType.name.toLowerCase();
        return getLocalizedMealLabel(t, key);
      },
      [t],
    );

    const sourceTitle = useMemo(() => {
      if (!source) return '';
      if (source.mealTypeId) {
        const mt = mealTypes.find((m) => m.id === source.mealTypeId);
        if (mt) return displayMealType(mt);
      }
      return getHistoricalMealTypeLabel(source.mealTypeName, t);
    }, [source, mealTypes, displayMealType, t]);

    const handleCopy = useCallback(() => {
      if (!source || !targetDate || !targetMealTypeId) return;
      // The server /food-entries/copy endpoint matches meal types by NAME only
      // (verified contract), so the payload carries names. Selection in the UI
      // is by canonical id; the name is resolved here so two categories that
      // share a name but differ by id stay unambiguous client-side.
      const targetType = mealTypes.find((mt) => mt.id === targetMealTypeId);
      if (!targetType) return;

      // A name-only endpoint cannot tell two same-named types apart. Block the
      // copy instead of silently copying to/from the wrong type.
      const nameIsAmbiguous = (name: string) => {
        const lower = name.toLowerCase();
        return mealTypes.filter((mt) => mt.name.toLowerCase() === lower).length > 1;
      };
      if (nameIsAmbiguous(source.mealTypeName) || nameIsAmbiguous(targetType.name)) {
        Toast.show({
          type: 'error',
          text1: t('copyMeal.duplicateTitle', { defaultValue: "Can't copy meal" }),
          text2: t('copyMeal.duplicateMessage', { defaultValue: 'Duplicate meal-type names cannot currently be used for Copy Meal.' }),
        });
        return;
      }

      onCopy({
        sourceDate: source.date,
        sourceMealType: source.mealTypeName,
        targetDate,
        targetMealType: targetType.name,
      });
    }, [source, targetDate, targetMealTypeId, mealTypes, onCopy, t]);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enableContentPanningGesture={Platform.OS !== 'android'}
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
                  {t('copyMeal.title', { defaultValue: 'Copy meal: {{meal}}', meal: sourceTitle })}
                </Text>
                <Text className="text-text-secondary text-sm mt-1 text-center">
                  {t('copyMeal.sourceDate', { defaultValue: 'Source date: {{date}}', date: formatDateLabel(source.date, t, dateLocale) })}
                </Text>
              </View>

              {/* Target date */}
              <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
                {t('copyMeal.targetDate', { defaultValue: 'Target date' })}
              </Text>
              <DateTimePicker
                mode="single"
                date={dateValue}
                onChange={handleDateChange}
                locale={presentation.locale}
                firstDayOfWeek={presentation.firstDayOfWeek}
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
                {t('copyMeal.targetMeal', { defaultValue: 'Target meal' })}
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-6">
                {mealTypes.map((mt) => {
                  const isSelected = mt.id === targetMealTypeId;
                  return (
                    <TouchableOpacity
                      key={mt.id}
                      accessibilityRole="button"
                      accessibilityLabel={displayMealType(mt)}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => setTargetMealTypeId(mt.id)}
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
                        {displayMealType(mt)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Button
                variant="primary"
                onPress={handleCopy}
                accessibilityLabel={t('copyMeal.copy', { defaultValue: 'Copy' })}
                disabled={
                  isPending ||
                  !targetDate ||
                  !targetMealTypeId ||
                  (source.date === targetDate && source.mealTypeId === targetMealTypeId)
                }
              >
                {isPending ? t('copyMeal.copying', { defaultValue: 'Copying...' }) : t('copyMeal.copy', { defaultValue: 'Copy' })}
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
