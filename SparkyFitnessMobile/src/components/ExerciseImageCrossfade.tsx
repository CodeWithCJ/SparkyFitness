import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import SafeImage from './SafeImage';

type ImageSource = { uri: string; headers: Record<string, string> };

interface ExerciseImageCrossfadeProps {
  sources: readonly [ImageSource, ImageSource];
  fallback?: React.ReactNode;
}

// Cadence tuned to read like the two-frame exercise GIFs this stands in for:
// hold each position, then dissolve to the other.
const HOLD_MS = 800;
const DISSOLVE_MS = 800;

// JPEGs cannot carry an alpha channel; anything else (png/webp/extension-less
// URLs) is assumed transparent-capable.
export const sourceMayHaveTransparency = (uri: string): boolean => {
  const path = uri.split(/[?#]/)[0];
  return !/\.jpe?g$/i.test(path);
};

/**
 * Loops a cross-dissolve between an exercise's two position images, standing
 * in for the paid animated GIFs at full image quality. Tap pauses and resumes.
 * Frames that fail to load show `fallback`; both failing reads as one static
 * placeholder since the layers are identical. Callers own the frame (size,
 * rounding) and should fall back to a static presentation when the OS
 * reduce-motion setting is on.
 */
const ExerciseImageCrossfade: React.FC<ExerciseImageCrossfadeProps> = ({
  sources,
  fallback = null,
}) => {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (paused) return;
    fade.value = withRepeat(
      withSequence(
        withDelay(HOLD_MS, withTiming(1, { duration: DISSOLVE_MS })),
        withDelay(HOLD_MS, withTiming(0, { duration: DISSOLVE_MS })),
      ),
      -1,
    );
    return () => cancelAnimation(fade);
  }, [paused, fade]);

  // A transparent-capable top frame never fully covers the base, so the base
  // must fade out in counter-phase or it ghosts through the top frame's
  // background during its hold. Opaque JPEGs keep the base at full opacity
  // instead: their top frame covers it completely once faded in, and holding
  // the base avoids the mid-dissolve dip a symmetric cross-fade shows where
  // both layers sit at partial opacity.
  const mayHaveTransparency =
    sourceMayHaveTransparency(sources[0].uri) ||
    sourceMayHaveTransparency(sources[1].uri);

  const baseStyle = useAnimatedStyle(() => ({
    opacity: mayHaveTransparency ? 1 - fade.value : 1,
  }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Contain keeps the full pose visible; transparent frames also get a white
  // backdrop because the exercise art is drawn for light backgrounds and
  // disappears against dark theme surfaces. Opaque frames cover-fill instead
  // so the card never shows hard image edges. The pair shares one mode so the
  // two frames stay aligned mid-dissolve.
  const contentFit = mayHaveTransparency ? 'contain' : 'cover';

  return (
    <Pressable
      testID="exercise-image-crossfade"
      accessibilityRole="button"
      accessibilityLabel={paused
        ? t('exerciseImage.playAnimation', { defaultValue: 'Play exercise animation' })
        : t('exerciseImage.pauseAnimation', { defaultValue: 'Pause exercise animation' })}
      onPress={() => setPaused((value) => !value)}
      style={[styles.fill, mayHaveTransparency && styles.whiteBackdrop]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, baseStyle]}>
        <SafeImage
          source={sources[0]}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          fallback={fallback}
          autoplay
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
        <SafeImage
          source={sources[1]}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          fallback={fallback}
          autoplay
        />
      </Animated.View>
      {paused && (
        <View
          testID="exercise-image-crossfade-paused"
          className="absolute bottom-2 right-2 bg-black/50 rounded-full p-1.5"
        >
          <Icon name="play" size={12} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  whiteBackdrop: { backgroundColor: '#ffffff' },
});

export default ExerciseImageCrossfade;
