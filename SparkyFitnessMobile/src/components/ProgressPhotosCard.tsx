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
  /** The dashboard's selected day. */
  date: string;
}

/**
 * Dashboard entry point into the progress gallery: the selected day's shoot,
 * with the weight logged that day.
 *
 * Scoped to the day on show rather than the latest shoot whenever it was. Every
 * other card on the Dashboard answers for the selected date, so a card that
 * quietly showed a different day read as today's photo and contradicted the
 * date in the header.
 *
 * The gallery query is gated on the card's visibility preference, so a hidden
 * card costs no request at app open. Unlike the medications and cycle cards
 * this one stays and prompts when the day is empty rather than returning null -
 * nothing else on the Dashboard advertises the feature.
 */
const ProgressPhotosCard: React.FC<ProgressPhotosCardProps> = ({
  navigation,
  date,
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

  // Read off the gallery rather than the per-day endpoint because the card
  // shows that day's weight, which only the gallery carries. Angle preference
  // follows PHOTO_TYPES so the thumbnail is stable rather than depending on the
  // server's alphabetical photo_type order.
  const shoot = useMemo(() => {
    const day = days.find((entry) => entry.entry_date === date);
    if (!day) return null;
    const angle = PHOTO_TYPES.find((type: PhotoType) => day.photos[type]);
    if (!angle) return null;
    return { day, photoId: day.photos[angle]!.id };
  }, [days, date]);

  if (!visible || isLoading) return null;

  // Nothing on this day: prompt into it, phrased like the Food and exercise
  // cards so the whole Dashboard reads the same way on an empty day.
  if (!shoot) {
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('ProgressPhotos', { date })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('progressPhotos.addDayA11y', {
          defaultValue: 'Add progress photos for this day',
        })}
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      >
        <Text className="text-md font-bold text-text-primary mb-4">
          {t('progressPhotos.card.title', { defaultValue: 'Progress' })}
        </Text>
        <Text className="text-text-muted text-sm text-center mb-4">
          {t('progressPhotos.tapToAdd', { defaultValue: 'Tap to add photos' })}
        </Text>
      </TouchableOpacity>
    );
  }

  const source = getPhotoSource(shoot.photoId);

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
            {formatDateLabel(shoot.day.entry_date, t, dateLocale)}
          </Text>
          {shoot.day.weight != null ? (
            <Text className="text-text-secondary text-sm mt-0.5">
              {formatWeightDisplay(shoot.day.weight, weightMode)}
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
