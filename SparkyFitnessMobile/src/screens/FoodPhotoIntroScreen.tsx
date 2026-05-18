import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';
import { markFoodPhotoIntroSeen } from '../services/foodPhotoIntro';

type Props = RootStackScreenProps<'FoodPhotoIntro'>;

const Bullet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="flex-row items-start gap-3 mb-3">
    <View className="w-1.5 h-1.5 rounded-full bg-accent-primary mt-2.5" />
    <Text className="flex-1 text-text-primary text-base leading-6">{children}</Text>
  </View>
);

const FoodPhotoIntroScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const date = route.params?.date;

  const handleContinue = async () => {
    await markFoodPhotoIntroSeen();
    navigation.goBack();
  };

  const handleLogManually = async () => {
    await markFoodPhotoIntroSeen();
    navigation.replace('FoodSearch', { date });
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-2">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-2"
        >
          <Icon name="chevron-back" size={22} color={textPrimary} />
        </TouchableOpacity>
      </View>

      <View className="flex-1 px-6">
        <Text className="text-text-primary text-2xl font-semibold mt-4">
          Estimate nutrition from a photo
        </Text>
        <Text className="text-text-secondary text-base mt-2 mb-6">
          Snap a quick photo of what you&apos;re about to eat and we&apos;ll suggest the
          nutrition. You stay in control — review and edit before saving.
        </Text>

        <Bullet>
          For best results, include the whole dish and a reference object
          (utensil, hand) for scale.
        </Bullet>
        <Bullet>
          Add the total weight on the next step if you know it — estimates get
          much more accurate.
        </Bullet>
        <Bullet>
          You&apos;ll always see the breakdown and confidence level before anything
          is saved to your diary.
        </Bullet>
      </View>

      <View
        className="px-6 gap-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Button variant="primary" onPress={handleContinue}>
          Continue
        </Button>
        <Button variant="ghost" onPress={handleLogManually}>
          Log manually instead
        </Button>
      </View>
    </View>
  );
};

export default FoodPhotoIntroScreen;
