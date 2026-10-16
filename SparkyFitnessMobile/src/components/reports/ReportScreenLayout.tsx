import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ReportRangeControl from './ReportRangeControl';
import { useActiveWorkoutBarPadding } from '../ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../../services/nativeTabBarPreference';
import type { CustomRange, ReportRange } from '../../utils/trendRange';

interface ReportScreenLayoutProps {
  /** The element returned by `useScreenHeader` (null on the native-header path). */
  header: React.ReactNode;
  /** Omit for a screen that has no window to pick. */
  range?: ReportRange;
  onRangeChange?: (range: ReportRange) => void;
  /** With `onCustomRangeChange`, adds a Custom option that opens a date-range picker. */
  customRange?: CustomRange | null;
  onCustomRangeChange?: (range: CustomRange) => void;
  children: React.ReactNode;
}

/**
 * The scaffold every Reports screen shares: safe-area padding, the screen header, a 7/30/90
 * day control and a scrolling body clear of the active-workout bar.
 */
const ReportScreenLayout: React.FC<ReportScreenLayoutProps> = ({
  header,
  range,
  onRangeChange,
  customRange,
  onCustomRangeChange,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {range && onRangeChange ? (
          <View className="mb-2">
            <ReportRangeControl
              range={range}
              onRangeChange={onRangeChange}
              customRange={customRange}
              onCustomRangeChange={onCustomRangeChange}
            />
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
};

export default ReportScreenLayout;
