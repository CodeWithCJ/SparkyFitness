import React from 'react';
import { View, TouchableOpacity, Text, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Icon, { type IconName } from './Icon';

export const TAB_BAR_HEIGHT = 56;

const TAB_ICONS: Record<string, IconName> = {
  Dashboard: 'tab-dashboard',
  Diary: 'book',
  Workouts: 'tab-workouts',
  Settings: 'settings',
};

const CustomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const [chrome, chromeBorder, tabActive, tabInactive, accentPrimary] =
    useCSSVariable([
      '--color-chrome',
      '--color-chrome-border',
      '--color-tab-active',
      '--color-tab-inactive',
      '--color-accent-primary',
    ]) as [string, string, string, string, string];

  return (
    <View
      className="flex-row items-end overflow-visible"
      style={{
        backgroundColor: chrome,
        borderTopColor: chromeBorder,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingBottom: Math.max(insets.bottom, 4),
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const isAddButton = route.name === 'Add';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!event.defaultPrevented && !isFocused) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        if (isAddButton) {
          return (
            <View key={route.key} className="flex-1 items-center justify-end pb-1">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={options.tabBarAccessibilityLabel ?? 'Add'}
                onPress={onPress}
                onLongPress={onLongPress}
                activeOpacity={0.8}
                className="w-14 h-14 rounded-full items-center justify-center -mt-5"
                style={{
                  backgroundColor: accentPrimary,
                  ...Platform.select({
                    ios: {
                      shadowColor: '#000',
                      shadowOffset: { width: 2, height: 4 },
                      shadowOpacity: 0.25,
                      shadowRadius: 6,
                    },
                    android: {
                      elevation: 4,
                    },
                  }),
                }}
              >
                <Icon name="add" size={28} color="#FFFFFF" weight="bold" />
              </TouchableOpacity>
            </View>
          );
        }

        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : options.title ?? route.name;
        const iconName = TAB_ICONS[route.name];
        const tintColor = isFocused ? tabActive : tabInactive;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : undefined}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            className="flex-1 items-center justify-center pt-2 pb-1 gap-0.5"
          >
            {iconName && (
              <Icon
                name={iconName}
                size={24}
                color={tintColor}
                weight={isFocused ? 'bold' : 'regular'}
              />
            )}
            <Text
              className={`text-[10px] ${isFocused ? 'font-semibold' : 'font-medium'}`}
              style={{ color: tintColor }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default CustomTabBar;
