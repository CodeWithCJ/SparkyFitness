import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

const BAR_COUNT = 17;
const BARS = Array.from({ length: BAR_COUNT }, (_, index) => {
  const distance =
    Math.abs(index - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
  return {
    index,
    taper: 0.18 + 0.82 * Math.cos((distance * Math.PI) / 2) ** 2,
  };
});

interface VoiceWaveformProps {
  /** Smoothed, normalized microphone level. Updates without rendering the chat. */
  level: SharedValue<number>;
  raised: string;
  accent: string;
}

function WaveBar({
  index,
  taper,
  level,
  phase,
  color,
  reducedMotion,
}: {
  index: number;
  taper: number;
  level: SharedValue<number>;
  phase: SharedValue<number>;
  color: string;
  reducedMotion: boolean;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const amplitude = Math.max(0, Math.min(1, level.value));
    const ripple = reducedMotion
      ? 0.5
      : (Math.sin(phase.value * 2 - index * 0.55) + 1) / 2;
    // In silence the dots only breathe gently; tall waves always require audio.
    const idle = reducedMotion
      ? 0
      : (Math.sin(phase.value - index * 0.3) + 1) / 2;

    return {
      height: 3 + idle * 1.5 + amplitude * taper * (15 + ripple * 8),
      opacity: 0.35 + taper * 0.25 + amplitude * 0.4,
    };
  });

  return (
    <Animated.View
      testID="voice-wave-bar"
      style={[styles.bar, { backgroundColor: color }, animatedStyle]}
    />
  );
}

/** A centered, audio-reactive wave with a quiet listening state between phrases. */
export default function VoiceWaveform({
  level,
  raised,
  accent,
}: VoiceWaveformProps) {
  const { t } = useTranslation();
  const phase = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!reducedMotion) {
      phase.value = withRepeat(
        withTiming(Math.PI * 2, { duration: 2400, easing: Easing.linear }),
        -1
      );
    }
    return () => cancelAnimation(phase);
  }, [phase, reducedMotion]);

  return (
    <View
      accessible
      accessibilityLabel={t('chat.voice.listening', {
        defaultValue: 'Listening',
      })}
      style={[styles.container, { backgroundColor: raised }]}
    >
      <View style={styles.wave}>
        {BARS.map(({ index, taper }) => (
          <WaveBar
            key={index}
            index={index}
            taper={taper}
            level={level}
            phase={phase}
            color={accent}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wave: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 3,
    borderRadius: 999,
  },
});
