import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useWorkoutRoute } from '../hooks/useCardioSessionDetail';
import { getAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { shareActivityImage } from '../services/activityShareImage';
import { useTemperatureUnit } from '../hooks/useTemperatureUnit';
import { pickImageFromCamera, pickImagesFromLibrary } from '../utils/pickImage';
import { sessionStats } from '../utils/cardioSessionStats';
import {
  DEFAULT_SHARE_COLOR,
  SHARE_COLOR_PRESETS,
  normalizeHexColor,
} from '../utils/shareColor';
import Button from '../components/ui/Button';
import ActivityShareCard, {
  SHARE_CARD_ASPECT,
  type ActivityShareTemplate,
} from '../components/activityShare/ActivityShareCard';
import type { RootStackScreenProps } from '../types/navigation';
import { useEnergyUnit } from '../hooks/useEnergyUnit';

type ActivityShareScreenProps = RootStackScreenProps<'ActivityShare'>;

const MAX_PREVIEW_WIDTH = 360;

interface OptionRowProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: OptionRowProps<T>) {
  return (
    <View className="mb-4">
      <Text className="text-text-secondary text-xs mb-2">{label}</Text>
      <View className="flex-row">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className={`px-4 py-2 rounded-full mr-2 ${
                selected ? 'bg-accent-primary' : 'bg-raised'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  selected ? 'text-white' : 'text-text-primary'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const ActivityShareScreen: React.FC<ActivityShareScreenProps> = ({ route }) => {
  const { session, distanceUnit } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const cardRef = useRef<React.ComponentRef<typeof View>>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [template, setTemplate] = useState<ActivityShareTemplate>('classic');
  const [color, setColor] = useState<string>(DEFAULT_SHARE_COLOR);
  const [hexText, setHexText] = useState<string>(DEFAULT_SHARE_COLOR);
  const [sharing, setSharing] = useState(false);

  const header = useScreenHeader({
    title: t('activityShare.title', { defaultValue: 'Share Activity' }),
    nativeTitle: t('activityShare.title', { defaultValue: 'Share Activity' }),
    left: { kind: 'back' },
  });

  const routeQuery = useWorkoutRoute(session.id);
  const points = routeQuery.data?.points ?? [];
  const temperatureUnit = useTemperatureUnit();
  const energyUnit = useEnergyUnit();
  const stats = sessionStats(
    t,
    session,
    distanceUnit,
    temperatureUnit,
    energyUnit
  );

  const [year, month, day] = session.entryDate
    .slice(0, 10)
    .split('-')
    .map(Number);
  const dateText = new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1
  ).toLocaleDateString(getAppLocale(), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const previewWidth = Math.min(screenWidth - 32, MAX_PREVIEW_WIDTH);

  const choosePhoto = async () => {
    const [picked] = await pickImagesFromLibrary(1);
    if (picked) setPhotoUri(picked.uri);
  };
  const takePhoto = async () => {
    const result = await pickImageFromCamera();
    if (result.status === 'ok') {
      setPhotoUri(result.image.uri);
    } else if (result.status === 'denied') {
      Toast.show({
        type: 'error',
        text1: t('activityShare.cameraDenied', {
          defaultValue: 'Allow camera access in Settings to take a photo',
        }),
      });
    }
  };
  const share = async () => {
    setSharing(true);
    try {
      await shareActivityImage({ cardRef, name: session.exerciseName });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('activityShare.shareFailed', {
          defaultValue: 'Could not create the image',
        }),
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* The dark backing is only a preview aid: the captured card is the
            inner view, so a card with no photo exports as a transparent PNG. */}
        <View
          className="self-center rounded-xl overflow-hidden mb-4"
          style={{
            width: previewWidth,
            height: previewWidth / SHARE_CARD_ASPECT,
            backgroundColor: '#3a3a3c',
          }}
        >
          <ActivityShareCard
            ref={cardRef}
            width={previewWidth}
            photoUri={photoUri}
            template={template}
            color={color}
            title={session.exerciseName}
            dateText={dateText}
            stats={stats}
            route={points}
          />
        </View>

        {routeQuery.isSuccess && points.length < 2 && template !== 'minimal' ? (
          <Text className="text-text-secondary text-xs mb-4">
            {t('activityShare.noRoute', {
              defaultValue:
                'This workout has no stored GPS route, so the layout shows stats only.',
            })}
          </Text>
        ) : null}

        <View className="flex-row mb-4">
          <Button
            variant="secondary"
            className="flex-1 mr-2 py-3 items-center"
            testID="share-choose-photo"
            onPress={() => void choosePhoto()}
          >
            {t('activityShare.choosePhoto', { defaultValue: 'Choose photo' })}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 mr-2 py-3 items-center"
            testID="share-take-photo"
            onPress={() => void takePhoto()}
          >
            {t('activityShare.takePhoto', { defaultValue: 'Take photo' })}
          </Button>
          {photoUri ? (
            <Button
              variant="ghost"
              className="py-3 px-2"
              testID="share-remove-photo"
              onPress={() => setPhotoUri(null)}
            >
              {t('activityShare.removePhoto', { defaultValue: 'Remove' })}
            </Button>
          ) : null}
        </View>
        {photoUri ? null : (
          <Text className="text-text-secondary text-xs mb-4">
            {t('activityShare.transparentHint', {
              defaultValue:
                'With no photo the image is a transparent PNG you can lay over a photo or video in another app.',
            })}
          </Text>
        )}

        <OptionRow
          label={t('activityShare.layout', { defaultValue: 'Layout' })}
          value={template}
          onChange={setTemplate}
          options={[
            {
              value: 'classic',
              label: t('activityShare.layoutClassic', {
                defaultValue: 'Classic',
              }),
            },
            {
              value: 'route',
              label: t('activityShare.layoutRoute', { defaultValue: 'Route' }),
            },
            {
              value: 'minimal',
              label: t('activityShare.layoutMinimal', {
                defaultValue: 'Minimal',
              }),
            },
          ]}
        />
        <View className="mb-4">
          <Text className="text-text-secondary text-xs mb-2">
            {t('activityShare.textColor', { defaultValue: 'Color' })}
          </Text>
          <View className="flex-row flex-wrap items-center">
            {SHARE_COLOR_PRESETS.map((preset) => {
              const selected = preset === color;
              return (
                <Pressable
                  key={preset}
                  testID={`share-color-${preset}`}
                  accessibilityRole="button"
                  accessibilityLabel={preset}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setColor(preset);
                    setHexText(preset);
                  }}
                  className="mr-3 mb-3 rounded-full items-center justify-center"
                  style={{
                    width: 36,
                    height: 36,
                    borderWidth: 3,
                    borderColor: selected ? '#0A84FF' : 'transparent',
                  }}
                >
                  <View
                    className="rounded-full"
                    style={{
                      width: 26,
                      height: 26,
                      backgroundColor: preset,
                      borderWidth: 1,
                      borderColor: 'rgba(128,128,128,0.5)',
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
          <TextInput
            testID="share-color-hex"
            value={hexText}
            onChangeText={(text) => {
              setHexText(text);
              const normalized = normalizeHexColor(text);
              if (normalized) setColor(normalized);
            }}
            onEndEditing={() => setHexText(color)}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            accessibilityLabel={t('activityShare.customColor', {
              defaultValue: 'Custom color hex code',
            })}
            placeholder={DEFAULT_SHARE_COLOR}
            className="bg-raised text-text-primary rounded-xl px-4 py-3 text-base"
          />
        </View>

        <Button
          variant="primary"
          className="py-3.5 items-center"
          testID="share-activity-image"
          loading={sharing}
          onPress={() => void share()}
        >
          {t('activityShare.share', { defaultValue: 'Share image' })}
        </Button>
      </ScrollView>
    </View>
  );
};

export default ActivityShareScreen;
