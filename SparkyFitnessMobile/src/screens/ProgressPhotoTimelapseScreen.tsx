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
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useCSSVariable } from 'uniwind';
import i18n from '../localization/i18n';
import Icon from '../components/Icon';
import SafeImage from '../components/SafeImage';
import PhotoDayWeight from '../components/PhotoDayWeight';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import DateRangeSheet, {
  type DateRangeSheetRef,
} from '../components/DateRangeSheet';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCheckInPhotoGallery } from '../hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../hooks/useCheckInPhotoSource';
import { usePreferences } from '../hooks/usePreferences';
import { addDays, compareDays } from '@workspace/shared';
import { formatShortDate, getTodayDate } from '../utils/dateUtils';
import { type WeightDisplayMode } from '../utils/unitConversions';
import type { PhotoType, ProgressPhotoDay } from '../types/checkInPhotos';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ProgressPhotoTimelapse'>;

type Speed = 'slow' | 'normal' | 'fast';

/** How far back the playback reaches. */
type Range = '30d' | '3m' | 'all' | 'custom';

const PRESET_DAYS: Record<'30d' | '3m', number> = { '30d': 30, '3m': 92 };

/** Inclusive YYYY-MM-DD bounds, or null for an unbounded end. */
type Bounds = { from: string | null; to: string | null };

/** A user-picked range always has both ends. */
type CustomRange = { from: string; to: string };

/**
 * How long each frame is held, and how long the cross-fade between two frames
 * takes. The fade is a large share of the hold on purpose: a hard cut between
 * two body shots reads as a jerky slideshow, while an overlapping dissolve
 * turns the same pictures into a continuous transition.
 */
const SPEEDS: Record<Speed, { holdMs: number; fadeMs: number }> = {
  slow: { holdMs: 1400, fadeMs: 700 },
  normal: { holdMs: 900, fadeMs: 450 },
  fast: { holdMs: 500, fadeMs: 260 },
};

/** How many frames ahead to warm the image cache, so a fade never starts on a blank. */
const PREFETCH_AHEAD = 3;

/**
 * Plays one angle's history back as a cross-faded sequence.
 *
 * Only the current frame is mounted, with `PREFETCH_AHEAD` warmed behind it, so
 * playback costs the same whether the history is ten shoots or a thousand. The
 * header menu windows it to 30 days, 3 months, all time, or a range picked by
 * hand; every window is evaluated as absolute day bounds, presets included, so
 * there is one filter rather than a relative and an absolute one.
 */
const ProgressPhotoTimelapseScreen: React.FC<Props> = ({
  navigation,
  route,
}) => {
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
  const { preferences } = usePreferences();
  const weightMode: WeightDisplayMode =
    preferences?.default_weight_unit ?? 'kg';

  const [range, setRange] = useState<Range>('3m');
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const rangeSheetRef = useRef<DateRangeSheetRef>(null);

  // Oldest → newest: the whole point is watching the change accumulate.
  const allFrames = useMemo<ProgressPhotoDay[]>(
    () =>
      days
        .filter((day) => day.photos[angle])
        .slice()
        .reverse(),
    [days, angle]
  );

  const markedDays = useMemo(
    () => allFrames.map((day) => day.entry_date),
    [allFrames]
  );

  // Every window is expressed as absolute bounds, presets included: a preset is
  // just "N days back from today", so one filter serves both and a custom range
  // needs no second code path.
  const boundsFor = useCallback(
    (window: Range): Bounds => {
      if (window === 'all') return { from: null, to: null };
      if (window === 'custom') {
        return custom ?? { from: null, to: null };
      }
      const today = getTodayDate();
      return { from: addDays(today, -PRESET_DAYS[window]), to: today };
    },
    [custom]
  );

  const framesIn = useCallback(
    (window: Range): ProgressPhotoDay[] => {
      const { from, to } = boundsFor(window);
      if (from == null && to == null) return allFrames;
      return allFrames.filter(
        (day) =>
          (from == null || compareDays(day.entry_date, from) >= 0) &&
          (to == null || compareDays(day.entry_date, to) <= 0)
      );
    },
    [allFrames, boundsFor]
  );

  // A default window that happens to be empty would show "add two photos" to
  // someone whose whole history is older than it, so fall back to everything
  // rather than to a dead screen. Derived, so a later pick still wins.
  //
  // A custom range is exempt: the dates were chosen deliberately, and quietly
  // playing the whole history instead would misreport what is in them.
  // Memoized so the identity only changes with the frame set: the prefetch
  // effect below lists `frames` as a dependency, and an inline filter would
  // hand it a fresh array on every render.
  const keepsEmptyWindow = range === 'all' || range === 'custom';
  const { frames, widened } = useMemo(() => {
    const windowed = framesIn(range);
    if (windowed.length >= 2 || keepsEmptyWindow) {
      return { frames: windowed, widened: false };
    }
    return { frames: allFrames, widened: true };
  }, [framesIn, range, keepsEmptyWindow, allFrames]);

  // What is actually playing, which is not always what the menu has selected.
  // The counter reads from this: labelling a widened run with the preset the
  // user picked would claim their whole history fits in the last 30 days.
  const playingRange: Range = widened ? 'all' : range;

  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');

  const { holdMs, fadeMs } = SPEEDS[speed];

  const rangeLabel = useCallback(
    (window: Range): string => {
      switch (window) {
        case '30d':
          return t('progressPhotos.range30d', {
            defaultValue: 'Last 30 days',
          });
        case '3m':
          return t('progressPhotos.range3m', {
            defaultValue: 'Last 3 months',
          });
        case 'all':
          return t('progressPhotos.rangeAll', { defaultValue: 'All time' });
        case 'custom':
          // Before a range is picked the menu row still needs a name; once it is,
          // the dates themselves say more than the word "custom" would.
          return custom
            ? `${formatShortDate(custom.from, dateLocale)} – ${formatShortDate(custom.to, dateLocale)}`
            : t('progressPhotos.rangeCustom', {
                defaultValue: 'Custom range…',
              });
      }
    },
    [t, custom, dateLocale]
  );

  const header = useScreenHeader({
    title: t('progressPhotos.timelapseTitle', { defaultValue: 'Time-lapse' }),
    left: { kind: 'back' },
    right: {
      kind: 'menu',
      accessibilityLabel: t('progressPhotos.rangeA11y', {
        defaultValue: 'Choose how far back to play',
      }),
      showsBadge: range !== 'all',
      items: [
        {
          label: t('progressPhotos.rangeSection', {
            defaultValue: 'Play back',
          }),
          items: (['30d', '3m', 'all', 'custom'] as Range[]).map((window) => ({
            label: rangeLabel(window),
            selected: range === window,
            onPress: () =>
              window === 'custom'
                ? rangeSheetRef.current?.present()
                : setRange(window),
          })),
        },
      ],
      identifier: 'timelapse-range',
    },
  });

  // Reset when the frame set changes (angle switch, or a photo deleted while
  // this screen was backgrounded) so the index can never point past the end.
  // Adjusted during render rather than in an effect, so the first paint after
  // the change already shows frame 0 instead of flashing a stale one.
  const [prevFrameCount, setPrevFrameCount] = useState(frames.length);
  if (prevFrameCount !== frames.length) {
    setPrevFrameCount(frames.length);
    setIndex(0);
    setIsPlaying(false);
  }

  // Warm the next few frames. expo-image dedupes by URL, so re-prefetching an
  // already-cached frame is cheap. Failures are silent by design: a cold frame
  // still loads on display, it just fades in from the placeholder.
  useEffect(() => {
    const upcoming = frames.slice(index + 1, index + 1 + PREFETCH_AHEAD);
    for (const day of upcoming) {
      const photo = day.photos[angle];
      if (!photo) continue;
      const source = getPhotoSource(photo.id);
      if (!source) continue;
      void Image.prefetch(source.uri, { headers: source.headers }).catch(
        () => {}
      );
    }
  }, [frames, index, angle, getPhotoSource]);

  // Playback stops on the last frame rather than looping, so the current shot
  // stays on screen. That end state is derived, not written back into
  // isPlaying: the clock simply stops scheduling, which keeps the effect free
  // of setState and leaves one source of truth for what the button shows.
  const atEnd = frames.length === 0 || index >= frames.length - 1;
  const isRunning = isPlaying && !atEnd;

  // The playback clock: each tick advances exactly one frame.
  useEffect(() => {
    if (!isRunning) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), holdMs);
    return () => clearTimeout(timer);
  }, [isRunning, index, holdMs]);

  // Plain, like step() below: the compiler memoizes it, and a manual dependency
  // list here no longer matches what it infers now that frames is derived.
  const togglePlay = () => {
    if (frames.length === 0) return;
    // Pressing play at the end replays from the start rather than doing
    // nothing, so a finished run is one tap from being watched again.
    if (!isRunning) {
      if (atEnd) setIndex(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(false);
  };

  const step = (delta: number) => {
    setIsPlaying(false);
    setIndex((i) => Math.min(Math.max(i + delta, 0), frames.length - 1));
  };

  const speedSegments = useMemo<Segment<Speed>[]>(
    () => [
      {
        key: 'slow',
        label: t('progressPhotos.speedSlow', { defaultValue: 'Slow' }),
      },
      {
        key: 'normal',
        label: t('progressPhotos.speedNormal', { defaultValue: 'Normal' }),
      },
      {
        key: 'fast',
        label: t('progressPhotos.speedFast', { defaultValue: 'Fast' }),
      },
    ],
    [t]
  );

  const current = frames[index];
  const currentPhoto = current?.photos[angle];

  const body = () => {
    if (isLoading) {
      return (
        <View className="py-16 items-center">
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      );
    }

    // Fewer than two frames is the empty state, not a playable one: a lone
    // frame is already `atEnd`, so the controls would render with a Play button
    // that sets state and never schedules a tick.
    if (frames.length < 2 || !current || !currentPhoto) {
      return (
        <View className="py-16 items-center px-6">
          <Icon name="camera" size={40} color={mutedColor} />
          <Text className="text-text-secondary text-sm mt-3 text-center">
            {t('progressPhotos.timelapseEmpty', {
              defaultValue:
                'Add at least two photos of this angle to play a time-lapse.',
            })}
          </Text>
        </View>
      );
    }

    return (
      <>
        {/* Only the active frame is mounted; the outgoing copy lingers for the
            duration of its exit animation, so the two overlap into a real
            cross-fade rather than a cut. */}
        <View
          className="bg-surface rounded-xl overflow-hidden mx-4"
          style={{ aspectRatio: 3 / 4 }}
        >
          <Animated.View
            key={currentPhoto.id}
            entering={FadeIn.duration(fadeMs)}
            exiting={FadeOut.duration(fadeMs)}
            style={StyleSheet.absoluteFill}
          >
            <SafeImage
              source={getPhotoSource(currentPhoto.id)}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              fallback={<View className="flex-1 bg-raised" />}
            />
          </Animated.View>
        </View>

        <View className="items-center mt-3">
          <Text className="text-text-primary text-base font-semibold">
            {formatShortDate(current.entry_date, dateLocale)}
          </Text>
          <PhotoDayWeight
            weight={current.weight}
            mode={weightMode}
            onLogWeight={() =>
              navigation.navigate('MeasurementsAdd', {
                date: current.entry_date,
              })
            }
            className="text-text-secondary text-sm"
          />
          <Text className="text-text-muted text-xs mt-0.5">
            {t('progressPhotos.frameCountRanged', {
              defaultValue: '{{current}} of {{total}} · {{range}}',
              current: index + 1,
              total: frames.length,
              range: rangeLabel(playingRange),
            })}
          </Text>
        </View>

        <View className="flex-row items-center justify-center gap-6 mt-4">
          <TouchableOpacity
            onPress={() => step(-1)}
            disabled={index === 0}
            hitSlop={10}
            style={index === 0 ? { opacity: 0.3 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('progressPhotos.previousFrame', {
              defaultValue: 'Previous photo',
            })}
          >
            <Icon name="chevron-back" size={24} color={accentPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={togglePlay}
            hitSlop={10}
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{ backgroundColor: accentPrimary }}
            accessibilityRole="button"
            accessibilityLabel={
              isRunning
                ? t('progressPhotos.pause', { defaultValue: 'Pause' })
                : t('progressPhotos.play', { defaultValue: 'Play' })
            }
          >
            <Icon name={isRunning ? 'pause' : 'play'} size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => step(1)}
            disabled={index >= frames.length - 1}
            hitSlop={10}
            style={index >= frames.length - 1 ? { opacity: 0.3 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('progressPhotos.nextFrame', {
              defaultValue: 'Next photo',
            })}
          >
            <Icon name="chevron-forward" size={24} color={accentPrimary} />
          </TouchableOpacity>
        </View>

        <View className="px-4 mt-5">
          <SegmentedControl
            segments={speedSegments}
            activeKey={speed}
            onSelect={setSpeed}
          />
        </View>
      </>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <View className="pt-2">{body()}</View>

      <DateRangeSheet
        ref={rangeSheetRef}
        // The days that have this angle, so a range can be drawn around the
        // photos rather than guessed at - the same dots the gallery's picker
        // shows.
        markedDates={markedDays}
        title={t('progressPhotos.rangeSheetTitle', {
          defaultValue: 'Play back a date range',
        })}
        confirmLabel={t('progressPhotos.rangeSheetAction', {
          defaultValue: 'Play this range',
        })}
        onConfirm={(from, to) => {
          setCustom({ from, to });
          setRange('custom');
        }}
      />
    </View>
  );
};

export default ProgressPhotoTimelapseScreen;
