import React from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon, { IconName } from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';
import { markFoodPhotoIntroSeen } from '../services/foodPhotoIntro';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { mobileT } from '../localization';

type Props = RootStackScreenProps<'FoodPhotoIntro'>;

const Bullet: React.FC<{
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  title: string;
  children: React.ReactNode;
}> = ({ icon, iconColor, iconBackground, title, children }) => (
  <View className="flex-row items-start gap-3 mb-4">
    <View
      className="w-10 h-10 rounded-lg items-center justify-center"
      style={{ backgroundColor: iconBackground }}
    >
      <Icon name={icon} size={22} color={iconColor} weight="semibold" />
    </View>
    <View className="flex-1 pt-0.5">
      <Text className="text-text-primary text-base font-semibold leading-6">
        {title}
      </Text>
      <Text className="text-text-secondary text-base leading-6 mt-1">
        {children}
      </Text>
    </View>
  </View>
);

const FoodPhotoIntroScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textPrimary, accentPrimary, catViolet, catOrange] = useCSSVariable([
    '--color-text-primary',
    '--color-accent-primary',
    '--color-cat-violet',
    '--color-cat-orange',
  ]) as [string, string, string, string];
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
    <View className="flex-1 bg-background" style={Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }}>
      {!usesNativeHeader && (
      <View className="flex-row items-center px-4 py-2">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-2"
          accessibilityLabel={mobileT('common.back')}
          accessibilityRole="button"
        >
          <Icon name="chevron-back" size={22} color={textPrimary} />
        </TouchableOpacity>
      </View>
      )}

      <View className="flex-1 px-6">
        <Text className="text-text-primary text-2xl font-semibold">
          {mobileT('foodPhoto.introTitle')}
        </Text>
        <Text className="text-text-secondary text-base mt-2 mb-6">
          {mobileT('foodPhoto.introDescription')}
        </Text>

        <Bullet
          icon="scale"
          iconColor={accentPrimary}
          iconBackground={`${accentPrimary}1F`}
          title={mobileT('foodPhoto.weightTitle')}
        >
          {mobileT('foodPhoto.weightDescription')}
        </Bullet>
        <Bullet
          icon="document-text"
          iconColor={catViolet}
          iconBackground={`${catViolet}1F`}
          title={mobileT('foodPhoto.descriptionTitle')}
        >
          {mobileT('foodPhoto.descriptionDescription')}
        </Bullet>
        <Bullet
          icon="pencil"
          iconColor={catOrange}
          iconBackground={`${catOrange}1F`}
          title={mobileT('foodPhoto.reviewTitle')}
        >
          {mobileT('foodPhoto.reviewDescription')}
        </Bullet>

      </View>

      <View
        className="px-6 gap-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Button variant="primary" onPress={handleContinue}>
          {mobileT('common.continue')}
        </Button>
        <Button variant="ghost" onPress={handleLogManually}>
          {mobileT('foodPhoto.logManually')}
        </Button>
      </View>
    </View>
  );
};

export default FoodPhotoIntroScreen;
