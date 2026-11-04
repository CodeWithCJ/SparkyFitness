import { Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { getExerciseVideoInfo } from '@workspace/shared';
import Icon from './Icon';

interface ExerciseVideoCardProps {
  url: string | null | undefined;
  exerciseName: string;
  /** `compact` is a one-line chip for the live workout card. */
  variant?: 'card' | 'compact';
}

/**
 * An exercise's demonstration video. YouTube links show the video's thumbnail
 * with a play button; tapping opens the link (the YouTube app when installed).
 */
export default function ExerciseVideoCard({
  url,
  exerciseName,
  variant = 'card',
}: ExerciseVideoCardProps) {
  const { t } = useTranslation();
  const video = getExerciseVideoInfo(url);
  if (!video) return null;

  const open = () => {
    Linking.openURL(video.url).catch(() => {});
  };
  const label = t('exerciseDetail.watchVideo', {
    defaultValue: 'Watch {{name}} demo',
    name: exerciseName,
  });

  if (variant === 'compact') {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={label}
        hitSlop={8}
        className="flex-row items-center self-start gap-1.5 rounded-full bg-surface px-3 py-1.5 mt-2"
      >
        <Icon name="play" size={12} color="#ef4444" />
        <Text className="text-sm text-text-primary">
          {t('exerciseDetail.demo', { defaultValue: 'Demo' })}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="bg-surface rounded-xl overflow-hidden"
    >
      {video.thumbnailUrl ? (
        <View style={{ aspectRatio: 16 / 9 }} className="w-full bg-black">
          <Image
            source={{ uri: video.thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            accessible={false}
          />
          <View className="absolute inset-0 items-center justify-center">
            <View className="w-14 h-14 rounded-full bg-black/60 items-center justify-center">
              <Icon name="play" size={26} color="#ffffff" />
            </View>
          </View>
        </View>
      ) : null}
      <View className="flex-row items-center gap-2 p-4">
        <Icon name="play" size={14} color="#ef4444" />
        <Text className="text-text-primary text-base flex-1">
          {video.youtubeId
            ? t('exerciseDetail.watchOnYouTube', {
                defaultValue: 'Watch on YouTube',
              })
            : t('exerciseDetail.watchDemo', {
                defaultValue: 'Watch demonstration video',
              })}
        </Text>
      </View>
    </Pressable>
  );
}
