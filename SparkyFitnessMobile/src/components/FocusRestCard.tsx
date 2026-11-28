import React from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import { useClockTick } from '../hooks/useClockTick';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { withAlpha } from '../utils/colors';
import { formatRestCountdown } from '../utils/workoutSession';

interface FocusRestCardProps {
  /** The set the rest leads into, e.g. "Set 3 · 82.5 kg × 8". Null hides the line. */
  nextText: string | null;
  /** The card's measured height, so the page can pad its scroll content clear of it. */
  onHeightChange?: (height: number) => void;
}

const BOTTOM_PADDING = 12;

/**
 * The focus view's rest timer: an edge-to-edge sheet docked to the bottom of the page
 * (not part of the sets, which scroll beneath it) showing the target, what
 * comes next, the big countdown over a progress bar, and −15 s / Pause /
 * +15 s / Skip. The lead-in beeps themselves live in the rest bar, which
 * stays mounted. Render it inside a relatively positioned parent.
 */
function FocusRestCard({ nextText, onHeightChange }: FocusRestCardProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { state, remainingMs, progress } = useRestCountdown({
    selfTick: false,
  });
  useClockTick(state === 'resting');
  const durationSec = useActiveWorkoutStore((s) => s.rest.durationSec);
  const [restColor, onRest, textMuted, trackColor, borderStrong] =
    useCSSVariable([
      '--color-rest',
      '--color-on-rest',
      '--color-text-muted',
      '--color-progress-track',
      '--color-border-strong',
    ]) as [string, string, string, string, string];

  if (state === 'ready') return null;
  const paused = state === 'paused';
  const timerColor = paused ? textMuted : restColor;

  const adjust = (deltaSec: number) =>
    useActiveWorkoutStore.getState().adjustRest(deltaSec);
  const togglePause = () => {
    const store = useActiveWorkoutStore.getState();
    if (paused) store.resumeRest();
    else store.pauseRest();
  };
  const skip = () => useActiveWorkoutStore.getState().dismissRest();
  const adjustButton = (delta: -15 | 15) => (
    <Pressable
      key={delta}
      onPress={() => adjust(delta)}
      accessibilityRole="button"
      accessibilityLabel={
        delta < 0
          ? t('activeWorkout.rest.shorten', {
              defaultValue: 'Shorten rest by 15 seconds',
            })
          : t('activeWorkout.rest.extend', {
              defaultValue: 'Extend rest by 15 seconds',
            })
      }
      hitSlop={6}
      testID={delta < 0 ? 'focus-rest-shorten' : 'focus-rest-extend'}
      className="h-11 flex-1 items-center justify-center rounded-full active:opacity-70"
      style={{
        borderWidth: 1.5,
        borderColor: borderStrong,
        backgroundColor: withAlpha(restColor, 0.08),
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        className="text-[17px] font-bold"
        style={{ color: restColor, fontVariant: ['tabular-nums'] }}
      >
        {delta < 0
          ? t('activeWorkout.focus.rest.minus15', { defaultValue: '−15 s' })
          : t('activeWorkout.focus.rest.plus15', { defaultValue: '+15 s' })}
      </Text>
    </Pressable>
  );

  const targetText = formatRestCountdown(durationSec * 1000);
  const handleLayout = (e: LayoutChangeEvent) =>
    onHeightChange?.(Math.round(e.nativeEvent.layout.height));

  return (
    <View
      testID="focus-rest-card"
      onLayout={handleLayout}
      className="absolute gap-2 bg-raised px-3.5 pt-3.5"
      style={{
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: insets.bottom + BOTTOM_PADDING,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: -2 },
        elevation: 8,
      }}
    >
      <View className="flex-row items-start justify-between gap-x-2">
        <Text
          className="shrink text-xs font-bold uppercase"
          style={{ color: timerColor, letterSpacing: 1 }}
        >
          {paused
            ? t('activeWorkout.focus.rest.pausedTarget', {
                defaultValue: 'Rest paused · Target {{time}}',
                time: targetText,
              })
            : t('activeWorkout.focus.rest.labelTarget', {
                defaultValue: 'Rest · Target {{time}}',
                time: targetText,
              })}
        </Text>
        <View className="min-w-0 shrink items-end">
          {nextText != null && (
            <Text
              className="text-right text-[13px] text-text-secondary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {t('activeWorkout.focus.rest.next', {
                defaultValue: 'Next: {{value}}',
                value: nextText,
              })}
            </Text>
          )}
        </View>
      </View>
      <Text
        className="text-center text-[44px] font-bold"
        style={{
          color: timerColor,
          fontVariant: ['tabular-nums'],
          lineHeight: 50,
        }}
      >
        {formatRestCountdown(remainingMs)}
      </Text>
      <View
        testID="focus-rest-progress"
        className="h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: trackColor }}
      >
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: timerColor,
          }}
        />
      </View>
      <View className="flex-row items-center gap-2.5">
        {adjustButton(-15)}
        <Pressable
          testID="focus-rest-pause"
          onPress={togglePause}
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? t('activeWorkout.rest.resume', { defaultValue: 'Resume rest' })
              : t('activeWorkout.rest.pause', { defaultValue: 'Pause rest' })
          }
          className="h-11 flex-[1.5] flex-row items-center justify-center gap-1.5 rounded-full bg-control px-2 active:opacity-70"
        >
          <Icon
            name={paused ? 'play' : 'pause'}
            size={16}
            color={restColor}
            weight="bold"
          />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            className="shrink text-[17px] font-bold text-text-primary"
          >
            {paused
              ? t('activeWorkout.focus.rest.resumeButton', {
                  defaultValue: 'Resume',
                })
              : t('activeWorkout.focus.rest.pauseButton', {
                  defaultValue: 'Pause',
                })}
          </Text>
        </Pressable>
        {adjustButton(15)}
        <Pressable
          testID="focus-rest-skip"
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.rest.skip', {
            defaultValue: 'Skip rest',
          })}
          className="h-11 flex-1 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: restColor }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            className="text-[17px] font-bold"
            style={{ color: onRest }}
          >
            {t('activeWorkout.focus.rest.skipShort', {
              defaultValue: 'Skip',
            })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default React.memo(FocusRestCard);
