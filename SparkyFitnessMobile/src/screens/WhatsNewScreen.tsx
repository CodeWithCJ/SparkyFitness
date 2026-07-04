import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import Icon, { type IconName } from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { getTodayDate } from '../utils/dateUtils';
import { canUseLiquidGlass } from '../utils/liquidGlass';
import type { RootStackScreenProps } from '../types/navigation';

type WhatsNewScreenProps = RootStackScreenProps<'WhatsNew'>;

type Feature = {
  eyebrow: string;
  headline: string;
  body: string;
  hero: React.ReactNode;
  cta?: { label: string; onPress: () => void };
};

const WidgetMockup: React.FC = () => {
  const [
    calorieColor,
    catViolet,
    macroProtein,
    macroCarbs,
    macroFat,
    hydration,
    exercise,
    catPink,
    catOrange,
  ] = useCSSVariable([
    '--color-calories',
    '--color-cat-violet',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-hydration',
    '--color-exercise',
    '--color-cat-pink',
    '--color-cat-orange',
  ]) as [string, string, string, string, string, string, string, string, string];

  const iconPositions: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    color: string;
  }[] = [
    { top: 14, left: 24, color: macroProtein },
    { top: 14, left: 68, color: macroCarbs },
    { top: 14, right: 68, color: macroFat },
    { top: 14, right: 24, color: hydration },
    { top: 75, left: 18, color: exercise },
    { top: 75, right: 18, color: catPink },
    { bottom: 14, left: 24, color: catOrange },
    { bottom: 14, left: 68, color: hydration },
    { bottom: 14, right: 68, color: macroProtein },
    { bottom: 14, right: 24, color: macroCarbs },
  ];

  return (
    <View
      className="h-44 items-center justify-center overflow-hidden"
      style={{ backgroundColor: `${catViolet}20` }}
    >
      {iconPositions.map((pos, i) => (
        <View
          key={i}
          className="absolute rounded-md"
          style={{
            width: 22,
            height: 22,
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            right: pos.right,
            backgroundColor: pos.color,
            opacity: 0.5,
          }}
        />
      ))}

      <View
        className="bg-surface rounded-2xl shadow-md justify-center px-4"
        style={{ width: 132, height: 108 }}
      >
        <Text className="text-[10px] font-semibold tracking-wider text-text-secondary mb-0.5">
          TODAY
        </Text>
        <Text className="text-2xl font-bold text-text-primary" style={{ color: calorieColor }}>
          1,515
        </Text>
        <Text className="text-[11px] text-text-secondary mb-2">kcal left</Text>
        <View className="flex-row">
          <View className="flex-1">
            <Text className="text-[9px] text-text-secondary">In</Text>
            <Text className="text-[11px] font-medium text-text-primary">1,540</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[9px] text-text-secondary">Out</Text>
            <Text className="text-[11px] font-medium text-text-primary">255</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const ChatMockup: React.FC = () => {
  const [catViolet, accentPrimary, accentText] = useCSSVariable([
    '--color-cat-violet',
    '--color-accent-primary',
    '--color-accent-text',
  ]) as [string, string, string];

  return (
    <View
      className="h-44 justify-center px-6"
      style={{ backgroundColor: `${catViolet}20` }}
    >
      <View className="self-end bg-surface rounded-2xl rounded-tr-md shadow-sm px-3.5 py-2.5 mb-3 max-w-[75%]">
        <Text className="text-[13px] text-text-primary">
          What can I have for dinner with 500 calories left?
        </Text>
      </View>

      <View className="flex-row items-end self-start max-w-[82%]">
        <View
          className="rounded-full items-center justify-center mr-2 shadow-sm"
          style={{ width: 28, height: 28, backgroundColor: accentPrimary }}
        >
          <Icon name="sparkles" size={14} color={accentText} weight="semibold" />
        </View>
        <View
          className="rounded-2xl rounded-bl-md shadow-sm px-3.5 py-2.5"
          style={{ backgroundColor: accentPrimary }}
        >
          <Text className="text-[13px]" style={{ color: accentText }}>
            Grilled salmon with a side salad keeps you right around 480 kcal.
          </Text>
        </View>
      </View>
    </View>
  );
};

const LiquidGlassMockup: React.FC = () => {
  const [textPrimary, accentPrimary] = useCSSVariable([
    '--color-text-primary',
    '--color-accent-primary',
  ]) as [string, string];

  const tabs: { name: IconName; label: string; active?: boolean }[] = [
    { name: 'tab-dashboard', label: 'Dashboard' },
    { name: 'document-text', label: 'Diary' },
    { name: 'book', label: 'Library' },
    { name: 'settings', label: 'Settings' },
  ];

  const glassStyle = {
    backgroundColor: `${textPrimary}1F`,
    borderWidth: 1,
    borderColor: `${textPrimary}1F`,
  };

  return (
    <View
      className="h-44 justify-end overflow-hidden"
      style={{
        experimental_backgroundImage: `linear-gradient(0deg, #FFFFFF, ${accentPrimary}20)`,
      }}
    >
      <View className="flex-row items-center mx-4 mb-6">
        <View
          className="flex-1 flex-row items-center justify-around py-2 rounded-3xl"
          style={glassStyle}
        >
          {tabs.map((tab) => (
            <View
              key={tab.label}
              className="items-center px-2 py-1 rounded-2xl"
              style={tab.active ? { backgroundColor: `${textPrimary}26` } : undefined}
            >
              <Icon
                name={tab.name}
                size={20}
                color={tab.active ? accentPrimary : "#000000" }
                weight={tab.active ? 'semibold' : 'regular'}
              />
              <Text
                className="text-[9px] mt-0.5"
                style={{ color: tab.active ? accentPrimary : "#000000" }}
              >
                {tab.label}
              </Text>
            </View>
          ))}
        </View>

        <View
          className="ml-2 rounded-full items-center justify-center"
          style={{ width: 52, height: 52, ...glassStyle }}
        >
          <Icon name="add" size={24} color="#000000" />
        </View>
      </View>
    </View>
  );
};

const PhotoMockup: React.FC = () => {
  const [catOrange, macroProtein, macroCarbs, macroFat, textPrimary] = useCSSVariable([
    '--color-cat-orange',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-text-primary',
  ]) as [string, string, string, string, string];

  return (
    <View
      className="h-44 items-center justify-center"
      style={{ backgroundColor: `${catOrange}20` }}
    >
      <View
        className="bg-surface rounded-2xl shadow-md overflow-hidden"
        style={{ width: 200, height: 132, transform: [{ rotate: '-3deg' }] }}
      >
        <View
          className="absolute"
          style={{
            left: 60,
            top: 22,
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: `${textPrimary}12`,
          }}
        />
        <View
          className="absolute"
          style={{
            left: 70,
            top: 32,
            width: 42,
            height: 36,
            borderRadius: 18,
            backgroundColor: macroProtein,
          }}
        />
        <View
          className="absolute"
          style={{
            left: 96,
            top: 56,
            width: 46,
            height: 36,
            borderRadius: 18,
            backgroundColor: macroCarbs,
          }}
        />
        <View
          className="absolute"
          style={{
            left: 62,
            top: 68,
            width: 32,
            height: 30,
            borderRadius: 15,
            backgroundColor: macroFat,
          }}
        />
        <View
          className="absolute rounded-full items-center justify-center"
          style={{
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            backgroundColor: catOrange,
          }}
        >
          <Icon name="whats-new" size={12} color="#FFFFFF" weight="semibold" />
        </View>
      </View>

      <View
        className="bg-surface rounded-full px-3 py-1.5 shadow-md flex-row items-center"
        style={{
          position: 'absolute',
          bottom: 22,
          right: 28,
          transform: [{ rotate: '2deg' }],
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: catOrange,
            marginRight: 6,
          }}
        />
        <Text className="text-xs font-semibold text-text-primary">~412 kcal</Text>
      </View>
    </View>
  );
};

const WhatsNewScreen: React.FC<WhatsNewScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  // The Liquid Glass toggle only exists on iOS 26+ devices with the glass APIs,
  // so its card is gated on the same capability check the setting uses.
  const showLiquidGlassCard = canUseLiquidGlass();

  // Added or changed a card below? Bump WHATS_NEW_CONTENT_VERSION in
  // services/whatsNewBanner.ts so the banner re-appears for existing users.
  const features: Feature[] = [
    {
      eyebrow: 'ASK SPARKY',
      headline: 'Chat with your AI coach',
      body: 'Ask Sparky to log meals, plan what to eat, and answer questions about your day through chat.',
      hero: <ChatMockup />,
      cta: {
        label: 'Start chatting',
        onPress: () => navigation.navigate('Chat'),
      },
    },
    ...(showLiquidGlassCard
      ? [
          {
            eyebrow: 'IOS 26',
            headline: 'A Liquid Glass look',
            body: 'Turn on Liquid Glass navigation for translucent tabs and headers that pick up the color behind them. Toggle it anytime in App settings.',
            hero: <LiquidGlassMockup />,
            cta: {
              label: 'Open settings',
              onPress: () => navigation.navigate('AppSettings'),
            },
          } satisfies Feature,
        ]
      : []),
    {
      eyebrow: 'HOME SCREEN WIDGET',
      headline: 'Calories on your home screen',
      body: "See where your day stands at a glance. Add SparkyFitness from your home screen's widget gallery.",
      hero: <WidgetMockup />,
    },
    {
      eyebrow: 'AI PHOTO SCAN',
      headline: 'Snap a meal, log the macros',
      body: "Estimate nutrition from a photo when you're short on time.",
      hero: <PhotoMockup />,
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

  const header = useScreenHeader({ title: "What's New", left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {features.map((feature) => (
          <View
            key={feature.headline}
            className="bg-surface rounded-xl mb-4 shadow-sm overflow-hidden"
          >
            {feature.hero}

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
                <Pressable
                  onPress={feature.cta.onPress}
                  className="flex-row items-center self-start"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text className="text-sm font-semibold text-accent-primary">
                    {feature.cta.label}
                  </Text>
                  <Icon
                    name="chevron-forward"
                    size={14}
                    color={accentColor}
                    weight="semibold"
                    style={{ marginLeft: 4 }}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default WhatsNewScreen;
