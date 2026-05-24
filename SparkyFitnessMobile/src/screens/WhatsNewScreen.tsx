import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Button from '../components/ui/Button';
import Icon, { type IconName } from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { getTodayDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type WhatsNewScreenProps = RootStackScreenProps<'WhatsNew'>;

type Feature = {
  icon: IconName;
  tint: string;
  eyebrow: string;
  headline: string;
  body: string;
  cta?: { label: string; onPress: () => void };
};

const WhatsNewScreen: React.FC<WhatsNewScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');

  const [accentPrimary, catViolet, catOrange] = useCSSVariable([
    '--color-accent-primary',
    '--color-cat-violet',
    '--color-cat-orange',
  ]) as [string, string, string];

  const features: Feature[] = [
    {
      icon: 'app-settings',
      tint: catViolet,
      eyebrow: 'HOME SCREEN WIDGET',
      headline: 'Calories on your home screen',
      body: "See where your day stands at a glance. Add SparkyFitness from your home screen's widget gallery.",
    },
    {
      icon: 'camera-reverse',
      tint: catOrange,
      eyebrow: 'AI PHOTO SCAN',
      headline: 'Snap a meal, log the macros',
      body: "Estimate nutrition from a photo when you're short on time.",
      cta: {
        label: 'Try it out',
        onPress: () =>
          navigation.navigate('FoodScan', {
            date: getTodayDate(),
            initialMode: 'photo',
          }),
      },
    },
  ];

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <View className="flex-row items-center mb-4">
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 mr-2"
          >
            <Icon name="chevron-back" size={22} color={accentPrimary} />
          </Button>
          <Text className="text-2xl font-bold text-text-primary">What's New</Text>
        </View>

        {features.map((feature) => (
          <View
            key={feature.headline}
            className="bg-surface rounded-xl mb-4 shadow-sm overflow-hidden"
          >
            <View
              className="h-32 items-center justify-center"
              style={{ backgroundColor: `${feature.tint}20` }}
            >
              <Icon name={feature.icon} size={56} color={feature.tint} weight="semibold" />
            </View>

            <View className="p-4">
              <Text className="text-xs font-semibold tracking-wider text-accent-primary mb-1">
                {feature.eyebrow}
              </Text>
              <Text className="text-lg font-bold text-text-primary mb-1">
                {feature.headline}
              </Text>
              <Text className="text-text-secondary text-sm leading-5 mb-4">
                {feature.body}
              </Text>

              {feature.cta ? (
                <Button variant="primary" onPress={feature.cta.onPress} className="self-start">
                  {feature.cta.label}
                </Button>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default WhatsNewScreen;
