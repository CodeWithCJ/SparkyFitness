import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

export function formatRestCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface ActiveWorkoutRestBarProps {
  remainingMs: number;
  durationSec: number;
  paused: boolean;
  /** What's up next, e.g. "Incline DB Press · Set 3". */
  label: string;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
}

/**
 * Bottom-docked rest bar, visible only while a rest timer exists (resting or
 * paused). A thin progress track on top, the big countdown on the left, the
 * on-deck set on the right, and −15s / +15s / Skip rest controls.
 */
function ActiveWorkoutRestBar({
  remainingMs,
  durationSec,
  paused,
  label,
  onAdjust,
  onSkip,
}: ActiveWorkoutRestBarProps) {
  const insets = useSafeAreaInsets();
  const [accentPrimary, textMuted, trackColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-progress-track',
  ]) as [string, string, string];

  const progress =
    durationSec > 0 ? Math.max(0, Math.min(1, remainingMs / (durationSec * 1000))) : 0;

  return (
    <View
      className="bg-surface border-t border-border-subtle px-4 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 10) }}
    >
      <View
        className="h-1 rounded-full overflow-hidden mb-2.5"
        style={{ backgroundColor: trackColor }}
      >
        <View
          testID="rest-progress-fill"
          className="h-full rounded-full"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: paused ? textMuted : accentPrimary,
          }}
        />
      </View>

      <View className="flex-row items-center mb-2.5">
        <Text
          className="text-3xl font-bold"
          style={{
            color: paused ? textMuted : accentPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatRestCountdown(remainingMs)}
        </Text>
        <Text
          numberOfLines={1}
          className="flex-1 text-right text-sm font-medium text-text-primary ml-3"
        >
          {label}
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => onAdjust(-15)}
          accessibilityRole="button"
          accessibilityLabel="Shorten rest by 15 seconds"
          className="rounded-full bg-raised px-4 py-2"
        >
          <Text
            className="text-sm font-semibold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            −15s
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onAdjust(15)}
          accessibilityRole="button"
          accessibilityLabel="Extend rest by 15 seconds"
          className="rounded-full bg-raised px-4 py-2"
        >
          <Text
            className="text-sm font-semibold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            +15s
          </Text>
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          className="rounded-full px-4 py-2"
          style={{ backgroundColor: accentPrimary }}
        >
          <Text className="text-sm font-semibold text-white">Skip rest</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default React.memo(ActiveWorkoutRestBar);
