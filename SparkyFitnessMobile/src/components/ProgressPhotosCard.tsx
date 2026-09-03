import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import SafeImage from './SafeImage';
import i18n from '../localization/i18n';
import { useCheckInPhotoGallery } from '../hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../hooks/useCheckInPhotoSource';
import { usePreferences } from '../hooks/usePreferences';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { formatDateLabel } from '../utils/dateUtils';
import {
  formatWeightDisplay,
  type WeightDisplayMode,
} from '../utils/unitConversions';
import { PHOTO_TYPES, type PhotoType } from '../types/checkInPhotos';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type ProgressPhotosCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface ProgressPhotosCardProps {
  navigation: ProgressPhotosCardNavigation;
}

/**
 * Dashboard entry point into the progress gallery: the most recent shoot, with
 * the date and the weight logged that day.
 *
 * The gallery query is gated on the card's visibility preference, so a hidden
 * card costs no request at app open. Unlike the medications and cycle cards
 * this one stays and prompts when empty rather than returning null - nothing
 * else on the Dashboard advertises the feature.
 */
const ProgressPhotosCard: React.FC<ProgressPhotosCardProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const dateLocale = i18n.language;
  const [accentPrimary, mutedColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];

  const visible = useAppPreferencesStore((s) => s.progressPhotosCardVisible);
  const { days, isLoading } = useCheckInPhotoGallery(visible);
  const { getPhotoSource } = useCheckInPhotoSource();
  const { preferences } = usePreferences();
  const weightMode: WeightDisplayMode =
    preferences?.default_weight_unit ?? 'kg';

  // The gallery is newest-first, so the first day that carries any angle is the
  // latest shoot. Angle preference follows PHOTO_TYPES so the thumbnail is
  // stable rather than depending on the server's alphabetical photo_type order.
  const latest = useMemo(() => {
    const day = days[0];
    if (!day) return null;
    const angle = PHOTO_TYPES.find((type: PhotoType) => day.photos[type]);
    if (!angle) return null;
    return { day, photoId: day.photos[angle]!.id };
  }, [days]);

  if (!visible || isLoading) return null;

  // No photos yet: prompt straight into capture for today rather than the
  // gallery, which would only show its own empty state.
  if (!latest) {
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('ProgressPhotos', {})}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('progressPhotos.card.addA11y', {
          defaultValue: 'Add your first progress photos',
        })}
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      >
        <Text className="text-md font-bold text-text-primary mb-4">
          {t('progressPhotos.card.title', { defaultValue: 'Progress' })}
        </Text>
        <Text className="text-text-muted text-sm text-center mb-4">
          {t('progressPhotos.card.empty', {
            defaultValue: 'Tap to add check-in photos',
          })}
        </Text>
      </TouchableOpacity>
    );
  }

  const source = getPhotoSource(latest.photoId);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('ProgressPhotos')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('progressPhotos.card.openA11y', {
        defaultValue: 'View progress photos',
      })}
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-bold text-text-secondary">
          {t('progressPhotos.card.title', { defaultValue: 'Progress' })}
        </Text>
        <View className="flex-row items-center">
          <Text className="text-accent-primary font-medium">
            {t('progressPhotos.card.viewAll', { defaultValue: 'View all' })}
          </Text>
          <Icon
            name="chevron-forward"
            size={14}
            color={accentPrimary}
            style={{ marginLeft: 2 }}
          />
        </View>
      </View>

      <View className="flex-row items-center">
        <SafeImage
          source={source}
          style={{ width: 56, height: 74, borderRadius: 10 }}
          contentFit="cover"
          fallback={
            <View className="flex-1 items-center justify-center bg-raised">
              <Icon name="camera" size={18} color={mutedColor} />
            </View>
          }
        />
        <View className="flex-1 ml-3">
          <Text className="text-text-primary text-base font-semibold">
            {formatDateLabel(latest.day.entry_date, t, dateLocale)}
          </Text>
          {latest.day.weight != null ? (
            <Text className="text-text-secondary text-sm mt-0.5">
              {formatWeightDisplay(latest.day.weight, weightMode)}
            </Text>
          ) : (
            <Text className="text-text-muted text-sm mt-0.5 italic">
              {t('progressPhotos.noWeight', {
                defaultValue: 'No weight logged',
              })}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default ProgressPhotosCard;
