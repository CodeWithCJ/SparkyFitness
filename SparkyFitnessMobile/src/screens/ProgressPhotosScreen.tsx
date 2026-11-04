import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSignedWeightChange } from '@workspace/shared';
import { useCSSVariable } from 'uniwind';
import i18n from '../localization/i18n';
import Icon from '../components/Icon';
import SafeImage from '../components/SafeImage';
import ProgressPhotoViewer from '../components/ProgressPhotoViewer';
import PhotoDayWeight from '../components/PhotoDayWeight';
import PhotoDaySlots from '../components/PhotoDaySlots';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from '../components/ActionSheet';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import GuidedCheckInStepIndicator from '../components/GuidedCheckInStepIndicator';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useGuidedCheckIn } from '../hooks/useGuidedCheckIn';
import {
  useCheckInPhotoGallery,
  useCheckInPhotoDates,
  useCheckInPhotosByDate,
  useCheckInPhotoMutations,
} from '../hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../hooks/useCheckInPhotoSource';
import { usePreferences } from '../hooks/usePreferences';
import { getApiErrorMessage } from '../services/api/errors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { pickImageFromCamera, pickImagesFromLibrary } from '../utils/pickImage';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import {
  formatWeightDisplay,
  weightFromKg,
  type WeightDisplayMode,
} from '../utils/unitConversions';
import {
  PHOTO_TYPES,
  type CheckInPhoto,
  type PhotoType,
  type ProgressPhotoDay,
} from '../types/checkInPhotos';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ProgressPhotos'>;

/**
 * How many shoots the History preview lists.
 *
 * Counted in shoots rather than calendar days on purpose: someone who shoots
 * weekly would see a single row under a seven-day window, with no delta and so
 * no progress at all - the opposite of what the preview is for.
 */
const HISTORY_PREVIEW_LIMIT = 7;

function confirmRemovePhoto(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      i18n.t('progressPhotos.removeTitle', { defaultValue: 'Remove photo?' }),
      i18n.t('progressPhotos.removeMessage', {
        defaultValue: 'This deletes the photo from this day.',
      }),
      [
        {
          text: i18n.t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: i18n.t('progressPhotos.remove', {
            defaultValue: 'Remove Photo',
          }),
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ]
    );
  });
}

/**
 * A day paired with how its weight moved against the previous (older) day that
 * also has a photo for this angle. The delta is what makes the timeline read as
 * progression rather than a pile of dated pictures.
 */
interface TimelineRow {
  day: ProgressPhotoDay;
  photoId: string;
  deltaKg: number | null;
}

/**
 * The hub of the progress photo flow: the selected day's three angles on top,
 * where a tap adds, replaces or removes one, over a history of that angle with
 * each shoot's weight and its change since the one before. Compare and
 * Time-lapse hang off it and read the whole history, not the preview.
 *
 * The screen carries two angle concepts, which is its one real ambiguity: the
 * day block is angle-agnostic and always shows all three, while the segmented
 * control under History scopes the timeline and what Compare / Time-lapse open
 * with. They live in separate blocks so position tells them apart.
 */
const ProgressPhotosScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [accentPrimary, mutedColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  const [angle, setAngle] = useState<PhotoType>('front');
  /**
   * The photo on show full screen, from either the day block or a timeline
   * row. One piece of state, so one viewer is mounted rather than two modals
   * differing only in where they read the caption from.
   */
  const [zoomed, setZoomed] = useState<{
    photoId: string;
    date: string;
    weight: number | null;
  } | null>(null);

  // The add sheet passes the diary's active date; everything else starts today.
  const [selectedDate, setSelectedDate] = useState(
    route.params?.date ?? getTodayDate()
  );
  // Step 3 of the guided check-in, which keeps the day the check-in started on.
  const guidedCheckIn = useGuidedCheckIn({
    navigation,
    step: 'ProgressPhotos',
    date: route.params?.date,
    params: route.params?.guidedCheckIn,
  });
  /** Angle whose action sheet is open; also the target of a pick. */
  const [sheetAngle, setSheetAngle] = useState<PhotoType>('front');
  const actionSheetRef = useRef<ActionSheetRef>(null);
  const calendarRef = useRef<CalendarSheetRef>(null);
  // The picker is a native modal; without this a double tap opens two.
  const pickerLock = useRef(false);
  // A picked photo is shrunk before its upload starts, so `isUploading` alone
  // would let Finish leave while it is still on its way.
  const [isPicking, setIsPicking] = useState(false);
  const uploadedRef = useRef(false);
  // Set when the navigator closes the step while a photo is still on its way,
  // so the check-in is confirmed once that photo has landed.
  const closeWhenSettledRef = useRef<(() => void) | null>(null);

  const { days, isLoading, isError, refetch } = useCheckInPhotoGallery();
  const { photos: dayPhotos } = useCheckInPhotosByDate(selectedDate);
  // The check-in fixes the day, so it never opens the calendar these mark.
  const { dates: photoDates } = useCheckInPhotoDates(!guidedCheckIn);
  const { uploadAsync, uploadingType, isUploading, deleteAsync, isDeleting } =
    useCheckInPhotoMutations();

  const byType = useMemo(() => {
    const map = new Map<PhotoType, CheckInPhoto>();
    for (const photo of dayPhotos) map.set(photo.photo_type, photo);
    return map;
  }, [dayPhotos]);

  const selectedDay = useMemo(
    () => days.find((day) => day.entry_date === selectedDate),
    [days, selectedDate]
  );
  const { getPhotoSource } = useCheckInPhotoSource();
  const { preferences } = usePreferences();
  const weightMode: WeightDisplayMode =
    preferences?.default_weight_unit ?? 'kg';

  const angleLabel = useCallback(
    (type: PhotoType): string => {
      switch (type) {
        case 'front':
          return t('progressPhotos.angle.front', { defaultValue: 'Front' });
        case 'back':
          return t('progressPhotos.angle.back', { defaultValue: 'Back' });
        case 'side':
          return t('progressPhotos.angle.side', { defaultValue: 'Side' });
      }
    },
    [t]
  );

  const segments = useMemo<Segment<PhotoType>[]>(
    () => PHOTO_TYPES.map((type) => ({ key: type, label: angleLabel(type) })),
    [angleLabel]
  );

  // Only days that actually have this angle. `days` arrives newest-first, and
  // the delta compares against the next entry, which is the previous shoot.
  const allRows = useMemo<TimelineRow[]>(() => {
    const withAngle = days.filter((day) => day.photos[angle]);
    return withAngle.map((day, index) => {
      const older = withAngle[index + 1];
      const deltaKg =
        day.weight != null && older?.weight != null
          ? day.weight - older.weight
          : null;
      return { day, photoId: day.photos[angle]!.id, deltaKg };
    });
  }, [days, angle]);

  // Cut after the deltas, never before: the oldest visible row still compares
  // against the shoot before it, even though that one falls off the list.
  const rows = allRows.slice(0, HISTORY_PREVIEW_LIMIT);
  const isCapped = allRows.length > HISTORY_PREVIEW_LIMIT;

  // Gated on the whole history, not the preview: the description points at
  // these two for anything older, so they must not be off when it does.
  const canCompare = allRows.length >= 2;

  const handleFinish = useCallback(() => {
    if (pickerLock.current) return;
    guidedCheckIn?.finish({ saved: uploadedRef.current });
  }, [guidedCheckIn]);
  const isPhotoPending = isPicking || isUploading || isDeleting;
  // Photos are saved as they are added, so going back drops nothing, and
  // the flow keeps knowing a photo was saved.
  const handleBack = useCallback(() => {
    if (pickerLock.current) return;
    guidedCheckIn?.back?.(false, { saved: uploadedRef.current });
  }, [guidedCheckIn]);
  // Pushed, the screen pads below the status bar only when it draws its own
  // header. In the check-in it is a sheet, which on iOS already starts below
  // the status bar, so there only Android (full height) pads.
  const needsTopInset =
    !usesNativeHeader && (!guidedCheckIn || Platform.OS === 'android');

  // Photos save as they are added, so on the last step closing is finishing.
  // System Back and the iOS swipe down close the sheet without the header;
  // they finish with the same confirmation.
  useEffect(() => {
    if (!guidedCheckIn) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      const { type } = event.data.action;
      if (type !== 'GO_BACK' && type !== 'POP') return;
      const close = () =>
        guidedCheckIn.onNavigatorClose({ saved: uploadedRef.current });
      if (pickerLock.current) closeWhenSettledRef.current = close;
      else close();
    });
  }, [guidedCheckIn, navigation]);

  const header = useScreenHeader({
    title: t('progressPhotos.title', { defaultValue: 'Progress Photos' }),
    // The steps replace one another, so in the check-in this leaves the flow
    // rather than going back to step 2. The X is the same Finish.
    left: guidedCheckIn
      ? {
          kind: 'dismiss',
          onPress: handleFinish,
          disabled: isPhotoPending,
          accessibilityLabel: t('common.close', { defaultValue: 'Close' }),
        }
      : { kind: 'back' },
    right: guidedCheckIn
      ? {
          kind: 'primary',
          label: t('guidedCheckIn.finish', { defaultValue: 'Finish' }),
          onPress: handleFinish,
          disabled: isPhotoPending,
          identifier: 'guided-check-in-finish',
        }
      : undefined,
  });

  // Measurements owns weight entry, so the prompt hands the day over rather
  // than duplicating the form. Both are root-stack routes, so this is a push.
  const openWeightEntry = useCallback(
    (date: string) => navigation.navigate('MeasurementsAdd', { date }),
    [navigation]
  );

  // Uploads land immediately rather than staging behind a Save: this screen is
  // somewhere you browse, and unsaved state plus a back-guard does not belong
  // on it. One pick is one request, so the uploads stay serial anyway.
  const uploadFrom = useCallback(
    async (source: 'camera' | 'library', type: PhotoType) => {
      if (pickerLock.current) return;
      pickerLock.current = true;
      setIsPicking(true);
      try {
        let uri: string | undefined;
        if (source === 'camera') {
          const result = await pickImageFromCamera();
          if (result.status === 'denied') {
            Toast.show({
              type: 'error',
              text1: t('progressPhotos.cameraPermission', {
                defaultValue: 'Camera permission is required',
              }),
              text2: t('progressPhotos.cameraPermissionHint', {
                defaultValue:
                  'Enable camera access for SparkyFitness in Settings.',
              }),
            });
            return;
          }
          if (result.status === 'cancelled') return;
          uri = result.image.uri;
        } else {
          uri = (await pickImagesFromLibrary(1))[0]?.uri;
        }
        if (!uri) return;
        // The server upserts on (user_id, entry_date, photo_type), so an
        // upload over an existing angle replaces it with no delete first.
        await uploadAsync({ date: selectedDate, type, uri });
        uploadedRef.current = true;
      } catch (err) {
        Toast.show({
          type: 'error',
          text1: t('progressPhotos.uploadError', {
            defaultValue: 'Could not save that photo',
          }),
          text2: getApiErrorMessage(err) ?? undefined,
        });
      } finally {
        pickerLock.current = false;
        setIsPicking(false);
        closeWhenSettledRef.current?.();
        closeWhenSettledRef.current = null;
      }
    },
    [t, uploadAsync, selectedDate]
  );

  const removePhoto = useCallback(
    async (type: PhotoType) => {
      const photo = byType.get(type);
      if (!photo) return;
      if (!(await confirmRemovePhoto())) return;
      try {
        await deleteAsync(photo.id);
      } catch (err) {
        Toast.show({
          type: 'error',
          text1: t('progressPhotos.deleteError', {
            defaultValue: 'Could not remove that photo',
          }),
          text2: getApiErrorMessage(err) ?? undefined,
        });
      }
    },
    [byType, deleteAsync, t]
  );

  const openSheetFor = (type: PhotoType) => {
    setSheetAngle(type);
    actionSheetRef.current?.present();
  };

  const sheetItems = useMemo<ActionSheetItem[]>(() => {
    const items: ActionSheetItem[] = [
      {
        key: 'camera',
        label: t('progressPhotos.takePhoto', { defaultValue: 'Take Photo' }),
        onPress: () => void uploadFrom('camera', sheetAngle),
      },
      {
        key: 'library',
        label: t('progressPhotos.chooseLibrary', {
          defaultValue: 'Choose from Library',
        }),
        onPress: () => void uploadFrom('library', sheetAngle),
      },
    ];
    if (byType.has(sheetAngle)) {
      items.push({
        key: 'remove',
        label: t('progressPhotos.remove', { defaultValue: 'Remove Photo' }),
        destructive: true,
        onPress: () => void removePhoto(sheetAngle),
      });
    }
    return items;
  }, [t, uploadFrom, removePhoto, sheetAngle, byType]);

  const formatDelta = (deltaKg: number): string => {
    // Convert the difference itself, not each end, so rounding happens once.
    const converted =
      weightMode === 'st_lbs'
        ? weightFromKg(deltaKg, 'lbs')
        : weightFromKg(deltaKg, weightMode);
    const unit = weightMode === 'st_lbs' ? 'lb' : weightMode;
    return `${formatSignedWeightChange(converted)} ${unit}`;
  };

  const renderRow = ({ item }: { item: TimelineRow }) => {
    const source = getPhotoSource(item.photoId);
    return (
      <TouchableOpacity
        onPress={() =>
          setZoomed({
            photoId: item.photoId,
            date: item.day.entry_date,
            weight: item.day.weight,
          })
        }
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('progressPhotos.openPhotoA11y', {
          defaultValue: 'View this photo full screen',
        })}
        className="flex-row items-center bg-surface rounded-xl p-3 mb-3 shadow-sm"
      >
        <SafeImage
          source={source}
          style={{ width: 72, height: 96, borderRadius: 12 }}
          contentFit="cover"
          fallback={
            <View className="flex-1 items-center justify-center bg-raised">
              <Icon name="camera" size={20} color={mutedColor} />
            </View>
          }
        />
        <View className="flex-1 ml-3">
          <Text className="text-text-primary text-base font-semibold">
            {formatDateLabel(item.day.entry_date, t, dateLocale)}
          </Text>
          <PhotoDayWeight
            weight={item.day.weight}
            mode={weightMode}
            onLogWeight={
              guidedCheckIn
                ? undefined
                : () => openWeightEntry(item.day.entry_date)
            }
            className="text-text-secondary text-sm mt-0.5"
          />
          {item.deltaKg != null && item.deltaKg !== 0 && (
            <Text className="text-text-muted text-xs mt-0.5">
              {t('progressPhotos.sincePrevious', {
                defaultValue: '{{delta}} since previous',
                delta: formatDelta(item.deltaKg),
              })}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <View className="py-16 items-center">
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      );
    }

    if (isError) {
      return (
        <StatusView
          icon="warning"
          iconTone="danger"
          title={t('progressPhotos.loadError', {
            defaultValue: "Couldn't load your progress photos.",
          })}
          action={{
            label: t('common.tryAgain', { defaultValue: 'Please try again.' }),
            onPress: () => void refetch(),
          }}
        />
      );
    }

    if (rows.length === 0) {
      return (
        <View className="py-12 items-center px-6">
          <Icon name="camera" size={40} color={mutedColor} />
          <Text className="text-text-primary text-base font-semibold mt-3 text-center">
            {t('progressPhotos.emptyTitle', {
              defaultValue: 'No {{angle}} photos yet',
              angle: angleLabel(angle).toLowerCase(),
            })}
          </Text>
          <Text className="text-text-secondary text-sm mt-1 text-center">
            {t('progressPhotos.emptyBody', {
              defaultValue:
                'Add one above and it will show up here with that day’s weight.',
            })}
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={rows}
        keyExtractor={(row) => row.photoId}
        renderItem={renderRow}
        contentContainerClassName="px-4 pb-8"
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={needsTopInset ? { paddingTop: insets.top } : undefined}
    >
      {header}
      {guidedCheckIn && (
        <GuidedCheckInStepIndicator
          step={guidedCheckIn.step}
          total={guidedCheckIn.total}
          onBack={handleBack}
          backDisabled={isPhotoPending}
        />
      )}

      {/* The day on show, with its own management. Its own card, and angle
          agnostic: the selector further down scopes the history, not this. */}
      <View className="mx-4 mt-2 bg-surface rounded-xl p-3 shadow-sm">
        <View className="flex-row items-center justify-between mb-2">
          {guidedCheckIn ? (
            <Text className="text-text-primary text-base font-semibold">
              {formatDateLabel(selectedDate, t, dateLocale)}
            </Text>
          ) : (
            <TouchableOpacity
              onPress={() => calendarRef.current?.present()}
              activeOpacity={0.7}
              className="flex-row items-center"
              accessibilityRole="button"
              accessibilityLabel={t('progressPhotos.chooseDayA11y', {
                defaultValue: 'Choose the day',
              })}
            >
              <Text className="text-text-primary text-base font-semibold">
                {formatDateLabel(selectedDate, t, dateLocale)}
              </Text>
              <Icon
                name="chevron-down"
                size={12}
                color={accentPrimary}
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          )}
          <PhotoDayWeight
            weight={selectedDay?.weight ?? null}
            mode={weightMode}
            onLogWeight={
              guidedCheckIn ? undefined : () => openWeightEntry(selectedDate)
            }
            className="text-text-secondary text-sm"
          />
        </View>

        <PhotoDaySlots
          photos={byType}
          uploadingType={uploadingType}
          onPick={openSheetFor}
          onView={(photo) =>
            setZoomed({
              photoId: photo.id,
              date: selectedDate,
              weight: selectedDay?.weight ?? null,
            })
          }
          onManage={openSheetFor}
        />
      </View>

      <View className="px-4 pt-4 pb-3">
        <Text className="text-text-secondary text-xs font-semibold mb-1 uppercase">
          {t('progressPhotos.historySection', { defaultValue: 'History' })}
        </Text>
        <Text className="text-text-muted text-xs mb-2">
          {isCapped && guidedCheckIn
            ? t('progressPhotos.historyDescriptionCappedCheckIn', {
                defaultValue: 'Your {{limit}} most recent, newest first.',
                limit: HISTORY_PREVIEW_LIMIT,
              })
            : isCapped
              ? t('progressPhotos.historyDescriptionCapped', {
                  defaultValue:
                    'Your {{limit}} most recent. Compare or Time-lapse look further back.',
                  limit: HISTORY_PREVIEW_LIMIT,
                })
              : t('progressPhotos.historyDescription', {
                  defaultValue: 'Your photos for this angle, newest first.',
                })}
        </Text>
        <SegmentedControl
          segments={segments}
          activeKey={angle}
          onSelect={setAngle}
        />

        {/* Looking back is not part of logging the day, so the check-in
            leaves it to the screen opened on its own. */}
        {!guidedCheckIn && (
          <View className="flex-row gap-3 mt-3">
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('ProgressPhotoCompare', { angle })
              }
              disabled={!canCompare}
              className="flex-1 flex-row items-center justify-center bg-surface rounded-lg py-2.5 shadow-sm"
              style={!canCompare ? { opacity: 0.4 } : undefined}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCompare }}
            >
              <Icon name="copy" size={16} color={accentPrimary} />
              <Text
                className="text-sm font-semibold ml-1.5"
                style={{ color: accentPrimary }}
              >
                {t('progressPhotos.compare', { defaultValue: 'Compare' })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('ProgressPhotoTimelapse', { angle })
              }
              disabled={!canCompare}
              className="flex-1 flex-row items-center justify-center bg-surface rounded-lg py-2.5 shadow-sm"
              style={!canCompare ? { opacity: 0.4 } : undefined}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCompare }}
            >
              <Icon name="play" size={16} color={accentPrimary} />
              <Text
                className="text-sm font-semibold ml-1.5"
                style={{ color: accentPrimary }}
              >
                {t('progressPhotos.timelapse', { defaultValue: 'Time-lapse' })}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {renderBody()}

      {!guidedCheckIn && (
        <CalendarSheet
          ref={calendarRef}
          markedDates={photoDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      )}

      <ActionSheet
        ref={actionSheetRef}
        title={t('progressPhotos.slotSheetTitle', {
          defaultValue: 'Progress photo',
        })}
        items={sheetItems}
      />

      <ProgressPhotoViewer
        visible={zoomed != null}
        source={zoomed ? getPhotoSource(zoomed.photoId) : null}
        title={zoomed ? formatDateLabel(zoomed.date, t, dateLocale) : undefined}
        subtitle={
          zoomed?.weight != null
            ? formatWeightDisplay(zoomed.weight, weightMode)
            : undefined
        }
        onClose={() => setZoomed(null)}
      />
    </View>
  );
};

export default ProgressPhotosScreen;
