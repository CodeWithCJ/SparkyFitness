import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import SafeImage from './SafeImage';
import ProgressPhotoViewer from './ProgressPhotoViewer';
import i18n from '../localization/i18n';
import { useCheckInPhotosByDate } from '../hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../hooks/useCheckInPhotoSource';
import { formatDateLabel } from '../utils/dateUtils';
import {
  PHOTO_TYPES,
  type CheckInPhoto,
  type PhotoType,
} from '../types/checkInPhotos';

interface CheckInPhotosSummaryProps {
  /** The diary day on show. */
  date: string;
  /** Opens the full progress photo screen on this day. */
  onPress: () => void;
}

const THUMB = { width: 44, height: 58, borderRadius: 8 };

/**
 * The photos taken on the diary's day, next to the measurements from the same
 * check-in - on the server both hang off (user_id, entry_date).
 *
 * Deliberately not a copy of the dashboard card: that one answers "where am I
 * now" with the latest shoot whenever it was, while this answers "what did I
 * record on this date". It carries no weight or delta because the measurements
 * summary directly above already shows them for the same day.
 *
 * Renders nothing on a day with no photos, like MeasurementsSummary: the diary
 * lists what a day holds rather than prompting for what it does not.
 */
const CheckInPhotosSummary: React.FC<CheckInPhotosSummaryProps> = ({
  date,
  onPress,
}) => {
  const { t } = useTranslation();
  const dateLocale = i18n.language;
  const [accentPrimary, mutedColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  const { photos } = useCheckInPhotosByDate(date);
  const { getPhotoSource } = useCheckInPhotoSource();
  const [zoomed, setZoomed] = useState<CheckInPhoto | null>(null);

  const byType = new Map<PhotoType, CheckInPhoto>();
  for (const photo of photos) byType.set(photo.photo_type, photo);

  if (byType.size === 0) return null;

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
    <View className="mb-2">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('progressPhotos.openDayA11y', {
          defaultValue: 'Open the progress photos for this day',
        })}
      >
        <View className="flex-row items-center gap-2 mb-2 px-1">
          <Text className="text-base font-bold text-text-secondary flex-1">
            {t('progressPhotos.diarySection', {
              defaultValue: 'Progress photos',
            })}
          </Text>
          <Text className="text-text-muted text-xs">
            {t('progressPhotos.angleCount', {
              defaultValue: '{{taken}} of {{total}}',
              taken: byType.size,
              total: PHOTO_TYPES.length,
            })}
          </Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} />
        </View>

        <View className="bg-surface rounded-xl py-3 px-3 shadow-sm flex-row gap-2">
          {PHOTO_TYPES.map((type: PhotoType) => {
            const photo = byType.get(type);
            const label = angleLabel(type);

            // A gap is the point of showing all three: it is how the day tells
            // you which angle you skipped.
            if (!photo) {
              return (
                <View
                  key={type}
                  style={THUMB}
                  className="bg-raised items-center justify-center"
                  accessibilityLabel={t('progressPhotos.missingAngleA11y', {
                    defaultValue: 'No {{angle}} photo on this day',
                    angle: label.toLowerCase(),
                  })}
                >
                  <Icon name="camera" size={14} color={mutedColor} />
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={type}
                onPress={() => setZoomed(photo)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('progressPhotos.viewAngleA11y', {
                  defaultValue: 'View the {{angle}} photo full screen',
                  angle: label.toLowerCase(),
                })}
              >
                <SafeImage
                  source={getPhotoSource(photo.id)}
                  style={THUMB}
                  contentFit="cover"
                  fallback={
                    <View
                      style={THUMB}
                      className="bg-raised items-center justify-center"
                    >
                      <Icon name="camera" size={14} color={mutedColor} />
                    </View>
                  }
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </Pressable>

      <ProgressPhotoViewer
        visible={zoomed != null}
        source={zoomed ? getPhotoSource(zoomed.id) : null}
        title={formatDateLabel(date, t, dateLocale)}
        onClose={() => setZoomed(null)}
      />
    </View>
  );
};

export default CheckInPhotosSummary;
