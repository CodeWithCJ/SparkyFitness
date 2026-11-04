import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from './Icon';
import SafeImage from './SafeImage';
import ZoomableView from './ZoomableView';

export interface ProgressPhotoViewerProps {
  visible: boolean;
  source: { uri: string; headers: Record<string, string> } | null;
  /** Shown under the photo, e.g. the shoot date. */
  title?: string;
  /** Shown beneath the title, e.g. that day's weight. */
  subtitle?: string;
  onClose: () => void;
}

/**
 * Full-screen viewer for one progress photo, with pinch to zoom and drag to
 * pan.
 *
 * This does not reuse ImageLightbox: that component resolves its URIs through
 * the food image source context and takes plain `string` URLs, while check-in
 * photo bytes sit behind auth and need per-request headers. Its multi-image
 * autoplay would also compete with the dedicated time-lapse screen.
 */
const ProgressPhotoViewer: React.FC<ProgressPhotoViewerProps> = ({
  visible,
  source,
  title,
  subtitle,
  onClose,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  if (!source) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        {/* Keyed on `visible`: zoom belongs to one viewing session, so it is
            cleared on the way out and reopening starts at 1x. */}
        <ZoomableView
          resetKey={visible}
          style={{ width, height: height * 0.8 }}
          className="self-center my-auto"
        >
          <SafeImage
            source={source}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
          />
        </ZoomableView>

        <Pressable
          onPress={onClose}
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          testID="progress-photo-viewer-close"
          hitSlop={12}
          className="absolute"
          style={{ top: insets.top + 8, right: 16 }}
        >
          <View className="bg-black/60 rounded-full p-2">
            <Icon name="close" size={22} color="#fff" />
          </View>
        </Pressable>

        {title || subtitle ? (
          <View
            className="absolute left-0 right-0 items-center"
            style={{ bottom: insets.bottom + 24 }}
            pointerEvents="none"
          >
            {title ? (
              <Text className="text-white text-base font-medium">{title}</Text>
            ) : null}
            {subtitle ? (
              <Text className="text-white/70 text-sm mt-0.5">{subtitle}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

export default ProgressPhotoViewer;
