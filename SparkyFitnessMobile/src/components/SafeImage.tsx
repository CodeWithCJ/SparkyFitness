import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';

interface SafeImageProps {
  source: { uri: string; headers: Record<string, string> } | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  fallback?: React.ReactNode;
  /**
   * Whether animated formats (GIF, animated WebP) play. Off by default: most
   * SafeImage slots are list thumbnails, where a looping GIF next to static
   * JPEG exercises reads as broken. Screens that own the animation (exercise
   * detail) opt in.
   */
  autoplay?: boolean;
}

function getImageSourceSignature(
  source: { uri: string; headers: Record<string, string> } | null,
): string {
  if (!source) return '';

  const headerSignature = Object.entries(source.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  return `${source.uri}|${headerSignature}`;
}

// Exercise images are downloaded on-demand by the server on first request, so
// the initial fetch can race ahead of the server having the file on disk.
// Retry a couple of times with backoff before giving up to the fallback.
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const TRANSITION_MS = 150;
// A cached image paints within the first frames of mounting; an underlay
// shown from frame one would flash beneath every one of those. Hold it back
// long enough that only genuinely slow loads get a placeholder.
const UNDERLAY_DELAY_MS = 200;

/**
 * Slow and failing loads show the fallback as an underlay beneath the image
 * slot: a missing image never blanks-then-pops (the retry window hides behind
 * it), and a slow image cross-fades over it when it arrives. The underlay
 * fades in after a grace delay — so fast/cached loads never flash it — and is
 * removed once the image has fully faded in so images with transparency don't
 * show it through.
 */
const SafeImage: React.FC<SafeImageProps> = ({
  source,
  style,
  contentFit,
  fallback = null,
  autoplay = false,
}) => {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [settled, setSettled] = useState(false);
  const [showUnderlay, setShowUnderlay] = useState(false);
  const sourceSignature = getImageSourceSignature(source);

  // Reset the retry state when the image source changes. Done during render
  // (rather than in an effect) so the fallback/attempt state is correct on the
  // first render after a source change, with no intermediate flash.
  const [prevSignature, setPrevSignature] = useState(sourceSignature);
  if (sourceSignature !== prevSignature) {
    setPrevSignature(sourceSignature);
    setError(false);
    setAttempt(0);
    setLoaded(false);
    setSettled(false);
    setShowUnderlay(false);
  }

  useEffect(() => {
    if (!error || attempt >= MAX_RETRIES) return;
    const timer = setTimeout(() => {
      setError(false);
      setAttempt((a) => a + 1);
    }, RETRY_DELAY_MS * (attempt + 1));
    return () => clearTimeout(timer);
  }, [error, attempt]);

  useEffect(() => {
    if (loaded || showUnderlay) return;
    const timer = setTimeout(() => setShowUnderlay(true), UNDERLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, showUnderlay]);

  // Keep the underlay through the fade so opaque images cross-fade over it
  // instead of fading in against a blank slot.
  useEffect(() => {
    if (!loaded || settled) return;
    const timer = setTimeout(() => setSettled(true), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [loaded, settled]);

  if (!source) return fallback;

  const failed = error && attempt >= MAX_RETRIES;

  // Terminal failures keep the frame (rather than returning the bare
  // fallback) so the already-visible underlay doesn't remount or shift.
  return (
    <View style={[style as StyleProp<ViewStyle>, styles.frame]}>
      {(showUnderlay || failed) && !settled && (
        <Animated.View entering={FadeIn.duration(TRANSITION_MS)} style={StyleSheet.absoluteFill}>
          {fallback}
        </Animated.View>
      )}
      {!failed && (
        // Upload URLs are effectively immutable (filenames embed the
        // exercise/upload identity), so disk-cache them across launches.
        <Image
          key={attempt}
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          autoplay={autoplay}
          cachePolicy="memory-disk"
          transition={TRANSITION_MS}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </View>
  );
};

// The caller's borderRadius sits on the frame, so it must clip the
// absolute-filled image to keep rounded corners.
const styles = StyleSheet.create({ frame: { overflow: 'hidden' } });

export default SafeImage;
