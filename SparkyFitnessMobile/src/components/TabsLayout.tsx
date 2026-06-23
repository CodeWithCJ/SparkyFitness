import React from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useFocusEffect, useNavigation, type NavigationAction } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator, type NativeStackHeaderItem } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { createIOSNativeHeaderOptions } from '../utils/nativeHeaderItems';
import DashboardScreen from '../screens/DashboardScreen';
import DiaryScreen from '../screens/DiaryScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import type { TabParamList } from '../types/navigation';
import type { AppleIcon, TabRole } from 'react-native-bottom-tabs';
import { withErrorBoundary } from './ScreenErrorBoundary';
import ActiveWorkoutBar from './ActiveWorkoutBar';
import CustomTabBar from './CustomTabBar';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import { getNativeHeaderDatePickerHandlers, type NativeHeaderDatePickerKey } from '../utils/nativeHeaderDatePicker';

export const NON_ADD_TABS = ['Dashboard', 'Diary', 'Library', 'Settings'] as const;
export type NonAddTabName = typeof NON_ADD_TABS[number];
const ADD_TAB_ICON: AppleIcon = { sfSymbol: 'plus' };
const IOS_SEARCH_ROLE_MIN_VERSION = 26;

let tabsNavigation: { dispatch: (action: NavigationAction) => void; getState: () => { key?: string } } | null = null;

type TabTrackingProps = {
  rememberActiveTab: (routeName: string) => void;
  getLastActiveTab: () => NonAddTabName;
};

function getIOSMajorVersion() {
  if (Platform.OS !== 'ios') return null;

  const version = Platform.Version;
  if (typeof version === 'number') return Math.trunc(version);

  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : null;
}

function supportsSeparateAddTabButton() {
  const majorVersion = getIOSMajorVersion();
  return majorVersion !== null && majorVersion >= IOS_SEARCH_ROLE_MIN_VERSION;
}

function resolveColor(value: string, fallback: string) {
  return value && value !== 'unset' ? value : fallback;
}

export function navigateToLastActiveTab(targetTab: NonAddTabName) {
  if (!tabsNavigation) return false;

  tabsNavigation.dispatch({
    ...CommonActions.navigate(targetTab),
    target: tabsNavigation.getState().key,
  });
  return true;
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
  DashboardRoot: {
    selectedDate?: string;
    onPreviousDate?: () => void;
    onDatePress?: () => void;
    onNextDate?: () => void;
  } | undefined;
};
type DiaryStackParamList = {
  DiaryRoot: {
    selectedDate?: string;
    onPreviousDate?: () => void;
    onDatePress?: () => void;
    onNextDate?: () => void;
  } | undefined;
};
type LibraryStackParamList = { LibraryRoot: undefined };
type SettingsStackParamList = { SettingsRoot: undefined };

const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const DiaryStack = createNativeStackNavigator<DiaryStackParamList>();
const LibraryStack = createNativeStackNavigator<LibraryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function createDateHeaderItems({
  handlerKey,
  selectedDate,
  onPreviousDate,
  onPress,
  onNextDate,
  tintColor,
  accessibilityLabel,
}: {
  handlerKey: NativeHeaderDatePickerKey;
  selectedDate?: string;
  onPreviousDate?: () => void;
  onPress?: () => void;
  onNextDate?: () => void;
  tintColor: string;
  accessibilityLabel: string;
}): NativeStackHeaderItem[] {
  const latestHandlers = () => getNativeHeaderDatePickerHandlers(handlerKey);
  const displayDate = selectedDate ?? latestHandlers()?.selectedDate ?? getTodayDate();

  return [
    {
      type: 'button',
      // Keep icon actions title-less so iOS doesn't reserve title width and
      // collapse the date picker on longer headers like "Dashboard".
      label: '',
      icon: { type: 'sfSymbol', name: 'chevron.left' },
      onPress: () => (latestHandlers()?.onPreviousDate ?? onPreviousDate)?.(),
      tintColor,
      accessibilityLabel: `${accessibilityLabel}: previous day`,
      identifier: 'date-picker-previous',
      sharesBackground: true,
      disabled: false,
    },
    {
      type: 'button',
      // Keep this label-only: UIBarButtonItem often prioritizes the SF Symbol
      // and hides text when both label and icon are supplied on iOS 26.
      label: `${formatDateLabel(displayDate)} ▾`,
      onPress: () => (latestHandlers()?.onDatePress ?? onPress)?.(),
      tintColor,
      labelStyle: { fontSize: 15, fontWeight: '600', color: tintColor },
      accessibilityLabel,
      identifier: 'date-picker',
      sharesBackground: true,
    },
    {
      type: 'button',
      label: '',
      icon: { type: 'sfSymbol', name: 'chevron.right' },
      onPress: () => (latestHandlers()?.onNextDate ?? onNextDate)?.(),
      tintColor,
      accessibilityLabel: `${accessibilityLabel}: next day`,
      identifier: 'date-picker-next',
      sharesBackground: true,
      disabled: false,
    },
  ];
}

function useIOSHeaderTintColor() {
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  return resolveColor(textPrimary, '#111827');
}

function DashboardStackScreen() {
  const headerTintColor = useIOSHeaderTintColor();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerTintColor),
    [headerTintColor],
  );

  return (
    <DashboardStack.Navigator screenOptions={screenOptions}>
      <DashboardStack.Screen
        name="DashboardRoot"
        component={SafeDashboard as React.ComponentType}
        options={({ route }) => ({
          title: 'Dashboard',
          headerBackTitle: 'Dashboard',
          unstable_headerRightItems: Platform.OS === 'ios'
            ? () => createDateHeaderItems({
                handlerKey: 'Dashboard',
                selectedDate: route.params?.selectedDate,
                onPreviousDate: route.params?.onPreviousDate,
                onPress: route.params?.onDatePress,
                onNextDate: route.params?.onNextDate,
                tintColor: headerTintColor,
                accessibilityLabel: 'Choose dashboard date',
              })
            : undefined,
        })}
      />
    </DashboardStack.Navigator>
  );
}

function DiaryStackScreen() {
  const headerTintColor = useIOSHeaderTintColor();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerTintColor),
    [headerTintColor],
  );

  return (
    <DiaryStack.Navigator screenOptions={screenOptions}>
      <DiaryStack.Screen
        name="DiaryRoot"
        component={SafeDiary as React.ComponentType}
        options={({ route }) => ({
          title: 'Diary',
          headerBackTitle: 'Diary',
          unstable_headerRightItems: Platform.OS === 'ios'
            ? () => createDateHeaderItems({
                handlerKey: 'Diary',
                selectedDate: route.params?.selectedDate,
                onPreviousDate: route.params?.onPreviousDate,
                onPress: route.params?.onDatePress,
                onNextDate: route.params?.onNextDate,
                tintColor: headerTintColor,
                accessibilityLabel: 'Choose diary date',
              })
            : undefined,
        })}
      />
    </DiaryStack.Navigator>
  );
}

function LibraryStackScreen() {
  const headerTintColor = useIOSHeaderTintColor();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerTintColor),
    [headerTintColor],
  );

  return (
    <LibraryStack.Navigator screenOptions={screenOptions}>
      <LibraryStack.Screen name="LibraryRoot" component={SafeLibrary as React.ComponentType} options={{ title: 'Library', headerBackTitle: 'Library' }} />
    </LibraryStack.Navigator>
  );
}

function SettingsStackScreen() {
  const headerTintColor = useIOSHeaderTintColor();
  const screenOptions = React.useMemo(
    () => createIOSNativeHeaderOptions(headerTintColor),
    [headerTintColor],
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
  const addTabRole: TabRole | undefined = supportsSeparateAddTabButton()
    ? 'search'
    : undefined;
  const activeTintColor = resolveColor(tabActive, resolveColor(primary, '#0A84FF'));
  const inactiveTintColor = resolveColor(tabInactive, '#8E8E93');
  const AddScreen = React.useCallback(
    () => <AddRedirectScreen getLastActiveTab={getLastActiveTab} />,
    [getLastActiveTab],
  );

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1">
      <NativeTab.Navigator
        initialRouteName="Dashboard"
        tabBarActiveTintColor={activeTintColor}
        tabBarInactiveTintColor={inactiveTintColor}
        screenListeners={({ navigation }) => {
          tabsNavigation = navigation;

          return {
            state: (event) => {
              const state = event.data?.state;
              if (!state?.routes) return;
              const route = state.routes[state.index ?? 0];
              if (route) rememberActiveTab(route.name);
            },
          };
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
        component={AddScreen}
        options={{
          tabBarLabel: 'Add',
          tabBarIcon: () => ADD_TAB_ICON,
          role: addTabRole,
          preventsDefault: true,
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            onAddPress?.();
          },
        }}
      />
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
      {/* Native UITabBar does not expose a custom tabBar slot. Pin the HUD
          just above the native bar so it keeps the original "above tab bar"
          placement without moving to the top of the tab screen. */}
      <View
        pointerEvents="box-none"
        className="absolute inset-x-0 z-50"
        style={{ bottom: insets.bottom + 49 }}
      >
        <ActiveWorkoutBar variant="embedded" />
      </View>
    </View>
  );
}

export function FallbackTabsLayout({
  onAddPress,
  rememberActiveTab,
  getLastActiveTab,
}: { onAddPress?: () => void } & TabTrackingProps) {
  const AddScreen = React.useCallback(
    () => <AddRedirectScreen getLastActiveTab={getLastActiveTab} />,
    [getLastActiveTab],
  );

  // The AddSheet is rendered in App.tsx with proper props
  return (
    <FallbackTab.Navigator
      initialRouteName="Dashboard"
      screenListeners={({ navigation }) => {
        tabsNavigation = navigation;

        return {
          state: (event) => {
            const state = event.data?.state;
            if (!state?.routes) return;
            const route = state.routes[state.index ?? 0];
            if (route) rememberActiveTab(route.name);
          },
        };
      }}
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <View collapsable={false}>
          <ActiveWorkoutBar variant="embedded" />
          <CustomTabBar {...props} />
        </View>
      )}
    >
      <FallbackTab.Screen name="Dashboard" component={SafeDashboard} />
      <FallbackTab.Screen name="Diary" component={SafeDiary} />
      <FallbackTab.Screen
        name="Add"
        component={AddScreen}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            onAddPress?.();
          },
        }}
      />
      <FallbackTab.Screen name="Library" component={SafeLibrary} />
      <FallbackTab.Screen name="Settings" component={SettingsScreen} />
    </FallbackTab.Navigator>
  );
}

// Main export - uses native tabs on iOS, fallback on Android
export function TabsLayout({
  onAddPress,
  rememberActiveTab,
  getLastActiveTab,
}: { onAddPress?: () => void } & TabTrackingProps) {
  if (Platform.OS === 'ios') {
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
