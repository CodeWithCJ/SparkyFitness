declare module 'react-native-bottom-tabs' {
  import type * as React from 'react';
  import type { ColorValue, ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';

  export type AppleIcon = {
    sfSymbol: string;
  };

  export type TabRole = 'search';
  export type LayoutDirection = 'locale' | 'ltr' | 'rtl';

  export interface TabViewProps {
    navigationState: {
      index: number;
      routes: Array<{
        key: string;
        routeName?: string;
        focusedIcon?: ImageSourcePropType | AppleIcon;
        unfocusedIcon?: ImageSourcePropType | AppleIcon;
        role?: TabRole;
      }>;
    };
    onIndexChange: (index: number) => void;
    renderScene: (props: { route: { key: string; routeName?: string } }) => React.ReactNode;
    getIcon?: (props: { route: { key: string; routeName?: string }; focused: boolean }) => ImageSourcePropType | AppleIcon;
    getLabelText?: (props: { route: { key: string; routeName?: string } }) => string;
    getBadge?: (props: { route: { key: string; routeName?: string } }) => string | undefined;
    getActiveTintColor?: (props: { route: { key: string; routeName?: string } }) => string;
    getRole?: (props: { route: { key: string; routeName?: string } }) => TabRole | undefined;
    getPreventsDefault?: (props: { route: { key: string; routeName?: string } }) => boolean | undefined;
    tabBarActiveTintColor?: ColorValue;
    tabBarInactiveTintColor?: ColorValue;
    layoutDirection?: LayoutDirection;
    sceneStyle?: StyleProp<ViewStyle>;
  }

  const TabView: React.FC<TabViewProps>;
  export default TabView;
}
