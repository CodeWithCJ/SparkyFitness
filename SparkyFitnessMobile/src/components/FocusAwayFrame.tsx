import React from 'react';
import { View } from 'react-native';
import { useCSSVariable } from 'uniwind';

interface Props {
  testID?: string;
  /** Gap between the children, like the page's own stack. */
  className?: string;
  children: React.ReactNode;
}

/**
 * The look of every page for an exercise (or superset) that is not the current
 * one: a dashed border around slightly dimmed content. The page inside stays
 * interactive.
 */
function FocusAwayFrame({
  testID = 'focus-away-frame',
  className,
  children,
}: Props) {
  const borderStrong = useCSSVariable('--color-border-strong') as string;
  return (
    <View
      testID={testID}
      className="rounded-3xl p-3"
      style={{
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: borderStrong,
      }}
    >
      <View className={className} style={{ opacity: 0.7 }}>
        {children}
      </View>
    </View>
  );
}

export default FocusAwayFrame;
