import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import SafeImage from './SafeImage';
import { useCheckInPhotoSource } from '../hooks/useCheckInPhotoSource';
import {
  PHOTO_TYPES,
  type CheckInPhoto,
  type PhotoType,
} from '../types/checkInPhotos';

interface PhotoDaySlotsProps {
  photos: Map<PhotoType, CheckInPhoto>;
  /** Angle currently uploading, so only its slot shows a spinner. */
  uploadingType?: PhotoType;
  /** Empty slot tapped: offer camera or library. */
  onPick: (type: PhotoType) => void;
  /** Stored photo tapped: open it full screen. */
  onView: (photo: CheckInPhoto) => void;
  /** Overflow button tapped: offer replace or remove. */
  onManage: (type: PhotoType) => void;
}

/**
 * One day's three angles side by side, so what the day is missing reads at a
 * glance.
 *
 * Viewing and managing are separate targets on purpose: the photo opens the
 * viewer, the corner button opens the actions. A long-press would hide the
 * only way to replace a photo behind a gesture nobody discovers.
 */
const PhotoDaySlots: React.FC<PhotoDaySlotsProps> = ({
  photos,
  uploadingType,
  onPick,
  onView,
  onManage,
}) => {
  const { t } = useTranslation();
  const { getPhotoSource } = useCheckInPhotoSource();
  const [accentPrimary, mutedColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  const angleLabel = (type: PhotoType): string => {
    switch (type) {
      case 'front':
        return t('progressPhotos.angle.front', { defaultValue: 'Front' });
      case 'back':
        return t('progressPhotos.angle.back', { defaultValue: 'Back' });
      case 'side':
        return t('progressPhotos.angle.side', { defaultValue: 'Side' });
    }
  };

  return (
    <View className="flex-row gap-2">
      {PHOTO_TYPES.map((type: PhotoType) => {
        const photo = photos.get(type);
        const label = angleLabel(type);
        const isUploading = uploadingType === type;

        return (
          <View key={type} className="flex-1">
            <Text className="text-text-secondary text-xs mb-1 text-center">
              {label}
            </Text>

            <View
              className="bg-raised rounded-xl overflow-hidden"
              style={{ aspectRatio: 3 / 4 }}
            >
              {photo ? (
                <TouchableOpacity
                  onPress={() => onView(photo)}
                  activeOpacity={0.7}
                  className="flex-1"
                  accessibilityRole="button"
                  accessibilityLabel={t('progressPhotos.viewAngleA11y', {
                    defaultValue: 'View the {{angle}} photo full screen',
                    angle: label.toLowerCase(),
                  })}
                >
                  <SafeImage
                    source={getPhotoSource(photo.id)}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                    fallback={
                      <View className="flex-1 items-center justify-center">
                        <Icon name="camera" size={18} color={mutedColor} />
                      </View>
                    }
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => onPick(type)}
                  activeOpacity={0.7}
                  disabled={isUploading}
                  className="flex-1 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('progressPhotos.addAngleA11y', {
                    defaultValue: 'Add the {{angle}} photo',
                    angle: label.toLowerCase(),
                  })}
                >
                  <Icon name="add" size={26} color={accentPrimary} />
                </TouchableOpacity>
              )}

              {isUploading && (
                <View className="absolute inset-0 items-center justify-center bg-black/40">
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}

              {photo && !isUploading && (
                <TouchableOpacity
                  onPress={() => onManage(type)}
                  hitSlop={8}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full items-center justify-center bg-black/50"
                  accessibilityRole="button"
                  accessibilityLabel={t('progressPhotos.manageAngleA11y', {
                    defaultValue: 'Replace or remove the {{angle}} photo',
                    angle: label.toLowerCase(),
                  })}
                >
                  <Icon name="ellipsis-horizontal" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

export default PhotoDaySlots;
