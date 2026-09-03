import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { daysBetween } from '@workspace/shared';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import i18n from '../localization/i18n';
import Icon from '../components/Icon';
import ProgressPhotoViewer from '../components/ProgressPhotoViewer';
import SafeImage from '../components/SafeImage';
import PhotoDayWeight from '../components/PhotoDayWeight';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCheckInPhotoGallery } from '../hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../hooks/useCheckInPhotoSource';
import { usePreferences } from '../hooks/usePreferences';
import { formatShortDate } from '../utils/dateUtils';
import {
  formatWeightDisplay,
  weightFromKg,
  type WeightDisplayMode,
} from '../utils/unitConversions';
import type { PhotoType, ProgressPhotoDay } from '../types/checkInPhotos';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ProgressPhotoCompare'>;

/** Which of the two panes the date picker is currently assigning to. */
type Side = 'before' | 'after';

const ProgressPhotoCompareScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [accentPrimary, mutedColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  const angle: PhotoType = route.params?.angle ?? 'front';

  const { days, isLoading } = useCheckInPhotoGallery();
  const { getPhotoSource } = useCheckInPhotoSource();
  const [zoomedDay, setZoomedDay] = useState<ProgressPhotoDay | null>(null);
  const { preferences } = usePreferences();
  const weightMode: WeightDisplayMode =
    preferences?.default_weight_unit ?? 'kg';

  // Oldest first reads left-to-right as progression, which is how the two
  // panes are laid out.
  const timeline = useMemo<ProgressPhotoDay[]>(
    () =>
      days
        .filter((day) => day.photos[angle])
        .slice()
        .reverse(),
    [days, angle]
  );

  const [pickingSide, setPickingSide] = useState<Side>('before');
  const calendarRef = useRef<CalendarSheetRef>(null);
  const [pickedBefore, setPickedBefore] = useState<string | null>(null);
  const [pickedAfter, setPickedAfter] = useState<string | null>(null);

  // The two panes default to the widest span available (first shoot vs latest),
  // which already says something useful before the user picks anything. That
  // default is derived during render rather than synced into state by an
  // effect, so it is correct on the first paint the gallery arrives, and a day
  // that disappears underneath (a delete elsewhere) silently falls back
  // instead of leaving a pane pointing at a photo that no longer exists.
  const hasDay = (date: string | null): date is string =>
    date != null && timeline.some((day) => day.entry_date === date);

  const beforeDate = hasDay(pickedBefore)
    ? pickedBefore
    : (timeline[0]?.entry_date ?? null);
  const afterDate = hasDay(pickedAfter)
    ? pickedAfter
    : (timeline[timeline.length - 1]?.entry_date ?? null);

  const header = useScreenHeader({
    title: t('progressPhotos.compareTitle', { defaultValue: 'Compare' }),
    left: { kind: 'back' },
  });

  // Weight entry lives in Measurements; hand the day over rather than
  // duplicating the form here.
  const openWeightEntry = useCallback(
    (date: string) => navigation.navigate('MeasurementsAdd', { date }),
    [navigation]
  );

  const dayFor = useCallback(
    (date: string | null) =>
      date ? timeline.find((d) => d.entry_date === date) : undefined,
    [timeline]
  );

  const beforeDay = dayFor(beforeDate);
  const afterDay = dayFor(afterDate);

  /** The days that actually have this angle, for marking the picker. */
  const availableDates = useMemo(
    () => timeline.map((day) => day.entry_date),
    [timeline]
  );

  const openPicker = (which: Side) => {
    setPickingSide(which);
    calendarRef.current?.present();
  };

  const selectDay = (date: string) => {
    // The calendar can offer any day; only the ones with a photo for this
    // angle mean anything here, and they are the marked ones.
    if (!availableDates.includes(date)) {
      Toast.show({
        type: 'error',
        text1: t('progressPhotos.noPhotoOnDay', {
          defaultValue: 'No photo for this angle on that day',
        }),
      });
      return;
    }
    if (pickingSide === 'before') setPickedBefore(date);
    else setPickedAfter(date);
  };

  const spanDays =
    beforeDate && afterDate
      ? Math.abs(daysBetween(beforeDate, afterDate))
      : null;

  const deltaKg =
    beforeDay?.weight != null && afterDay?.weight != null
      ? afterDay.weight - beforeDay.weight
      : null;

  const formatDelta = (kg: number): string => {
    const converted =
      weightMode === 'st_lbs'
        ? weightFromKg(kg, 'lbs')
        : weightFromKg(kg, weightMode);
    const unit = weightMode === 'st_lbs' ? 'lb' : weightMode;
    const rounded = Math.round(converted * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded} ${unit}`;
  };

  const renderPane = (
    day: ProgressPhotoDay | undefined,
    label: string,
    which: Side
  ) => {
    const photo = day?.photos[angle];
    const source = photo ? getPhotoSource(photo.id) : null;
    return (
      <View className="flex-1">
        <Text className="text-text-secondary text-xs mb-1 text-center">
          {label}
        </Text>
        <TouchableOpacity
          onPress={() => day && setZoomedDay(day)}
          disabled={!photo}
          accessibilityRole="button"
          accessibilityLabel={t('progressPhotos.openPhotoA11y', {
            defaultValue: 'View this photo full screen',
          })}
          className="bg-surface rounded-xl overflow-hidden"
          style={{ aspectRatio: 3 / 4 }}
        >
          <SafeImage
            source={source}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            fallback={
              <View className="flex-1 items-center justify-center bg-raised">
                <Icon name="camera" size={22} color={mutedColor} />
              </View>
            }
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPicker(which)}
          activeOpacity={0.7}
          className="flex-row items-center justify-center mt-1.5"
          accessibilityRole="button"
          accessibilityLabel={t('progressPhotos.pickDayA11y', {
            defaultValue: 'Choose the {{side}} day',
            side: label,
          })}
        >
          <Text className="text-text-primary text-sm font-semibold">
            {day ? formatShortDate(day.entry_date, dateLocale) : '—'}
          </Text>
          <Icon
            name="chevron-down"
            size={11}
            color={accentPrimary}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
        <View className="items-center">
          <PhotoDayWeight
            weight={day?.weight ?? null}
            mode={weightMode}
            onLogWeight={() => day && openWeightEntry(day.entry_date)}
            className="text-text-secondary text-xs"
          />
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background"
        style={
          Platform.OS === 'android' ? { paddingTop: insets.top } : undefined
        }
      >
        {header}
        <View className="py-16 items-center">
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <ScrollView contentContainerClassName="px-4 py-3">
        <View className="flex-row gap-3">
          {renderPane(
            beforeDay,
            t('progressPhotos.before', { defaultValue: 'Before' }),
            'before'
          )}
          {renderPane(
            afterDay,
            t('progressPhotos.after', { defaultValue: 'After' }),
            'after'
          )}
        </View>

        {/* The span between the two shoots, below the pair rather than
            between it: a middle column would take ~64pt off photos that are
            the whole point of this screen. */}
        {(deltaKg != null || (spanDays != null && spanDays > 0)) && (
          <View className="bg-surface rounded-xl px-4 py-3 mt-3 flex-row items-center justify-center gap-3 shadow-sm">
            {deltaKg != null && (
              <Text
                className="text-lg font-bold"
                style={{ color: accentPrimary }}
              >
                {t('progressPhotos.deltaBadge', {
                  defaultValue: 'Δ {{value}}',
                  value: formatDelta(deltaKg),
                })}
              </Text>
            )}
            {spanDays != null && spanDays > 0 && (
              <Text className="text-text-muted text-xs">
                {t('progressPhotos.daysApart', {
                  defaultValue: '{{count}} days apart',
                  count: spanDays,
                })}
              </Text>
            )}
          </View>
        )}

        <Text className="text-text-secondary text-xs mt-5 text-center">
          {t('progressPhotos.pickWhich', {
            defaultValue: 'Tap either date to compare a different day',
          })}
        </Text>

        <View style={{ height: 32 }} />
      </ScrollView>

      <CalendarSheet
        ref={calendarRef}
        markedDates={availableDates}
        selectedDate={
          (pickingSide === 'before' ? beforeDate : afterDate) ??
          availableDates[availableDates.length - 1] ??
          ''
        }
        onSelectDate={selectDay}
      />

      <ProgressPhotoViewer
        visible={zoomedDay != null}
        source={
          zoomedDay?.photos[angle]
            ? getPhotoSource(zoomedDay.photos[angle]!.id)
            : null
        }
        title={
          zoomedDay
            ? formatShortDate(zoomedDay.entry_date, dateLocale)
            : undefined
        }
        subtitle={
          zoomedDay?.weight != null
            ? formatWeightDisplay(zoomedDay.weight, weightMode)
            : undefined
        }
        onClose={() => setZoomedDay(null)}
      />
    </View>
  );
};

export default ProgressPhotoCompareScreen;
