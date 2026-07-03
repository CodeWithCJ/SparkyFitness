import React from 'react';
import { View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { createIOSNativeHeaderOptions } from '../utils/nativeHeaderItems';
import DashboardScreen from '../screens/DashboardScreen';
import DiaryScreen from '../screens/DiaryScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { TabParamList } from '../types/navigation';
import {
  useBottomTabBarHeight,
  type AppleIcon,
} from 'react-native-bottom-tabs';
import { withErrorBoundary } from './ScreenErrorBoundary';
import ActiveWorkoutBar, { setActiveWorkoutBarTabBarHeight } from './ActiveWorkoutBar';
import CustomTabBar from './CustomTabBar';
import WhatsNewBanner, {
  WhatsNewBannerContent,
  useWhatsNewBannerState,
} from './WhatsNewBanner';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';

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

const NativeTabsOverlayContext = React.createContext<ReturnType<
  typeof useWhatsNewBannerState
> | null>(null);

/**
 * iOS native tabs don't expose a `tabBar` render prop, so banners are
 * rendered inside each native tab scene. The library's measured tab-bar
 * height keeps the overlay directly above the native bar on every device.
 */
function NativeTabsBannerOverlay() {
  const whatsNewState = React.useContext(NativeTabsOverlayContext);
  const tabBarHeight = useBottomTabBarHeight();
  React.useEffect(() => {
    setActiveWorkoutBarTabBarHeight(tabBarHeight);
  }, [tabBarHeight]);

  if (!whatsNewState) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: tabBarHeight,
        left: 0,
        right: 0,
        zIndex: 50,
      }}
    >
      <WhatsNewBannerContent presentation="glass" state={whatsNewState} />
    </View>
  );
}

function DashboardStackScreen() {
  const { defaultColor } = useHeaderActionColors();
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(defaultColor, textPrimary),
    [defaultColor, textPrimary],
  );

  return (
    <View className="flex-1">
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
      <NativeTabsBannerOverlay />
    </View>
  );
}

function DiaryStackScreen() {
  const { defaultColor } = useHeaderActionColors();
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(defaultColor, textPrimary),
    [defaultColor, textPrimary],
  );

  return (
    <View className="flex-1">
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
      <NativeTabsBannerOverlay />
    </View>
  );
}

function LibraryStackScreen() {
  const { defaultColor } = useHeaderActionColors();
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(defaultColor, textPrimary),
    [defaultColor, textPrimary],
  );

  return (
    <View className="flex-1">
      <LibraryStack.Navigator screenOptions={screenOptions}>
        <LibraryStack.Screen name="LibraryRoot" component={SafeLibrary as React.ComponentType} options={{ title: 'Library', headerBackTitle: 'Library' }} />
      </LibraryStack.Navigator>
      <NativeTabsBannerOverlay />
    </View>
  );
}

function SettingsStackScreen() {
  const { defaultColor } = useHeaderActionColors();
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(defaultColor, textPrimary),
    [defaultColor, textPrimary],
  );

  return (
    <View className="flex-1">
      <SettingsStack.Navigator screenOptions={screenOptions}>
        <SettingsStack.Screen name="SettingsRoot" component={SafeSettings as React.ComponentType} options={{ title: 'Settings', headerBackTitle: 'Settings' }} />
      </SettingsStack.Navigator>
      <NativeTabsBannerOverlay />
    </View>
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
      <NativeTab.Navigator
          // Start on the last active tab so toggling the Liquid Glass tab bar —
          // which swaps and remounts this navigator — keeps the user on the tab
          // they came from. Defaults to Dashboard on a cold start.
          initialRouteName={getLastActiveTab()}
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
      // Start on the last active tab so toggling the Liquid Glass tab bar —
      // which swaps and remounts this navigator — keeps the user on the tab
      // they came from. Defaults to Dashboard on a cold start.
      initialRouteName={getLastActiveTab()}
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
      <FallbackTab.Screen name="Settings" component={SafeSettings} />
    </FallbackTab.Navigator>
  );
}

// Native Liquid Glass tabs are only used on iOS 26+. Older iOS releases
// intentionally use the same custom tab bar as Android.
export function TabsLayout({
  onAddPress,
  rememberActiveTab,
  getLastActiveTab,
}: { onAddPress?: () => void } & TabTrackingProps) {
  if (useNativeIOSTabsActive()) {
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
