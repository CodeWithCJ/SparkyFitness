import React from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { createIOSNativeHeaderOptions } from '../utils/nativeHeaderItems';
import DashboardScreen from '../screens/DashboardScreen';
import DiaryScreen from '../screens/DiaryScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { TabParamList } from '../types/navigation';
import type { AppleIcon } from 'react-native-bottom-tabs';
import { withErrorBoundary } from './ScreenErrorBoundary';
import ActiveWorkoutBar from './ActiveWorkoutBar';
import CustomTabBar from './CustomTabBar';
import WhatsNewBanner, {
  WhatsNewBannerContent,
  useWhatsNewBannerState,
} from './WhatsNewBanner';
import { shouldUseNativeIOSTabs } from '../utils/nativeTabs';

export const NON_ADD_TABS = ['Dashboard', 'Diary', 'Library', 'Settings'] as const;
export type NonAddTabName = typeof NON_ADD_TABS[number];
const ADD_TAB_ICON: AppleIcon = { sfSymbol: 'plus' };

type TabTrackingProps = {
  rememberActiveTab: (routeName: string) => void;
  getLastActiveTab: () => NonAddTabName;
};

function resolveColor(value: string, fallback: string) {
  return value && value !== 'unset' ? value : fallback;
}

const AddRedirectScreen = ({ getLastActiveTab }: { getLastActiveTab: () => NonAddTabName }) => {
  const navigation = useNavigation();

  useFocusEffect(
    React.useCallback(() => {
      const frame = requestAnimationFrame(() => {
        navigation.navigate(getLastActiveTab() as never);
      });

      return () => cancelAnimationFrame(frame);
    }, [getLastActiveTab, navigation]),
  );

  return null;
};

// Tab screens — no Go Back (tab bar provides navigation)
const SafeDashboard = withErrorBoundary(DashboardScreen, 'Dashboard');
const SafeDiary = withErrorBoundary(DiaryScreen, 'Diary');
const SafeLibrary = withErrorBoundary(LibraryScreen, 'Library');
const SafeSettings = withErrorBoundary(SettingsScreen, 'Settings');

// Native iOS Tab Navigator (iOS 26+ Liquid Glass)
const NativeTab = createNativeBottomTabNavigator<TabParamList>();

// Fallback Tab Navigator (Android / iOS < 26)
const FallbackTab = createBottomTabNavigator<TabParamList>();

type DashboardStackParamList = {
  DashboardRoot: undefined;
};
type DiaryStackParamList = {
  DiaryRoot: { selectedDate?: string } | undefined;
};
type LibraryStackParamList = { LibraryRoot: undefined };
type SettingsStackParamList = { SettingsRoot: undefined };

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const DiaryStack = createNativeStackNavigator<DiaryStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function useIOSHeaderColors() {
  const [accentPrimary, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];
  return {
    action: resolveColor(accentPrimary, '#0A84FF'),
    title: resolveColor(textPrimary, '#111827'),
  };
}

const NativeTabsOverlayContext = React.createContext<ReturnType<
  typeof useWhatsNewBannerState
> | null>(null);

/**
 * iOS native tabs don't expose a `tabBar` render prop, so banners are
 * overlaid absolutely just above the native UITabBar. The bottom offset
 * clears the 49pt tab bar + bottom safe-area inset so the banners stack
 * directly on top of the bar rather than underneath it.
 */
function NativeTabsBannerOverlay() {
  const whatsNewState = React.useContext(NativeTabsOverlayContext);
  const insets = useSafeAreaInsets();
  if (!whatsNewState) return null;

  const TAB_BAR_HEIGHT = 49; // standard iOS native tab bar height

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: TAB_BAR_HEIGHT + insets.bottom,
        left: 0,
        right: 0,
        zIndex: 50,
      }}
    >
      <WhatsNewBannerContent
        reserveAddButtonClearance
        state={whatsNewState}
      />
      <ActiveWorkoutBar variant="embedded" />
    </View>
  );
}

function DashboardStackScreen() {
  const headerColors = useIOSHeaderColors();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerColors.action, headerColors.title),
    [headerColors.action, headerColors.title],
  );

  return (
    <DashboardStack.Navigator screenOptions={screenOptions}>
      <DashboardStack.Screen
        name="DashboardRoot"
        component={SafeDashboard as React.ComponentType}
        options={{
          title: 'Dashboard',
          headerBackTitle: 'Dashboard',
        }}
      />
    </DashboardStack.Navigator>
  );
}

function DiaryStackScreen() {
  const headerColors = useIOSHeaderColors();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerColors.action, headerColors.title),
    [headerColors.action, headerColors.title],
  );

  return (
    <DiaryStack.Navigator screenOptions={screenOptions}>
      <DiaryStack.Screen
        name="DiaryRoot"
        component={SafeDiary as React.ComponentType}
        options={{
          title: 'Diary',
          headerBackTitle: 'Diary',
        }}
      />
    </DiaryStack.Navigator>
  );
}

function LibraryStackScreen() {
  const headerColors = useIOSHeaderColors();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerColors.action, headerColors.title),
    [headerColors.action, headerColors.title],
  );

  return (
    <LibraryStack.Navigator screenOptions={screenOptions}>
      <LibraryStack.Screen name="LibraryRoot" component={SafeLibrary as React.ComponentType} options={{ title: 'Library', headerBackTitle: 'Library' }} />
    </LibraryStack.Navigator>
  );
}

function SettingsStackScreen() {
  const headerColors = useIOSHeaderColors();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerColors.action, headerColors.title),
    [headerColors.action, headerColors.title],
  );

  return (
    <SettingsStack.Navigator screenOptions={screenOptions}>
      <SettingsStack.Screen name="SettingsRoot" component={SafeSettings as React.ComponentType} options={{ title: 'Settings', headerBackTitle: 'Settings' }} />
    </SettingsStack.Navigator>
  );
}

export function NativeTabsLayout({
  onAddPress,
  rememberActiveTab,
  getLastActiveTab,
}: { onAddPress?: () => void } & TabTrackingProps) {
  const [primary, tabActive, tabInactive] = useCSSVariable([
    '--color-accent-primary',
    '--color-tab-active',
    '--color-tab-inactive',
  ]) as [string, string, string];
  const activeTintColor = resolveColor(tabActive, resolveColor(primary, '#0A84FF'));
  const inactiveTintColor = resolveColor(tabInactive, '#8E8E93');
  const whatsNewState = useWhatsNewBannerState();

  return (
    <NativeTabsOverlayContext.Provider value={whatsNewState}>
      <View style={{ flex: 1 }}>
        <NativeTab.Navigator
          initialRouteName="Dashboard"
          tabBarActiveTintColor={activeTintColor}
          tabBarInactiveTintColor={inactiveTintColor}
          screenListeners={{
            state: (event) => {
              const state = event.data?.state;
              if (!state?.routes) return;
              const route = state.routes[state.index ?? 0];
              if (route) rememberActiveTab(route.name);
            },
          }}
        >
          <NativeTab.Screen
            name="Dashboard"
            component={DashboardStackScreen}
            options={{
              tabBarLabel: 'Dashboard',
              tabBarIcon: () => ({ sfSymbol: 'house' } as unknown as AppleIcon),
            }}
          />
          <NativeTab.Screen
            name="Diary"
            component={DiaryStackScreen}
            options={{
              tabBarLabel: 'Diary',
              tabBarIcon: () => ({ sfSymbol: 'doc.text' } as unknown as AppleIcon),
            }}
          />
          <NativeTab.Screen
            name="Add"
            options={{
              tabBarLabel: 'Add',
              tabBarIcon: () => ADD_TAB_ICON,
              role: 'search',
              preventsDefault: true,
            }}
            listeners={{
              tabPress: (e) => {
                e.preventDefault();
                onAddPress?.();
              },
            }}
          >
            {() => <AddRedirectScreen getLastActiveTab={getLastActiveTab} />}
          </NativeTab.Screen>
          <NativeTab.Screen
            name="Library"
            component={LibraryStackScreen}
            options={{
              tabBarLabel: 'Library',
              tabBarIcon: () => ({ sfSymbol: 'book' } as unknown as AppleIcon),
            }}
          />
          <NativeTab.Screen
            name="Settings"
            component={SettingsStackScreen}
            options={{
              tabBarLabel: 'Settings',
              tabBarIcon: () => ({ sfSymbol: 'gearshape' } as unknown as AppleIcon),
            }}
          />
        </NativeTab.Navigator>
        <NativeTabsBannerOverlay />
      </View>
    </NativeTabsOverlayContext.Provider>
  );
}

export function FallbackTabsLayout({
  onAddPress,
  rememberActiveTab,
  getLastActiveTab,
}: { onAddPress?: () => void } & TabTrackingProps) {
  // The AddSheet is rendered in App.tsx with proper props
  return (
    <FallbackTab.Navigator
      initialRouteName="Dashboard"
      screenListeners={{
        state: (event) => {
          const state = event.data?.state;
          if (!state?.routes) return;
          const route = state.routes[state.index ?? 0];
          if (route) rememberActiveTab(route.name);
        },
      }}
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <View collapsable={false}>
          <WhatsNewBanner reserveAddButtonClearance />
          <ActiveWorkoutBar variant="embedded" />
          <CustomTabBar {...props} />
        </View>
      )}
    >
      <FallbackTab.Screen name="Dashboard" component={SafeDashboard} />
      <FallbackTab.Screen name="Diary" component={SafeDiary} />
      <FallbackTab.Screen
        name="Add"
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            onAddPress?.();
          },
        }}
      >
        {() => <AddRedirectScreen getLastActiveTab={getLastActiveTab} />}
      </FallbackTab.Screen>
      <FallbackTab.Screen name="Library" component={SafeLibrary} />
      <FallbackTab.Screen name="Settings" component={SettingsScreen} />
    </FallbackTab.Navigator>
  );
}

// Native tabs require the iOS 26 bottom-accessory APIs. Older iOS releases
// intentionally use the same custom tab bar as Android.
export function TabsLayout({
  onAddPress,
  rememberActiveTab,
  getLastActiveTab,
}: { onAddPress?: () => void } & TabTrackingProps) {
  if (shouldUseNativeIOSTabs()) {
    return (
      <NativeTabsLayout
        onAddPress={onAddPress}
        rememberActiveTab={rememberActiveTab}
        getLastActiveTab={getLastActiveTab}
      />
    );
  }
  return (
    <FallbackTabsLayout
      onAddPress={onAddPress}
      rememberActiveTab={rememberActiveTab}
      getLastActiveTab={getLastActiveTab}
    />
  );
}
