import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { hasSupplementNutrition } from '@workspace/shared';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  Directions,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { addSheetRef } from '../components/AddSheet';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import CheckInPhotosSummary from '../components/CheckInPhotosSummary';
import DateNavigator from '../components/DateNavigator';
import DiaryCalorieMacroSummary from '../components/DiaryCalorieMacroSummary';
import EmptyDayIllustration from '../components/EmptyDayIllustration';
import ExerciseSummary from '../components/ExerciseSummary';
import FoodSummary from '../components/FoodSummary';
import MeasurementsSummary from '../components/MeasurementsSummary';
import ServingAdjustSheet, {
  type ServingAdjustSheetRef,
} from '../components/ServingAdjustSheet';
import { BedTimeCard, NapsCard, WakeUpCard } from '../components/SleepCards';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import {
  useCustomNutrients,
  useDailySummary,
  useFamilyUsers,
  useMealTypes,
  useNutrientDisplayPreferences,
  useServerConnection,
} from '../hooks';
import {
  useCheckInPhotoDates,
  useCheckInPhotosByDate,
} from '../hooks/useCheckInPhotos';
import { useCustomMeasurementsByDate } from '../hooks/useCustomMeasurements';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import { useMeasurements } from '../hooks/useMeasurements';
import { usePreferences } from '../hooks/usePreferences';
import { useSleepDay } from '../hooks/useSleepDay';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import type { FoodEntry } from '../types/foodEntries';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { isManualSource } from '../utils/customMeasurementsForm';
import { formatDateLabel } from '../utils/dateUtils';
import {
  getHistoricalMealTypeLabel,
  getMealTypeDisplayLabel,
} from '../utils/mealNutrition';
import {
  setNativeHeaderDatePickerOptions,
  type NativeHeaderDatePickerNavigation,
} from '../utils/nativeHeaderDatePicker';

type DiaryScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Diary'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DiaryScreen: React.FC<DiaryScreenProps> = ({ navigation }) => {
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl')
    ? 'pl-PL'
    : 'en-US';
  const insets = useSafeAreaInsets();
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { data: familyUsers = [] } = useFamilyUsers({ enabled: isConnected });
  const hasFamilyDiaries = isConnected && familyUsers.length > 0;
  const selectedDate = useDiaryDateStore((s) => s.selectedDate);
  const setSelectedDate = useDiaryDateStore((s) => s.setSelectedDate);
  const goToPreviousDay = useDiaryDateStore((s) => s.goToPreviousDay);
  const goToNextDay = useDiaryDateStore((s) => s.goToNextDay);
  const goToToday = useDiaryDateStore((s) => s.goToToday);
  const syncTodayRollover = useDiaryDateStore((s) => s.syncTodayRollover);
  const scrollViewRef = useRef<ScrollView>(null);
  const calendarRef = useRef<CalendarSheetRef>(null);
  const servingSheetRef = useRef<ServingAdjustSheetRef>(null);

  useFocusEffect(
    useCallback(() => {
      syncTodayRollover();
    }, [syncTodayRollover])
  );

  // Re-tapping the active Diary tab acts as a quick return to today's
  // entries and the top of the screen.
  useEffect(() => {
    return navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        goToToday();
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
  }, [navigation, goToToday]);

  useEffect(() => {
    navigation.setParams({ selectedDate });
  }, [navigation, selectedDate]);

  // The photo-day markers are fetched on first calendar open rather than at
  // mount: a user who never opens the picker should not pay a request for it.
  const [calendarOpened, setCalendarOpened] = useState(false);
  const { dates: photoDates } = useCheckInPhotoDates(calendarOpened);
  // Owned here rather than inside CheckInPhotosSummary: the empty-day predicate
  // below needs the same answer, and one subscription keeps refetch-on-focus
  // from firing twice for one query.
  const { photos: dayPhotos, isLoading: isPhotosLoading } =
    useCheckInPhotosByDate(selectedDate);
  const openCalendar = useCallback(() => {
    setCalendarOpened(true);
    calendarRef.current?.present();
  }, []);
  const openFamilyDiaries = useCallback(
    () => navigation.navigate('FamilyMembers'),
    [navigation]
  );
  const familyDiariesAccessibilityLabel = t('familyDiary.openFamilyDiaries', {
    defaultValue: 'Open family diaries',
  });
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const usesNativeTabs = useNativeIOSTabsActive();
  const { defaultColor: nativeHeaderActionColor } = useHeaderActionColors();

  const syncNativeHeaderDatePicker = useCallback(() => {
    if (!usesNativeTabs) return;

    setNativeHeaderDatePickerOptions(
      navigation as unknown as NativeHeaderDatePickerNavigation,
      {
        selectedDate,
        onPreviousDate: goToPreviousDay,
        onDatePress: openCalendar,
        onNextDate: goToNextDay,
        tintColor: nativeHeaderActionColor,
        accessibilityLabel: t('diary.chooseDate', {
          defaultValue: 'Choose diary date',
        }),
        previousDayLabel: t('common.previousDay', {
          defaultValue: ': previous day',
        }),
        nextDayLabel: t('common.nextDay', { defaultValue: ': next day' }),
        dateLabel: `${formatDateLabel(selectedDate, t, dateLocale)} ▾`,
        t,
        locale: dateLocale,
        leadingAction: hasFamilyDiaries
          ? {
              sfSymbol: 'person.2.fill',
              onPress: openFamilyDiaries,
              accessibilityLabel: familyDiariesAccessibilityLabel,
              identifier: 'family-diaries',
            }
          : undefined,
      }
    );
  }, [
    goToNextDay,
    goToPreviousDay,
    nativeHeaderActionColor,
    navigation,
    openFamilyDiaries,
    openCalendar,
    selectedDate,
    familyDiariesAccessibilityLabel,
    hasFamilyDiaries,
    usesNativeTabs,
    t,
    dateLocale,
  ]);

  useLayoutEffect(() => {
    syncNativeHeaderDatePicker();
  }, [syncNativeHeaderDatePicker]);

  useFocusEffect(
    useCallback(() => {
      syncNativeHeaderDatePicker();
    }, [syncNativeHeaderDatePicker])
  );

  const swipeGesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Fling()
          .direction(Directions.RIGHT)
          .onEnd(goToPreviousDay)
          .runOnJS(true),
        Gesture.Fling()
          .direction(Directions.LEFT)
          .onEnd(goToNextDay)
          .runOnJS(true)
      ),
    [goToPreviousDay, goToNextDay]
  );

  const handleCalendarSelect = useCallback(
    (date: string) => setSelectedDate(date),
    [setSelectedDate]
  );
  const { mealTypes } = useMealTypes();
  const openMealTypeDetail = useCallback(
    (mealTypeId: string | null, mealTypeName: string, entries: FoodEntry[]) => {
      // Resolve the label from the canonical definition (ownership-aware); for
      // a deleted/hidden type fall back to the literal historical name.
      const definition = mealTypes.find((mt) => mt.id === mealTypeId) ?? null;
      const mealLabel = definition
        ? getMealTypeDisplayLabel(definition, t)
        : getHistoricalMealTypeLabel(mealTypeName, t);
      navigation.navigate('MealTypeDetail', {
        date: selectedDate,
        mealTypeId: mealTypeId ?? undefined,
        mealType: mealTypeName,
        mealLabel,
      });
    },
    [navigation, selectedDate, mealTypes, t]
  );

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit as 'kg' | 'lbs') ?? 'kg';
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const weightMode = preferences?.default_weight_unit ?? 'kg';
  const bodyUnit: 'cm' | 'inches' =
    preferences?.default_measurement_unit === 'inches' ? 'inches' : 'cm';
  const heightMode = preferences?.default_measurement_unit ?? 'cm';
  const { getImageSource } = useExerciseImageSource();

  const { summary, isLoading, isError, refetch } = useDailySummary({
    date: selectedDate,
    enabled: isConnected,
  });
  const { measurements, refetch: refetchMeasurements } = useMeasurements({
    date: selectedDate,
    enabled: isConnected,
  });
  const { data: customMeasurements, refetch: refetchCustomMeasurements } =
    useCustomMeasurementsByDate(selectedDate, { enabled: isConnected });
  const { customNutrients, refetch: refetchCustomNutrients } =
    useCustomNutrients({ enabled: isConnected });
  const { preferences: nutrientPrefs, refetch: refetchNutrientPrefs } =
    useNutrientDisplayPreferences({ enabled: isConnected });

  const {
    wakeUp,
    naps,
    bedTime,
    isLoading: isSleepLoading,
    refetch: refetchSleep,
  } = useSleepDay(selectedDate, { enabled: isConnected });

  const diaryNutrientRow = nutrientPrefs.find(
    (p) => p.view_group === 'diary' && p.platform === 'mobile'
  );
  const customNutrientKeys = (diaryNutrientRow?.visible_nutrients ?? []).slice(
    0,
    4
  );
  const hasAnyMeasurement = useMemo(() => {
    // Only MANUAL custom entries make the Measurements section meaningful — a
    // user with pages of health-synced custom entries should not see the
    // section flash on their behalf.
    const manualCustom =
      customMeasurements?.filter((e) => isManualSource(e.source)) ?? [];
    if (manualCustom.length > 0) return true;
    if (!measurements) return false;
    return (
      measurements.weight != null ||
      measurements.body_fat_percentage != null ||
      measurements.height != null ||
      measurements.neck != null ||
      measurements.waist != null ||
      measurements.hips != null ||
      measurements.steps != null
    );
  }, [measurements, customMeasurements]);

  // Manual-only custom entries for the Diary tiles: health-synced entries are
  // filtered here (before presentation) so MeasurementsSummary never receives
  // them; the component itself re-filters defensively too.
  const manualCustomMeasurements = useMemo(
    () => (customMeasurements ?? []).filter((e) => isManualSource(e.source)),
    [customMeasurements]
  );

  const [refreshing, setRefreshing] = useState(false);
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const onRefresh = useCallback(async () => {
    if (!isConnected) return;
    setRefreshing(true);
    // Error-isolated refresh: one failing query must not prevent the others
    // from completing nor produce an unhandled rejection. The spinner is torn
    // down in `finally` regardless of individual query outcomes.
    try {
      await Promise.allSettled([
        refetch(),
        refetchMeasurements(),
        refetchCustomMeasurements(),
        refetchCustomNutrients(),
        refetchNutrientPrefs(),
        refetchSleep(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    isConnected,
    refetch,
    refetchMeasurements,
    refetchCustomMeasurements,
    refetchCustomNutrients,
    refetchNutrientPrefs,
    refetchSleep,
  ]);

  const isRefreshing = refreshing;

  const isDayEmpty = useMemo(() => {
    return (
      !isSleepLoading &&
      wakeUp === null &&
      summary?.foodEntries.length === 0 &&
      !hasSupplementNutrition(summary?.supplementTotals) && //A logged supplement is something the user recorded for this day, so the day is not empty even with no food, exercise or measurement.
      summary?.exerciseEntries.length === 0 &&
      !hasAnyMeasurement &&
      // A progress photo is something the user recorded for this day, so it
      // defeats the empty state exactly as a logged supplement does. Gated on
      // the load like sleep above: ungated, a day with photos flashes the empty
      // illustration until they arrive.
      !isPhotosLoading &&
      dayPhotos.length === 0 &&
      naps.length === 0 &&
      bedTime === null
    );
  }, [
    isSleepLoading,
    wakeUp,
    summary,
    hasAnyMeasurement,
    isPhotosLoading,
    dayPhotos,
    naps,
    bedTime,
  ]);

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          iconSize={64}
          title={t('diary.noServer', { defaultValue: 'No server configured' })}
          subtitle={t('diary.configureServer', {
            defaultValue:
              'Configure your server connection in Settings to view your diary.',
          })}
          action={{
            label: t('diary.goToSettings', { defaultValue: 'Go to Settings' }),
            onPress: () => navigation.navigate('Settings'),
            variant: 'primary',
          }}
        />
      );
    }

    // Sleep is deliberately not part of this gate: the cards render nothing until their
    // entries arrive, so a slow `/api/sleep` fills them in late instead of holding the
    // food and exercise that already loaded behind "Loading diary...".
    if (isLoading || isConnectionLoading) {
      return (
        <StatusView
          loading
          title={t('diary.loading', { defaultValue: 'Loading diary...' })}
        />
      );
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('diary.loadFailed', {
            defaultValue: 'Failed to load diary',
          })}
          subtitle={t('diary.checkConnection', {
            defaultValue: 'Please check your connection and try again.',
          })}
          action={{
            label: t('diary.retry', { defaultValue: 'Retry' }),
            onPress: () => refetch(),
            variant: 'primary',
          }}
        />
      );
    }

    if (!summary) {
      return null;
    }

    return (
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 bg-background"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior={usesNativeTabs ? 'automatic' : 'never'}
        automaticallyAdjustsScrollIndicatorInsets={usesNativeTabs}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
          />
        }
      >
        {(summary.foodEntries.length > 0 ||
          hasSupplementNutrition(summary.supplementTotals) ||
          summary.exerciseEntries.length > 0 ||
          summary.calorieGoal > 0) && (
          <DiaryCalorieMacroSummary
            summary={summary}
            showNetCarbs={preferences?.show_net_carbs === true}
            customNutrientKeys={customNutrientKeys}
            customNutrients={customNutrients}
          />
        )}
        {isDayEmpty ? (
          <>
            <EmptyDayIllustration />
            <Button
              variant="primary"
              className="px-6 mt-4 self-center"
              onPress={() =>
                navigation.navigate('FoodSearch', { date: selectedDate })
              }
            >
              {t('diary.addFood', { defaultValue: 'Add Food' })}
            </Button>
          </>
        ) : (
          <>
            <WakeUpCard
              entry={wakeUp}
              day={selectedDate}
              navigation={navigation}
            />
            <FoodSummary
              foodEntries={summary.foodEntries}
              mealTypes={mealTypes}
              goals={summary.goals}
              calorieGoal={summary.calorieGoal}
              onAddFood={() =>
                navigation.navigate('FoodSearch', { date: selectedDate })
              }
              onAdjustServing={(entry) =>
                servingSheetRef.current?.present(entry)
              }
              onPressMealType={openMealTypeDetail}
            />
            <ExerciseSummary
              exerciseEntries={summary.exerciseEntries}
              entryDate={selectedDate}
              getImageSource={getImageSource}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              onAddExercise={() =>
                addSheetRef.current?.present({ initialMenu: 'exercise' })
              }
              onPressWorkout={(session) => {
                if (session.type === 'preset') {
                  // The live workout's surface is the active screen; detail is
                  // for reviewing past or planned sessions.
                  if (
                    useActiveWorkoutStore.getState().sessionId === session.id
                  ) {
                    navigation.navigate('ActiveWorkout');
                    return;
                  }
                  navigation.navigate('WorkoutDetail', { session });
                } else {
                  navigation.navigate('ActivityDetail', { session });
                }
              }}
            />
            <NapsCard naps={naps} day={selectedDate} navigation={navigation} />
            <BedTimeCard
              entry={bedTime}
              day={selectedDate}
              navigation={navigation}
            />
            <MeasurementsSummary
              measurements={measurements}
              customMeasurements={manualCustomMeasurements}
              weightMode={weightMode}
              bodyUnit={bodyUnit}
              heightMode={heightMode}
              onPress={() =>
                navigation.navigate('MeasurementsAdd', { date: selectedDate })
              }
            />
            {/* Below the measurements: both are the same check-in, keyed on
                (user_id, entry_date) server-side. */}
            <CheckInPhotosSummary
              date={selectedDate}
              photos={dayPhotos}
              onPress={() =>
                navigation.navigate('ProgressPhotos', { date: selectedDate })
              }
            />
          </>
        )}
      </ScrollView>
    );
  };

  const renderedContent = renderContent();

  if (usesNativeTabs) {
    return (
      <>
        <GestureDetector gesture={swipeGesture}>
          <View collapsable={false} className="flex-1">
            {renderedContent ?? <View className="flex-1 bg-background" />}
          </View>
        </GestureDetector>
        <CalendarSheet
          ref={calendarRef}
          selectedDate={selectedDate}
          onSelectDate={handleCalendarSelect}
          markedDates={photoDates}
        />
        <ServingAdjustSheet
          ref={servingSheetRef}
          onViewEntry={(entry) =>
            navigation.navigate('FoodEntryView', { entry })
          }
        />
      </>
    );
  }

  const content = (
    <>
      {!isConnectionLoading && isConnected ? (
        <DateNavigator
          title={t('diary.title', { defaultValue: 'Diary' })}
          selectedDate={selectedDate}
          onPreviousDay={goToPreviousDay}
          onNextDay={goToNextDay}
          onToday={goToToday}
          onDatePress={openCalendar}
          showDateAlways
          action={
            hasFamilyDiaries
              ? {
                  icon: 'people',
                  accessibilityLabel: familyDiariesAccessibilityLabel,
                  onPress: openFamilyDiaries,
                }
              : undefined
          }
        />
      ) : (
        !isConnectionLoading && (
          <View className="px-4 pb-5" style={{ paddingTop: insets.top + 16 }}>
            <Text className="text-2xl font-bold text-text-primary">
              {t('diary.title', { defaultValue: 'Diary' })}
            </Text>
          </View>
        )
      )}
      {renderedContent}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={selectedDate}
        onSelectDate={handleCalendarSelect}
        markedDates={photoDates}
      />
      <ServingAdjustSheet
        ref={servingSheetRef}
        onViewEntry={(entry) => navigation.navigate('FoodEntryView', { entry })}
      />
    </>
  );

  return (
    <>
      <GestureDetector gesture={swipeGesture}>
        <View className="flex-1 bg-background">{content}</View>
      </GestureDetector>
    </>
  );
};

export default DiaryScreen;
