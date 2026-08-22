import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import SafeImage from './SafeImage';
import Icon from './Icon';
import type { GetFoodImageSource } from '../hooks/useFoodImageSource';

interface FoodThumbnailProps {
  /** Stored image path, or null when the entity has no picture. */
  image: string | null;
  /** From `useFoodImageSource()`; hoisted so one cache serves a whole list. */
  getImageSource: GetFoodImageSource;
  size?: number;
  /** Which placeholder glyph to show when there is no image. */
  variant?: 'food' | 'meal';
  /**
   * When false, an entity with no image renders nothing at all rather than a
   * placeholder box. Dense rows (the diary) use this so a photo-free day keeps
   * exactly the layout it had before images existed.
   */
  showFallback?: boolean;
  /** Opens the lightbox. Omit to leave the thumbnail non-interactive. */
  onPress?: () => void;
  /**
   * Applied to the outer container. Callers pass spacing here rather than
   * wrapping the thumbnail, so a collapsed thumbnail leaves no stray margin.
   */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The one food/meal image slot, shared by search, library, and diary rows so
 * sizing and the empty state stay identical across them.
 */
const FoodThumbnail: React.FC<FoodThumbnailProps> = ({
  image,
  getImageSource,
  size = 44,
  variant = 'food',
  showFallback = true,
  onPress,
  style,
  testID = 'food-thumbnail',
}) => {
  const { t } = useTranslation();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  const source = image ? getImageSource(image) : null;

  if (!source && !showFallback) {
    return null;
  }

  const box = { width: size, height: size, borderRadius: 8 };

  const Container = onPress ? Pressable : View;

  return (
    <Container
      testID={testID}
      style={style}
      {...(onPress
        ? {
            onPress,
            accessibilityRole: 'imagebutton' as const,
            accessibilityLabel: t('foodSearch.accessibility.viewPhoto', { defaultValue: 'View photo' }),
            // Sibling pressable, never nested inside the row's own — nesting
            // leaves the inner one live while the parent is disabled. Matches
            // the exercise thumbnail pattern.
            hitSlop: 4,
          }
        : {})}
    >
      <SafeImage
        source={source}
        style={box}
        contentFit="cover"
        fallback={
          <View className="bg-raised items-center justify-center" style={box}>
            <Icon
              name={variant === 'meal' ? 'meal' : 'food'}
              size={Math.round(size / 2)}
              color={textMuted}
            />
          </View>
        }
      />
    </Container>
  );
};

export default FoodThumbnail;
