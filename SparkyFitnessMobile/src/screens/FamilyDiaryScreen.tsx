import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import DateNavigator from '../components/DateNavigator';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useFamilyDailySummary } from '../hooks';
import { familyUsersQueryKey } from '../hooks/queryKeys';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { ApiError } from '../services/api/errors';
import type { RootStackScreenProps } from '../types/navigation';
import {
  calculateFamilyCopyTotals,
  familyDiaryUserName,
  groupFamilyFoodEntries,
} from '../utils/familyDiary';
import { addDays, formatDate, getTodayDate } from '../utils/dateUtils';

type FamilyDiaryScreenProps = RootStackScreenProps<'FamilyDiary'>;

const FamilyDiaryScreen: React.FC<FamilyDiaryScreenProps> = ({
  navigation,
  route,
}) => {
  const { familyUser } = route.params;
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const locale = i18n?.resolvedLanguage ?? i18n?.language ?? 'en-US';
  const displayName = familyDiaryUserName(
    familyUser,
    t('familyDiary.unnamedMember', { defaultValue: 'Family member' }),
  );
  const { data, error, isError, isLoading, refetch } = useFamilyDailySummary({
    familyUserId: familyUser.userId,
    date: selectedDate,
  });
  const header = useScreenHeader({
    title: displayName,
    nativeTitle: displayName,
    left: { kind: 'back' },
  });

  useEffect(() => {
    if (isError && error instanceof ApiError && error.statusCode === 403) {
      void queryClient.invalidateQueries({ queryKey: familyUsersQueryKey });
    }
  }, [error, isError, queryClient]);

  const groups = groupFamilyFoodEntries(data?.foodEntries ?? []);

  const content = isLoading ? (
    <StatusView
      loading
      title={t('familyDiary.loadingDiary', {
        defaultValue: 'Loading family diary…',
      })}
    />
  ) : isError ? (
    <View className="flex-1 justify-center px-6">
      <StatusView
        inline
        icon="alert-circle"
        iconTone="danger"
        title={t('familyDiary.loadDiaryFailed', {
          defaultValue: 'Family diary access unavailable',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => void refetch(),
          variant: 'primary',
        }}
      />
      <Button
        variant="ghost"
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        {t('familyDiary.back', { defaultValue: 'Back' })}
      </Button>
    </View>
  ) : groups.length === 0 ? (
    <StatusView
      icon="food"
      iconTone="muted"
      title={t('familyDiary.emptyForDate', {
        defaultValue: 'No food entries for this date',
      })}
    />
  ) : (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: insets.bottom + activeWorkoutBarPadding + 24,
      }}
    >
      <Text className="mb-3 text-sm text-text-secondary">
        {t('familyDiary.diaryForDate', {
          date: formatDate(selectedDate, locale),
          defaultValue: 'Family diary · {{date}}',
        })}
      </Text>
      {groups.map(group => {
        const totals = calculateFamilyCopyTotals(
          group.entries.map(entry => ({ entry, quantity: entry.quantity })),
        );

        return (
          <TouchableOpacity
            key={group.key}
            accessibilityRole="button"
            accessibilityLabel={t('familyDiary.openMeal', {
              meal: group.mealTypeName,
              defaultValue: 'Open {{meal}} meal',
            })}
            className="mb-3 rounded-2xl bg-surface p-4"
            onPress={() =>
              navigation.navigate('FamilyMealDetail', {
                familyUser,
                sourceDate: selectedDate,
                mealTypeId: group.mealTypeId,
                mealTypeName: group.mealTypeName,
                entries: group.entries,
              })
            }
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-semibold text-text-primary">
                  {group.mealTypeName}
                </Text>
                <Text className="text-sm text-text-secondary">
                  {t('familyDiary.mealCalories', {
                    calories: Math.round(totals.calories),
                    defaultValue: '{{calories}} kcal',
                  })}
                </Text>
              </View>
              <Icon name="chevron-forward" size={20} color="#6B7280" />
            </View>
            <View className="mt-3 gap-1">
              {group.entries.map(entry => (
                <View key={entry.id} className="flex-row justify-between gap-3">
                  <Text className="flex-1 text-text-primary">
                    {entry.food_name ??
                      t('familyDiary.unnamedFood', {
                        defaultValue: 'Unnamed food',
                      })}
                  </Text>
                  <Text className="text-text-secondary">
                    {entry.quantity} {entry.unit}
                  </Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <DateNavigator
        title={t('familyDiary.diary', { defaultValue: 'Family diary' })}
        selectedDate={selectedDate}
        onPreviousDay={() => setSelectedDate(date => addDays(date, -1))}
        onNextDay={() => setSelectedDate(date => addDays(date, 1))}
        onToday={() => setSelectedDate(getTodayDate())}
        onDatePress={() => calendarRef.current?.present()}
        dateControls={{
          previousDayLabel: t('familyDiary.previousDay', {
            defaultValue: 'Previous day',
          }),
          previousDayHint: t('familyDiary.previousDayHint', {
            defaultValue: 'Shows the previous day',
          }),
          nextDayLabel: t('familyDiary.nextDay', {
            defaultValue: 'Next day',
          }),
          nextDayHint: t('familyDiary.nextDayHint', {
            defaultValue: 'Shows the next day',
          }),
          chooseDateLabel: t('familyDiary.chooseDate', {
            defaultValue: 'Choose date',
          }),
          chooseDateHint: t('familyDiary.chooseDateHint', {
            defaultValue: 'Opens the date picker',
          }),
          goToTodayLabel: t('familyDiary.goToToday', {
            defaultValue: 'Go to today',
          }),
          goToTodayHint: t('familyDiary.goToTodayHint', {
            defaultValue: 'Returns to today',
          }),
        }}
        skipTopInset
      />
      {content}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </View>
  );
};

export default FamilyDiaryScreen;
